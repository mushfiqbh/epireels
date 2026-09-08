/**
 * Pure-Node MP4 box reader. Extracts duration (seconds) and intrinsic
 * resolution (px) from an MP4 file's `moov` box without spawning
 * `ffprobe`. Covers the cases the admin upload tool needs (H.264 /
 * H.265 / AAC video in `.mp4` / `.mov` / `.m4v` containers) while
 * adding zero native deps to the API container.
 *
 * Why not ffprobe?
 * - Adds an apt dependency to the container (`ffmpeg` is 100MB+).
 * - Spawning a child process per upload is wasteful.
 *
 * For non-MP4 uploads (`.webm`, `.mkv`) the helper returns
 * `{ durationSeconds: 0, width: 0, height: 0 }` so the caller can
 * keep using the Prisma defaults and the client player can still
 * discover the real duration via `<video>` metadata once the file
 * loads in the browser.
 *
 * Reference: ISO/IEC 14496-12 (boxes), QuickTime File Format.
 */

export interface Mp4ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
}

const MP4_TIMESCALE_FALLBACK = 1000;

/**
 * Probe the bytes of an MP4 / QuickTime file. Returns zeros when the
 * buffer is not a parseable MP4 — callers should treat that as "we
 * couldn't extract server-side metadata, let the browser figure it
 * out via `<video>.loadedmetadata`."
 */
export function probeMp4(buffer: Buffer): Mp4ProbeResult {
  if (buffer.length < 16) {
    return { durationSeconds: 0, width: 0, height: 0 };
  }

  // A QuickTime / MP4 container always starts with a `ftyp` box at
  // offset 4. Detect either signature before walking boxes — this
  // keeps us safe from callers handing in arbitrary file types.
  const ftyp = buffer.toString('ascii', 4, 8);
  if (ftyp !== 'ftyp') {
    return { durationSeconds: 0, width: 0, height: 0 };
  }

  // The top-level container is just a chain of (size, type) boxes
  // rooted at offset 0. Walk them and descend into `moov`, which is
  // where the movie-level + track-level metadata lives.
  const topLevel = walkBoxes(buffer, 0, buffer.length);
  const moov = topLevel.find((b) => b.type === 'moov');
  if (!moov) {
    return { durationSeconds: 0, width: 0, height: 0 };
  }

  const moovChildren = walkBoxes(buffer, moov.payloadStart, moov.end);
  const mvhd = moovChildren.find((b) => b.type === 'mvhd');
  const traks = moovChildren.filter((b) => b.type === 'trak');

  let durationSeconds = 0;
  if (mvhd) {
    const mvhdDuration = readMvhdDuration(buffer, mvhd);
    if (mvhdDuration) {
      durationSeconds = mvhdDuration;
    }
  }

  // Pick the first video track's resolution. Falls back to zero when
  // the file has no video track (audio-only uploads).
  let width = 0;
  let height = 0;
  for (const trak of traks) {
    const trakChildren = walkBoxes(buffer, trak.payloadStart, trak.end);
    const tkhd = trakChildren.find((b) => b.type === 'tkhd');
    if (!tkhd) continue;
    const { width: w, height: h } = readTkhdDimensions(buffer, tkhd);
    if (w > 0 && h > 0) {
      width = w;
      height = h;
      break;
    }
  }

  return {
    durationSeconds: Math.round(durationSeconds),
    width,
    height,
  };
}

interface BoxSpan {
  type: string;
  /** Offset of the box header (size field). */
  start: number;
  /** Offset immediately after the box payload. */
  end: number;
  /** Offset where the payload begins (right after type + extended size). */
  payloadStart: number;
}

function walkBoxes(buffer: Buffer, start: number, end: number): BoxSpan[] {
  const boxes: BoxSpan[] = [];
  let cursor = start;
  while (cursor + 8 <= end) {
    let size = buffer.readUInt32BE(cursor);
    const type = buffer.toString('ascii', cursor + 4, cursor + 8);
    let headerSize = 8;

    if (size === 1) {
      // 64-bit largesize follows the type.
      if (cursor + 16 > end) break;
      const hi = buffer.readUInt32BE(cursor + 8);
      const lo = buffer.readUInt32BE(cursor + 12);
      size = hi * 0x1_0000_0000 + lo;
      headerSize = 16;
    } else if (size === 0) {
      // Box extends to the end of the enclosing container.
      size = end - cursor;
    }

    if (size < headerSize || cursor + size > end) break;

    boxes.push({
      type,
      start: cursor,
      payloadStart: cursor + headerSize,
      end: cursor + size,
    });

    cursor += size;
  }
  return boxes;
}

/**
 * Read `mvhd` and return the movie duration in seconds. Both v0 (32-bit
 * fields) and v1 (64-bit fields) are supported — version is the first
 * byte of the payload.
 */
function readMvhdDuration(buffer: Buffer, box: BoxSpan): number {
  const p = box.payloadStart;
  if (p + 4 > box.end) return 0;
  const version = buffer[p];
  const timescaleOffset = p + (version === 1 ? 20 : 16);
  const durationOffset = timescaleOffset + 4;
  if (durationOffset + (version === 1 ? 8 : 4) > box.end) return 0;

  const timescale = buffer.readUInt32BE(timescaleOffset) || MP4_TIMESCALE_FALLBACK;
  const duration =
    version === 1
      ? Number(buffer.readBigUInt64BE(durationOffset))
      : buffer.readUInt32BE(durationOffset);
  if (!duration || !timescale) return 0;
  return duration / timescale;
}

/**
 * Read `tkhd` and return the visual track's intrinsic width and height
 * (already in pixels — they're stored as 16.16 fixed point).
 */
function readTkhdDimensions(
  buffer: Buffer,
  box: BoxSpan,
): { width: number; height: number } {
  const p = box.payloadStart;
  if (p + 4 > box.end) return { width: 0, height: 0 };
  const version = buffer[p];

  // The width/height pair is the LAST 8 bytes of tkhd's payload
  // (regardless of v0/v1), so we can compute it from the end of the
  // box instead of walking the layout byte-by-byte.
  const widthOffset = box.end - 8;
  const heightOffset = box.end - 4;
  if (widthOffset < p) return { width: 0, height: 0 };

  // 16.16 fixed point → drop the lower 16 bits for pixels.
  const width = buffer.readUInt32BE(widthOffset) >> 16;
  const height = buffer.readUInt32BE(heightOffset) >> 16;

  // tkhd also exists for audio tracks; those report 0×0 so the
  // `for...of traks` loop in `probeMp4` will skip past them.
  return { width, height };
}