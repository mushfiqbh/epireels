export const VIDEO_PROCESSING_STATUS = {
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;

export type VideoProcessingStatus =
  (typeof VIDEO_PROCESSING_STATUS)[keyof typeof VIDEO_PROCESSING_STATUS];

export interface VideoPlaybackDto {
  videoId: string;
  status: string;
  posterUrl?: string;
  manifestUrl?: string;
  error?: string;
}

export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
}
