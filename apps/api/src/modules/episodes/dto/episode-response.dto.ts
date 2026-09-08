export type EpisodeStatus = 'draft' | 'published' | 'archived';

export class VideoMediaDto {
  url!: string;
  type!: string;
}

export class EpisodeResponseDto {
  id!: string;
  title!: string;
  number!: number;
  duration?: number;
  status!: EpisodeStatus;
  video!: VideoMediaDto | null;
  thumbnailUrl!: string | null;
  /** Short description / show-notes for the episode. */
  synopsis?: string;
  /** Synthetic engagement metrics — front-end fills defaults when absent. */
  likes?: number;
  /** Synthetic engagement metrics — front-end fills defaults when absent. */
  commentsCount?: number;
  /** Creator / author display name for the episode. */
  creator?: string;
}