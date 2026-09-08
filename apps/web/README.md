# `@epireels/web`

Next.js 15 (App Router) + React 19 + Tailwind v4.

```bash
pnpm --filter @epireels/web dev
# → http://localhost:3000
```

Consumes `@epireels/types` for shared types (e.g. `HealthSnapshot`).

Set `NEXT_PUBLIC_API_BASE_URL` to point at the NestJS API (defaults to
`http://localhost:4000`).
