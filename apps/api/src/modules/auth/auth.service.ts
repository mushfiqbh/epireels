import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthBootstrap, SignupInput, UserRole } from '@epireels/types';
import { asId } from '@epireels/types';

/** Cookie names — shared with the Next.js client. */
export const COOKIE_ACCESS = 'aep_at';
export const COOKIE_REFRESH = 'aep_rt';
export const COOKIE_CSRF = 'aep_csrf';

/** Parse a duration string ("15m", "7d", "3600s") into milliseconds. */
function parseDuration(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(value.trim());
  if (!match) return fallbackMs;
  const n = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const mult =
    unit === 'd' ? 24 * 60 * 60 : unit === 'h' ? 60 * 60 : unit === 'm' ? 60 : 1;
  return n * mult * 1000;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface SessionPair {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export interface PublicAuthUser {
  id: import('@epireels/types').ID;
  email?: string;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
}

/**
 * AuthService — issues and verifies session credentials.
 *
 * The access JWT is signed with `JWT_SECRET` and lives for 15 minutes; the
 * refresh token is opaque (32 random bytes, base64url) and stored only as
 * its sha256 hash in `refresh_tokens`. Rotating on every refresh lets us
 * detect stolen tokens and revoke a whole chain by marking a row revoked.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Access JWT lifetime in milliseconds (read from `JWT_EXPIRES_IN`). */
  get accessTtlMs(): number {
    return parseDuration(
      this.config.get<string>('JWT_EXPIRES_IN'),
      15 * 60 * 1000,
    );
  }

  /** Refresh-token lifetime in milliseconds (read from `REFRESH_EXPIRES_IN`). */
  get refreshTtlMs(): number {
    return parseDuration(
      this.config.get<string>('REFRESH_EXPIRES_IN'),
      7 * 24 * 60 * 60 * 1000,
    );
  }

  /** Hash a plaintext password with bcrypt cost 12. */
  static hashPassword(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, 12);
  }

  /** Issue a new session pair (access JWT + opaque refresh + csrf). */
  async issueSession(
    user: User,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<SessionPair> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    } satisfies JwtPayload);

    const refreshToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent: meta?.userAgent,
        ip: meta?.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
      csrfToken,
      expiresAt,
    };
  }

  /** Map a Prisma `User` row to the public-safe shape returned to clients. */
  static toPublic(user: User): PublicAuthUser {
    return {
      // The shared `PublicUser.id` is a branded `ID`; brand-cast through
      // `asId()` so we don't have to `as unknown as` everywhere downstream.
      id: asId(user.id),
      email: user.email,
      // Prisma exposes `displayName`/`avatarUrl` as nullable; the wire type
      // promises a string for `displayName` and `string | undefined` for the
      // optional avatar. Coerce to a defensive empty string when missing.
      displayName: user.displayName ?? '',
      avatarUrl: user.avatarUrl ?? undefined,
      role: user.role as UserRole,
    };
  }

  /** Create a brand-new member account and immediately log them in. */
  async signup(
    input: SignupInput,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ session: SessionPair; user: PublicAuthUser }> {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true, email: true, username: true },
    });
    if (existing) {
      throw new ConflictException('Email or username is already taken');
    }

    const passwordHash = await AuthService.hashPassword(input.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        displayName: input.displayName,
        role: 'member',
      },
    });

    const session = await this.issueSession(user, meta);
    return { session, user: AuthService.toPublic(user) };
  }

  /** Verify credentials and mint a new session. */
  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ session: SessionPair; user: PublicAuthUser }> {
    const normalised = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalised },
    });
    // Constant-time-ish: always run bcrypt.compare to avoid timing leaks.
    const valid =
      user !== null &&
      (await bcrypt.compare(password, user.passwordHash));
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const session = await this.issueSession(user, meta);
    return { session, user: AuthService.toPublic(user) };
  }

  /**
   * Rotate the refresh token. The supplied raw token must match a row in
   * `refresh_tokens` that is neither revoked nor expired. We mark the old
   * row revoked and issue a brand new session.
   */
  async rotateRefresh(
    rawRefreshToken: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ session: SessionPair; user: PublicAuthUser }> {
    const tokenHash = hashToken(rawRefreshToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (
      !row ||
      row.revokedAt !== null ||
      row.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const session = await this.issueSession(row.user, meta);
    return { session, user: AuthService.toPublic(row.user) };
  }

  /** Revoke a single refresh row (used by logout). */
  async revokeRefresh(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken
      .update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      })
      .catch(() => {
        // Ignore missing rows — logout is idempotent.
      });
  }

  /** Look up the user backing a verified JWT payload. */
  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Return the bootstrap shape (`{ user, csrfToken }`) for a given user. */
  async buildBootstrap(user: User, csrfToken: string): Promise<AuthBootstrap> {
    const pub = AuthService.toPublic(user);
    return {
      user: {
        id: pub.id,
        email: pub.email,
        displayName: pub.displayName,
        avatarUrl: pub.avatarUrl,
        role: user.role as UserRole,
      },
      csrfToken,
    };
  }

  /** Total seconds an issued access token lives, for cache headers. */
  get accessTtlSeconds(): number {
    return this.accessTtlMs / 1000;
  }
}

/** sha256 hex of a token — used to look refresh rows up by hash. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
