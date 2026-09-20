import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../../modules/auth/auth.service';

/**
 * Restrict a route to one or more roles.
 *
 * Reads the JWT payload set by `JwtAuthGuard` off `req.user` and
 * checks its `role` claim against the values passed to `@Roles(...)`.
 *
 * Runs AFTER `JwtAuthGuard`, so absence of `req.user` is treated as
 * "no roles allowed" rather than "anonymous".
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException(
        `This action requires role: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
