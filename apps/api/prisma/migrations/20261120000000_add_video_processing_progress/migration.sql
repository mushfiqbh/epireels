ALTER TABLE "videos"
ADD COLUMN "processing_progress" INTEGER NOT NULL DEFAULT 0;

UPDATE "videos"
SET "processing_progress" = 100
WHERE "processing_status" = 'READY';
