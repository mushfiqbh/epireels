import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '../auth.service';
import { ConfigService } from '@nestjs/config';

/**
 * Passport strategy that validates the access JWT.
 *
 * The token is read from the `Authorization: Bearer …` header that
 * `JwtAuthGuard.getRequest` synthesises from the `aep_at` cookie, so
 * the same strategy covers both header- and cookie-based clients
 * (mobile can keep using `Authorization: Bearer` while the web app
 * relies on the cookie).
 */
@Injectable()
export class JwtCookieStrategy extends PassportStrategy(Strategy, 'jwt-cookie') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a string of at least 32 characters',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /** Whatever this returns becomes `req.user`. */
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
