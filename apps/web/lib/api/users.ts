/**
 * User profile REST adapter — thin wrappers around the `/api/v1/users/*` endpoints.
 */

import { apiFetch } from "./client";

export interface UserProfile {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string | null;
  role: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string;
  password?: string;
  currentPassword?: string;
}

/** Get the current user's profile. */
export function getProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/users/me");
}

/** Update the current user's profile. */
export function updateProfile(input: UpdateProfileInput): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/users/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
