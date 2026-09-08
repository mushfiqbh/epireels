# Acme — pnpm Monorepo Starter

A batteries-included **pnpm + Turbo** monorepo you can clone to start any new project.

## Prerequisites

- Node.js `24.19.x`
- pnpm `10.10.0` or newer
- Git

Check the installed versions:

```bash
node --version
pnpm --version
git --version
```

## Clone and install

```bash
git clone https://github.com/mushfiqbh/acme
cd acme
pnpm install --frozen-lockfile
```

For a development install where the lockfile may be updated, use `pnpm install` instead.

## Structure

```
.
├── apps/
│   ├── web/        # Next.js 16 (App Router, React 19, Tailwind v4)
│   ├── api/        # NestJS 11 (REST under /api/v1)
│   └── mobile/     # React Native (Expo SDK 53)
└── packages/
    └── types/      # Shared TypeScript types (consumed by all apps)
```

All apps depend on `@epireels/types` via the workspace protocol — edit
`packages/types/src/index.ts` and every app picks up the change after a rebuild.

## Environment setup

Copy `apps/api/.env.example` to `apps/api/.env` and edit the values as needed.
Copy `apps/web/.env.example` to `apps/web/.env` and edit the values as needed.
Copy `apps/mobile/.env.example` to `apps/mobile/.env` and edit the values as needed.

Then run the following commands:

```bash
docker compose -f docker/compose.yml up -d
pnpm --filter @epireels/api db:generate
```

For a hosted PostgreSQL database, set both `DATABASE_URL` and `DIRECT_URL` in
`apps/api/.env`. `DATABASE_URL` is used by the application, while `DIRECT_URL`
is used for Prisma migrations and introspection.

## Quick start

```bash
pnpm install                  # install everything
pnpm dev                      # run all apps in parallel (web + api + mobile)
pnpm dev:api:web              # just the web + api servers
pnpm dev:web                  # just the Next.js dev server
pnpm dev:api                  # just the NestJS dev server
pnpm dev:mobile               # just the Expo dev server (press w/i/a)
```

| App      | Default URL                    |
| -------- | ------------------------------ |
| `web`    | http://localhost:3000          |
| `api`    | http://localhost:4000/api/v1   |
| `mobile` | http://localhost:8081        |

## Tasks

```bash
pnpm build         # build all packages and apps
pnpm lint          # eslint everywhere
pnpm typecheck     # tsc --noEmit everywhere
pnpm test          # jest everywhere
pnpm clean         # remove all build artifacts + node_modules
```

## Renaming

Search/replace `@epireels/*` and the workspace `name` in `package.json` to rebrand.

## Conventions

- **TypeScript** `^5.7`, strict mode, ESM-first where supported.
- **Node** `24.19` (pinned via `.nvmrc` and `engines.node`).
- **pnpm** `>=10`.
- **Turbo** caches build outputs defined in `turbo.json`.
- Apps must not import each other directly — go through `@epireels/types`.

## Adding a new package

1. Create `packages/<name>/package.json` with `"name": "@epireels/<name>"`.
2. Re-export from `src/index.ts`.
3. Add it to `pnpm-workspace.yaml` (already covered by the globs).
4. Run `pnpm install` — it's now available to every workspace app.
