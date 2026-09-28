import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AuthService,
  COOKIE_ACCESS,
  COOKIE_CSRF,
  COOKIE_REFRESH,
} from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { signCsrfToken } from '../../common/guards/csrf.guard';
import { ConfigService } from '@nestjs/config';

/**
 * Auth endpoints.
 *
 *   POST /api/v1/auth/signup    Create a member account + log in.
 *   POST /api/v1/auth/login     Verify password, issue cookies.
 *   POST /api/v1/auth/refresh   Rotate the refresh token.
 *   POST /api/v1/auth/logout    Revoke the refresh token, clear cookies.
 *   GET  /api/v1/auth/me        Return the current user + csrf token.
 */
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(201)
  async signup(
    @Body() dto: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, user } = await this.auth.signup(dto, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.applySessionCookies(res, session);
    return { user };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, user } = await this.auth.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.applySessionCookies(res, session);
    return { user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req.cookies?.[COOKIE_REFRESH] as string | undefined) ?? '';
    if (!raw) {
      throw new UnauthorizedException('Refresh cookie missing');
    }
    const { session, user } = await this.auth.rotateRefresh(raw, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.applySessionCookies(res, session);
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req.cookies?.[COOKIE_REFRESH] as string | undefined);
    if (raw) {
      await this.auth.revokeRefresh(raw);
    }
    this.clearSessionCookies(res);
    return;
  }

  @Get('me')
  async me(
    @CurrentUser() payload: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    // Rotate the CSRF cookie on each `/me` so the client always has a
    // fresh token that we can invalidate server-side at logout.
    const csrfToken = this.rotateCsrfCookie(res);
    return this.auth.buildBootstrap(user, csrfToken);
  }

  /**
   * Build the cookie attribute set used for every session cookie.
   *
   * In production the front-end (`https://epireels.netlify.app`) lives on
   * a different site than the API (`https://api.barnomala.com`), so we
   * MUST use `SameSite=None; Secure` — otherwise the browser refuses to
   * attach `aep_at` / `aep_rt` on cross-site navigation and every
   * authenticated request 401s. Local dev keeps `lax` so the cookies
   * still work without HTTPS.
   */
  private sessionCookieAttrs(): {
    sameSite: 'none' | 'lax';
    secure: boolean;
  } {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    };
  }

  private applySessionCookies(
    res: Response,
    session: { accessToken: string; refreshToken: string; csrfToken: string },
  ): void {
    const { sameSite, secure } = this.sessionCookieAttrs();
    const accessTtl = this.auth.accessTtlMs;
    const refreshTtl = this.auth.refreshTtlMs;
    const baseCookie = {
      httpOnly: true,
      sameSite,
      secure,
      path: '/',
    };
    res.cookie(COOKIE_ACCESS, session.accessToken, {
      ...baseCookie,
      maxAge: accessTtl,
    });
    res.cookie(COOKIE_REFRESH, session.refreshToken, {
      ...baseCookie,
      maxAge: refreshTtl,
    });
    const signed = signCsrfToken(session.csrfToken, this.jwtSecret);
    res.cookie(COOKIE_CSRF, signed, {
      httpOnly: false, // readable by JS so the client can echo it back
      sameSite,
      secure,
      path: '/',
      maxAge: refreshTtl,
    });
  }

  private clearSessionCookies(res: Response): void {
    const { sameSite, secure } = this.sessionCookieAttrs();
    for (const name of [COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_CSRF]) {
      // The attributes MUST match the ones used when the cookie was set,
      // otherwise the browser keeps the original cookie instead of clearing
      // it. With SameSite=None + Secure this matters more than ever.
      res.clearCookie(name, {
        path: '/',
        sameSite,
        secure,
      });
    }
  }

  /** Mint + set a fresh CSRF cookie; returns the unsigned token value. */
  private rotateCsrfCookie(res: Response): string {
    const raw = generateOpaqueToken(24);
    const signed = signCsrfToken(raw, this.jwtSecret);
    const { sameSite, secure } = this.sessionCookieAttrs();
    res.cookie(COOKIE_CSRF, signed, {
      httpOnly: false,
      sameSite,
      secure,
      path: '/',
      maxAge: this.auth.refreshTtlMs,
    });
    return raw;
  }


  private get jwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return secret;
  }
}

function generateOpaqueToken(bytes: number): string {
  // Use dynamic import-compatible shape so this works under ts-jest too.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto');
  return randomBytes(bytes).toString('base64url');
}
