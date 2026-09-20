import { SetMetadata } from '@nestjs/common';

/** Metadata key used by `JwtAuthGuard` to skip auth on a route. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a controller route as public — `JwtAuthGuard` will skip token
 * verification for it. Use this on read endpoints (catalog browse,
 * playback manifest) that should stay anonymous-friendly.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
