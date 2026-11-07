/**
 * Auth REST adapter — thin wrappers around the `/api/v1/auth/*` endpoints.
 *
 * All four verbs (signup, login, logout, me) are expressed in terms of
 * `apiFetch` so they automatically benefit from the cookie/CSRF machinery
 * baked into the client.
 */

import type { AuthBootstrap, LoginInput, SignupInput } from "@epireels/types";
import { apiFetch, setCsrfToken } from "./client";

/** Create a new member account and immediately establish a session. */
export function signup(input: SignupInput): Promise<AuthBootstrap> {
  return apiFetch<AuthBootstrap>("/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then((bootstrap) => {
    setCsrfToken(bootstrap.csrfToken);
    return bootstrap;
  });
}

/** Exchange email/password for a fresh session. */
export function login(input: LoginInput): Promise<AuthBootstrap> {
  return apiFetch<AuthBootstrap>("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then((bootstrap) => {
    setCsrfToken(bootstrap.csrfToken);
    return bootstrap;
  });
}

/** Tell the server to revoke the refresh token; ignores the (204) body. */
export async function logout(): Promise<void> {
  await apiFetch<void>("/api/v1/auth/logout", { method: "POST" });
  setCsrfToken(undefined);
}

/** Return the current session, or `null` when anonymous (cookie-less). */
export async function me(): Promise<AuthBootstrap | null> {
  try {
    const bootstrap = await apiFetch<AuthBootstrap>("/api/v1/auth/me");
    setCsrfToken(bootstrap.csrfToken);
    return bootstrap;
  } catch (error) {
    // `ApiError` with status 401 means "no session" — surface as null so
    // callers don't have to distinguish between "loading" and "logged out".
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status: number }).status === 401
    ) {
      return null;
    }
    throw error;
  }
}
