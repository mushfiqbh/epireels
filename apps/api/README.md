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

Copy `.env.example` to `.env` and tweak. All keys are optional in dev — sane defaults are baked in.

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

Add new feature modules under `src/modules/<feature>/` and import them in `app.module.ts`.

## Processing videos (HLS)

`VideoProcessor` shells out to `ffmpeg` + `ffprobe` to produce an HLS ladder (360p + 720p) plus a poster thumbnail. The processor is invoked automatically by `POST /api/v1/admin/uploads`; you only need to make sure the binaries are on `PATH` (or pointed at via env vars).

### Install ffmpeg

| OS | Command |
| -- | ------- |
| Windows | `winget install Gyan.FFmpeg` |
| Windows (Chocolatey) | `choco install ffmpeg` |
| Windows (Scoop) | `scoop install ffmpeg` |
| macOS | `brew install ffmpeg` |
| Debian/Ubuntu | `sudo apt-get install ffmpeg` |

After installing, restart the API so the new `PATH` is picked up.

### Verify the install

```bash
pnpm --filter @epireels/api ffmpeg:check
```

The script resolves `ffmpeg` and `ffprobe` (env override → `PATH` → common Windows install dirs) and exits non-zero if either binary is missing — wire it into CI.

You can override the binary locations explicitly via `FFMPEG_PATH` / `FFPROBE_PATH` in `apps/api/.env` if you'd rather not add ffmpeg to `PATH`.

### Partial-success behaviour

The processor is deliberately fault-tolerant:

- The poster is **best-effort** — if it fails, the row still flips to `READY` and the player falls back to the per-episode thumbnail.
- Each rendition is rendered independently. The 360p playlist ships the moment it lands on disk, so the player starts streaming while 720p is still encoding.
- The master playlist only advertises renditions whose `playlist.m3u8` actually exists, so a 720p failure won't hand the browser a broken variant.
- If **every** rendition fails, the row is flipped to `FAILED` and the disk is cleaned up.

### Debug a failed upload

```sql
SELECT id, processing_status, processing_error
FROM videos
WHERE processing_status IN ('FAILED', 'PROCESSING')
ORDER BY updated_at DESC;
```

The `processing_error` column is truncated to 4000 chars but always contains the actionable detail (e.g. the `ENOENT` hint pointing at `winget install Gyan.FFmpeg`, the ffmpeg `stderr` tail, or the exact `execFile` rejection).
