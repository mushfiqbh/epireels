/**
 * Video-related types — re-exported from the shared `@epireels/types`
 * package so the API controllers, services, the front-end adapter, and
 * the React components all agree on the wire shape.
 */
export type { VideoProcessingStatus, VideoPlaybackDto } from '@epireels/types';

/** Runtime constants used by the processing pipeline. Mirrors
 *  `VideoProcessingStatus`. */
export const VIDEO_PROCESSING_STATUS = {
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;

export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
}
