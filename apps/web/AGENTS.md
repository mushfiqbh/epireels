# Agent notes — apps/web

- Read the relevant docs in `node_modules/next/dist/docs/` before writing
  Next.js code (App Router conventions change between majors).
- Use `@epireels/types` for any type shared with the API or mobile app — do not
  re-declare DTOs locally.
- Do not import from `apps/*` or `packages/*` other than `@epireels/*`.
