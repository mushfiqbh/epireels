import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { Request } from 'express';
import {
  COOKIE_ACCESS,
  type JwtPayload,
} from '../../modules/auth/auth.service';

/**
 * Global JWT guard.
 *
 * Reads the access JWT from the `aep_at` HttpOnly cookie. Routes
 * decorated with `@Public()` are skipped entirely. A missing or
 * invalid token yields `401 UNAUTHORIZED`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-cookie') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  /** Pull the JWT out of the cookie before passport tries to verify it. */
  override getRequest(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const cookieToken = (req.cookies?.[COOKIE_ACCESS] as string | undefined) ?? '';
    // Passport will read `req.headers.authorization`; we synthesise a
    // Bearer header from the cookie so the same JwtStrategy can verify
    // either source.
    req.headers.authorization = cookieToken
      ? `Bearer ${cookieToken}`
      : (req.headers.authorization ?? '');
    return req;
  }

  override handleRequest<T = JwtPayload>(
    err: unknown,
    user: T | false,
    info: unknown,
  ): T {
    if (err || !user) {
      const reason =
        (err as Error | undefined)?.message ??
        (typeof info === 'object' && info && 'message' in info
          ? String((info as { message: unknown }).message)
          : 'missing or invalid token');
      throw new UnauthorizedException(reason);
    }
    return user as T;
  }
}
