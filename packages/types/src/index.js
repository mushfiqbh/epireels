/**
 * @epireels/types
 *
 * Cross-app shared types. Every constant here is consumed by at least one of
 * `apps/web`, `apps/api`, or `apps/mobile`. Keep this package dependency-free
 * so it never bloats the install graph.
 */
/** Create a branded ID — use this at the boundary, not the type itself. */
export const asId = (value) => value;
