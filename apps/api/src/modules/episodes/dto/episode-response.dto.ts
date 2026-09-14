/**
 * Episode DTOs — re-exported from the shared `@epireels/types` package so
 * every API route, the front-end client, and the React components agree
 * on the wire shape.
 *
 * The historical module-local `class` definitions were removed; consumers
 * should import the `EpisodeResponseDto` / `EpisodeStatus` symbols from
 * `@epireels/types` (or from this module, which just re-exports them).
 */
export type {
  EpisodeResponseDto,
  EpisodeStatus,
  VideoMediaDto,
} from '@epireels/types';
