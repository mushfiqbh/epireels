/**
 * API client base URL + typed fetch helper.
 *
 * Reads `NEXT_PUBLIC_API_BASE_URL` (set in `.env.local`) and falls back to
 * the local dev server's default port so the page boots out-of-the-box
 * without configuration.
 *
 * All front-end fetches go through `apiFetch<T>()` — it normalises the
 * base URL, applies a `cache: "no-store"` policy, and throws a typed
 * `ApiError` for non-2xx responses so callers can render the error UI.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://epireels.onrender.com"
    : "http://localhost:4000");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Normalize a base URL so it always has a scheme. Without a scheme,
 *  the browser will treat the value as a relative path and join it onto
 *  the current origin (e.g. `https://epireels.vercel.app` +
 *  `epireels.onrender.com/api/v1/series` → broken URL). */
function normalizeBase(raw: string): string {
  let base = raw.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }
  return base;
}

/** Build a fully-qualified API URL from a relative path. */
export function apiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = normalizeBase(API_BASE_URL);
  const tail = path.startsWith("/") ? path : `/${path}`;
  return `${base}${tail}`;
}

/** Issue a typed GET against the API. Throws `ApiError` on non-2xx. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      ...init,
    });
  } catch (cause) {
    throw new ApiError(
      `Network error contacting ${url}`,
      0,
      url,
      cause,
    );
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    throw new ApiError(
      `Request failed: ${res.status} ${res.statusText}`,
      res.status,
      url,
      body,
    );
  }
  return (await res.json()) as T;
}