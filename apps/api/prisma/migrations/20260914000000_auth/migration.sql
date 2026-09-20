-- =============================================================================
-- User authentication + per-user uploads
-- =============================================================================
-- Adds:
--   * users.role
--   * refresh_tokens
--   * uploads (per-user upload rows that own videos)
--   * saves  (favourite / bookmark reel rows)
--   * comments
--   * videos.upload_id
-- Backfills a synthetic `system` user so any pre-existing videos are still
-- owned by something, then attaches one Upload row per existing video.

-- AlterTable: users
ALTER TABLE "users"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';

-- CreateTable: refresh_tokens
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: uploads
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "uploads_owner_id_idx" ON "uploads"("owner_id");

ALTER TABLE "uploads"
  ADD CONSTRAINT "uploads_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: saves
CREATE TABLE "saves" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saves_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saves_user_id_episode_id_key" ON "saves"("user_id", "episode_id");
CREATE INDEX "saves_user_id_idx" ON "saves"("user_id");

ALTER TABLE "saves"
  ADD CONSTRAINT "saves_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saves"
  ADD CONSTRAINT "saves_episode_id_fkey"
  FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: comments
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comments_episode_id_created_at_idx" ON "comments"("episode_id", "created_at");
CREATE INDEX "comments_user_id_idx" ON "comments"("user_id");

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_episode_id_fkey"
  FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: videos
ALTER TABLE "videos" ADD COLUMN "upload_id" TEXT;

CREATE INDEX "videos_upload_id_idx" ON "videos"("upload_id");

ALTER TABLE "videos"
  ADD CONSTRAINT "videos_upload_id_fkey"
  FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: ensure a synthetic `system` user exists so pre-auth videos still
-- have an owner. The password hash is a known-bcrypt string that can never
-- match a real sign-in attempt (it is a unique value, not a plaintext password).
INSERT INTO "users" (
  "id", "email", "username", "password_hash", "display_name", "role", "created_at", "updated_at"
) VALUES (
  'system_user',
  'system@epireels.internal',
  '__system__',
  '!invalid-do-not-use',
  'System',
  'system',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- One Upload row per existing video so the ownership chain is consistent.
INSERT INTO "uploads" ("id", "owner_id", "title", "status", "created_at", "updated_at")
SELECT
  'upload_' || "videos"."id",
  'system_user',
  COALESCE("episodes"."title", 'Untitled reel'),
  COALESCE("videos"."processing_status", 'UPLOADED'),
  "videos"."created_at",
  "videos"."updated_at"
FROM "videos"
LEFT JOIN "episodes" ON "episodes"."id" = "videos"."episode_id"
ON CONFLICT ("id") DO NOTHING;

UPDATE "videos"
SET "upload_id" = 'upload_' || "videos"."id"
WHERE "upload_id" IS NULL;
