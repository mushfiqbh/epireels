/**
 * Series DTOs — re-exported from the shared `@epireels/types` package so
 * the API controllers, services, the front-end adapter, and the React
 * components all see the same wire shape.
 *
 * The historical module-local `class` definitions were removed; consumers
 * should import the `SeriesResponseDto` / `SeriesSummaryDto` /
 * `SeriesStatus` symbols from `@epireels/types` (or from this module,
 * which just re-exports them).
 */
export type {
  SeriesResponseDto,
  SeriesSummaryDto,
  SeriesStatus,
} from '@epireels/types';
