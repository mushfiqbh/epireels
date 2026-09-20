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

  // ---------------------------------------------------------------- helpers

  private applySessionCookies(
    res: Response,
    session: { accessToken: string; refreshToken: string; csrfToken: string },
  ): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const accessTtl = this.auth.accessTtlMs;
    const refreshTtl = this.auth.refreshTtlMs;
    const baseCookie = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isProd,
      path: '/',
    };
    res.cookie(COOKIE_ACCESS, session.accessToken, {
      ...baseCookie,
      maxAge: accessTtl,
    });
    res.cookie(COOKIE_REFRESH, session.refreshToken, {
      ...baseCookie,
      sameSite: 'strict',
      maxAge: refreshTtl,
    });
    const signed = signCsrfToken(session.csrfToken, this.jwtSecret);
    res.cookie(COOKIE_CSRF, signed, {
      httpOnly: false, // readable by JS so the client can echo it back
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: refreshTtl,
    });
  }

  private clearSessionCookies(res: Response): void {
    for (const name of [COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_CSRF]) {
      res.clearCookie(name, { path: '/' });
    }
  }

  /** Mint + set a fresh CSRF cookie; returns the unsigned token value. */
  private rotateCsrfCookie(res: Response): string {
    const raw = generateOpaqueToken(24);
    const signed = signCsrfToken(raw, this.jwtSecret);
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie(COOKIE_CSRF, signed, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProd,
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
