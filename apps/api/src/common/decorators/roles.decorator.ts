import { SetMetadata } from '@nestjs/common';

/** Metadata key consumed by `RolesGuard`. */
export const ROLES_KEY = 'roles';

/**
 * Restrict a route to one or more role names. Combine with `RolesGuard`
 * registered as `APP_GUARD` — guards are skipped when this metadata is
 * absent, so opt-in only.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
