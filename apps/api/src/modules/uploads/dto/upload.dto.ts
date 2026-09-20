/**
 * DTOs returned by the upload endpoint — re-exported from the
 * shared `@epireels/types` package so the API controllers and the
 * React components all agree on the wire shape.
 */
export type { AdminUploadResponseDto } from '@epireels/types';

/**
 * Minimal subset of multer's file shape that we rely on. Defined
 * locally so this module compiles even when the express types are not
 * imported transitively.
 */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
