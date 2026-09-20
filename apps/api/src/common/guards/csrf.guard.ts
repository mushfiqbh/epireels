import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { COOKIE_CSRF, COOKIE_ACCESS } from '../../modules/auth/auth.service';

/**
 * Double-submit cookie CSRF guard.
 *
 * For every non-`@Public()` request using a non-safe method
 * (anything other than GET / HEAD / OPTIONS), the value of the
 * `X-CSRF-Token` request header must match the `aep_csrf` cookie.
 *
 * To make the cookie value unforgeable while remaining readable by
 * JavaScript, we sign it with HMAC-SHA256 using the JWT secret.
 * `verifyCsrfToken` verifies that the signature is genuine before
 * the timing-safe compare runs.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    const safe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (safe) return true;

    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const headerToken =
      (req.headers['x-csrf-token'] as string | undefined) ?? '';
    const cookieToken = cookies[COOKIE_CSRF] ?? '';

    if (!headerToken || !cookieToken) {
      throw new ForbiddenException('CSRF token missing');
    }
    if (!safeEqualStrings(headerToken, cookieToken)) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    // For state-changing requests we also require the access cookie to
    // be present. This guards against a stale CSRF cookie being replayed
    // after the user logged out.
    if (!cookies[COOKIE_ACCESS]) {
      throw new ForbiddenException('Session cookie missing');
    }

    return true;
  }
}

/** Constant-time string compare; falls back to false on length mismatch. */
function safeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Helper used by `AuthController` to mint signed CSRF values. */
export function signCsrfToken(raw: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

/** Verify a signed token issued by `signCsrfToken`. */
export function verifyCsrfToken(signed: string, secret: string): string | null {
  const dot = signed.lastIndexOf('.');
  if (dot < 0) return null;
  const raw = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(raw).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  return timingSafeEqual(sigBuf, expBuf) ? raw : null;
}
