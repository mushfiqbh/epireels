/**
 * DTOs returned by the admin upload endpoint — re-exported from the
 * shared `@epireels/types` package so the admin form, the API
 * controllers, and the React components all agree on the wire shape.
 *
 * The historical module-local `interface` definition was removed;
 * consumers should import `AdminUploadResponseDto` from `@epireels/types`
 * (or from this module, which just re-exports it).
 */
export type { AdminUploadResponseDto } from '@epireels/types';
