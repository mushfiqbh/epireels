# `@epireels/api`

NestJS 11 REST API on Node 20+.

```bash
pnpm --filter @epireels/api dev
# → http://localhost:4000/api/v1/health
```

## Endpoints

| Method | Path                | Description                |
| ------ | ------------------- | -------------------------- |
| GET    | `/api/v1`           | Hello-message probe.       |
| GET    | `/api/v1/health`    | Uptime / health snapshot.  |

## Env

Copy `.env.example` to `.env` and tweak. All keys are optional in dev — sane
defaults are baked in.

## Architecture

```
src/
├── main.ts                    # bootstrap, CORS, JSON parser
├── app.module.ts              # root module
├── app.controller.ts          # top-level routes
├── app.service.ts             # top-level handlers
└── modules/
    └── storage/               # pluggable storage driver (local / s3 later)
```

Add new feature modules under `src/modules/<feature>/` and import them in
`app.module.ts`.
