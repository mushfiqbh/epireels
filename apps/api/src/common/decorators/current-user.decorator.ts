import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/auth.service';

/**
 * Inject the authenticated user into a controller method.
 *
 * Pulls the `JwtPayload` out of `req.user` (populated by `JwtAuthGuard`)
 * and exposes the same shape consistently across handlers. Throws 401
 * if the guard has not run on the route.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }
    return req.user;
  },
);
