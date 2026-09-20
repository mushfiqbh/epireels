/**
 * API client base URL + typed fetch helper.
 *
 * Reads `NEXT_PUBLIC_API_BASE_URL` (set in `.env.local`) and falls back to
 * the local dev server's default port so the page boots out-of-the-box
 * without configuration.
 *
 * All front-end fetches go through `apiFetch<T>()` — it normalises the
 * base URL, applies a `cache: "no-store"` policy, sends cookies for
 * authenticated requests, attaches a CSRF token to unsafe verbs, and
 * transparently retries once after a refresh-on-401. It throws a typed
 * `ApiError` for non-2xx responses so callers can render the error UI.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://epireels.onrender.com"
    : "http://localhost:4000");

/** Cookie names — must match `apps/api/src/modules/auth/auth.service.ts`. */
export const COOKIE_ACCESS = "aep_at";
export const COOKIE_REFRESH = "aep_rt";
export const COOKIE_CSRF = "aep_csrf";

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

/** Read a cookie value by name (returns the first match only). */
export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const target = `${name}=`;
  const segments = document.cookie.split(";");
  for (const raw of segments) {
    const trimmed = raw.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return undefined;
}

/**
 * Pull the CSRF token value out of the `aep_csrf` cookie.
 *
 * The server signs it with HMAC-SHA256 (`<value>.<sig>`); we send the
 * full signed token as `X-CSRF-Token` — the server verifies the signature
 * from the secret and compares, so an attacker who can read the cookie
 * (e.g. XSS) but not the secret can't forge a working pair.
 */
export function getCsrfToken(): string | undefined {
  return getCookie(COOKIE_CSRF);
}

/** HTTP verbs that require a CSRF token. GET/HEAD/OPTIONS are exempt. */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Internal flag — set to `true` while a 401-driven refresh is in flight so
 * that parallel callers don't all trigger their own refresh round-trip.
 * Stored on a module-local variable because the auth flow runs before any
 * React context is mounted.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(apiUrl("/api/v1/auth/refresh"), {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Defer clearing until after the awaited callers have a chance to
      // observe the resolved promise.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

/** Issue a typed request against the API. Throws `ApiError` on non-2xx.
 *
 *  - Always sends cookies (`credentials: "include"`) so the server can
 *    read the `aep_at` / `aep_rt` cookies.
 *  - On unsafe verbs, adds `X-CSRF-Token` from the `aep_csrf` cookie.
 *  - On 401, fires one refresh round-trip and replays the request once.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = apiUrl(path);
  const method = (init?.method ?? "GET").toUpperCase();

  const headers = new Headers(init?.headers ?? {});
  if (UNSAFE_METHODS.has(method)) {
    const csrf = getCsrfToken();
    if (csrf && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", csrf);
    }
  }

  const doFetch = () =>
    fetch(url, {
      cache: "no-store",
      credentials: "include",
      ...init,
      headers,
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch (cause) {
    throw new ApiError(`Network error contacting ${url}`, 0, url, cause);
  }

  // One-shot refresh retry for authenticated calls. We only retry when a
  // refresh cookie is actually present — otherwise the caller is clearly
  // anonymous and the 401 is the truthful answer.
  if (res.status === 401 && getCookie(COOKIE_REFRESH)) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      // Rebuild headers because the CSRF token rotates on every refresh.
      const retryHeaders = new Headers(init?.headers ?? {});
      if (UNSAFE_METHODS.has(method)) {
        const csrf = getCsrfToken();
        if (csrf && !retryHeaders.has("x-csrf-token")) {
          retryHeaders.set("x-csrf-token", csrf);
        }
      }
      try {
        res = await fetch(url, {
          cache: "no-store",
          credentials: "include",
          ...init,
          headers: retryHeaders,
        });
      } catch (cause) {
        throw new ApiError(`Network error contacting ${url}`, 0, url, cause);
      }
    }
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