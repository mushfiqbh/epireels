-- AlterTable
ALTER TABLE "videos"
ADD COLUMN "processing_status" TEXT NOT NULL DEFAULT 'UPLOADED',
ADD COLUMN "thumbnail_path" TEXT,
ADD COLUMN "stream_path" TEXT,
ADD COLUMN "processing_error" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
