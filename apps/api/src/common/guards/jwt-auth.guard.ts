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
 * Reads the access JWT from the `aep_at` HttpOnly cookie. Routes decorated
 * with `@Public()` are skipped entirely.
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

  override getRequest(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const cookieToken = (req.cookies as Record<string, unknown> | undefined)?.[
      COOKIE_ACCESS
    ];
    if (typeof cookieToken === 'string') {
      req.headers.authorization = `Bearer ${cookieToken}`;
    }
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
          ? String(info.message)
          : 'missing or invalid token');
      throw new UnauthorizedException(reason);
    }
    return user;
  }
}
