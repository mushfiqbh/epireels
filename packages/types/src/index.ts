/**
 * @epireels/types
 *
 * Cross-app shared types. Every constant here is consumed by at least one of
 * `apps/web`, `apps/api`, or `apps/mobile`. Keep this package dependency-free
 * so it never bloats the install graph.
 */

// ─── Generic API envelopes ─────────────────────────────────────────────────

/** Standard JSON response envelope returned by every API endpoint. */
export interface ApiResponse<T> {
  data: T;
  meta?: ResponseMeta;
}

/** Optional pagination / timing metadata attached to API responses. */
export interface ResponseMeta {
  requestId?: string;
  /** ISO-8601 timestamp at which the server produced the response. */
  timestamp?: string;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

// ─── Error handling ────────────────────────────────────────────────────────

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "INTERNAL_SERVER_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Optional machine-readable field path (e.g. `"user.email"`). */
  field?: string;
  details?: Record<string, unknown>;
}

// ─── Domain primitives ─────────────────────────────────────────────────────

export type ID = string & { readonly __brand: "ID" };

/** Create a branded ID — use this at the boundary, not the type itself. */
export const asId = (value: string): ID => value as ID;

export type ISODateString = string & { readonly __brand: "ISODateString" };

// ─── User ──────────────────────────────────────────────────────────────────

export interface User {
  id: ID;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: ISODateString;
}

export type UserRole = "admin" | "member" | "guest";

export interface PublicUser
  extends Pick<User, "id" | "displayName" | "avatarUrl"> {}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken?: string;
  expiresAt: ISODateString;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput extends LoginInput {
  displayName: string;
}

// ─── Health (used by uptime probes & the web "system status" page) ────────

export interface HealthSnapshot {
  status: "ok" | "degraded" | "down";
  uptimeSeconds: number;
  timestamp: ISODateString;
  nodeEnv: "development" | "test" | "production";
  storageDriver?: string;
  version?: string;
}

// ─── Feature flags ────────────────────────────────────────────────────────

export interface FeatureFlags {
  /** Server-side override map; `null` = use client default. */
  overrides?: Record<string, boolean | string | number | null> | null;
}

// ─── Versioning ────────────────────────────────────────────────────────────

export interface BuildInfo {
  /** SemVer of the deployed build. */
  version: string;
  /** Short git SHA. */
  commit: string;
  /** ISO-8601 build timestamp. */
  builtAt: ISODateString;
}
