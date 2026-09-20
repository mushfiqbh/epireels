"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthBootstrap,
  AuthStatus,
  ID,
  LoginInput,
  SignupInput,
  UserRole,
} from "@epireels/types";

// PublicUser isn't imported directly any more — the AuthBootstrap shape
// (`PublicUser & { role }`) is the only "user" type the provider exposes.
import { ApiError } from "@/lib/api/client";
import {
  deleteComment,
  listComments,
  listLikedEpisodeIds,
  listSavedEpisodeIds,
  toggleLike,
  toggleSave,
} from "@/lib/api/engagement";

/** A deferred interaction the user tried while anonymous. Replayed
 *  automatically after a successful sign-in. */
export type DeferredAction =
  | { kind: "toggleLike"; episodeId: ID }
  | { kind: "toggleSave"; episodeId: ID }
  | { kind: "openComments"; episodeId: ID };

/** The current viewer — same shape returned by `/auth/me` and the
 *  `AuthBootstrap.user` payload: `PublicUser` augmented with the role so
 *  role-gated pages can read it directly. */
export type AuthenticatedUser = {
  id: ID;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
};

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  /** Episode IDs the current user has liked. */
  likedIds: Set<string>;
  /** Episode IDs the current user has saved. */
  savedIds: Set<string>;
  /** Open the sign-in modal. If `reason` is a deferred action, it will be
   *  replayed automatically after a successful sign-in. */
  requireSignIn(reason?: DeferredAction): void;
  /** Programmatically open the modal (e.g. from the Account tab). */
  openSignIn(): void;
  closeSignIn(): void;
  isSignInOpen: boolean;
  signIn(input: LoginInput): Promise<void>;
  signUp(input: SignupInput): Promise<void>;
  signOut(): Promise<void>;
  setLikedIds(updater: React.SetStateAction<Set<string>>): void;
  setSavedIds(updater: React.SetStateAction<Set<string>>): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

interface AuthProviderState {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  /** Locally tracked like / save sets so the ActionRail doesn't have
   *  to re-fetch the entire roster when one item flips. */
  likedIds: Set<string>;
  savedIds: Set<string>;
}

/**
 * `AuthProvider` — the single source of truth for "who is signed in?".
 *
 * Mount once, near the root. Children read `useAuth()`; only one component
 * (the modal) cares about the `isSignInOpen` flag. The deferred-action
 * slot lets the heart / save / comment buttons queue a request when the
 * user isn't signed in yet: tapping the heart opens the modal, and after
 * they finish the signup the same `episodeId` is replayed server-side.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthProviderState>({
    status: "loading",
    user: null,
    likedIds: new Set<string>(),
    savedIds: new Set<string>(),
  });
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const pendingActionRef = useRef<DeferredAction | null>(null);
  const latestBootstrapRef = useRef<AuthBootstrap | null>(null);

  // Cache helpers so subsequent calls share one network round-trip per
  // page load.
  const likeCacheRef = useRef<Set<string> | null>(null);
  const saveCacheRef = useRef<Set<string> | null>(null);

  // First mount: figure out whether the browser already has a session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { me } = await import("@/lib/api/auth");
        const bootstrap = await me();
        if (cancelled) return;
        if (bootstrap) {
          latestBootstrapRef.current = bootstrap;
          // `bootstrap.user` is `PublicUser & { role }` — the AuthBootstrap
          // guarantees a role value, so this widening is safe.
          setState((prev) => ({
            ...prev,
            status: "authenticated",
            user: bootstrap.user as AuthenticatedUser,
          }));
        } else {
          setState((prev) => ({ ...prev, status: "anonymous" }));
        }
      } catch (error) {
        if (cancelled) return;
        // Treat unknown errors as anonymous so the user can still browse.
        if (!(error instanceof ApiError) || error.status >= 500) {
          // eslint-disable-next-line no-console
          console.warn("auth bootstrap failed", error);
        }
        setState((prev) => ({ ...prev, status: "anonymous" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Pull the full like / save set on first authenticated render. */
  const hydrateLikeSaveSets = useCallback(async () => {
    try {
      if (!likeCacheRef.current) {
        const ids = await listLikedEpisodeIds();
        likeCacheRef.current = new Set(ids.map((id) => String(id)));
      }
      if (!saveCacheRef.current) {
        const ids = await listSavedEpisodeIds();
        saveCacheRef.current = new Set(ids.map((id) => String(id)));
      }
      setState((prev) => ({
        ...prev,
        likedIds: likeCacheRef.current!,
        savedIds: saveCacheRef.current!,
      }));
    } catch (error) {
      // If the session vanished mid-flight we drop back to anonymous.
      if (error instanceof ApiError && error.status === 401) {
        setState({
          status: "anonymous",
          user: null,
          likedIds: new Set<string>(),
          savedIds: new Set<string>(),
        });
      }
    }
  }, []);

  useEffect(() => {
    if (state.status === "authenticated") {
      void hydrateLikeSaveSets();
    }
  }, [state.status, hydrateLikeSaveSets]);

  const setLikedIds = useCallback(
    (updater: React.SetStateAction<Set<string>>) => {
      setState((prev) => ({
        ...prev,
        likedIds:
          typeof updater === "function"
            ? (updater as (s: Set<string>) => Set<string>)(prev.likedIds)
            : updater,
      }));
    },
    [],
  );

  const setSavedIds = useCallback(
    (updater: React.SetStateAction<Set<string>>) => {
      setState((prev) => ({
        ...prev,
        savedIds:
          typeof updater === "function"
            ? (updater as (s: Set<string>) => Set<string>)(prev.savedIds)
            : updater,
      }));
    },
    [],
  );

  /** Replay any deferred action that was queued before sign-in. */
  const replayPending = useCallback(async () => {
    const action = pendingActionRef.current;
    if (!action) return;
    pendingActionRef.current = null;
    try {
      switch (action.kind) {
        case "toggleLike":
          await toggleLike({ episodeId: action.episodeId });
          break;
        case "toggleSave":
          await toggleSave({ episodeId: action.episodeId });
          break;
        case "openComments": {
          // Comments don't need a server write at open time — but we
          // touch `listComments` so the drawer has fresh data and any
          // auth-gated fetch fires now while the user is signed in.
          await listComments(action.episodeId).catch(() => undefined);
          break;
        }
      }
    } catch (error) {
      // Silent: the UI already optimistically updated; if the replay
      // fails the next request will surface a meaningful error.
      if (!(error instanceof ApiError && error.status === 401)) {
        // eslint-disable-next-line no-console
        console.warn("deferred action replay failed", error);
      }
    }
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(
    async (input) => {
      const { login } = await import("@/lib/api/auth");
      const bootstrap = await login(input);
      latestBootstrapRef.current = bootstrap;
      likeCacheRef.current = null;
      saveCacheRef.current = null;
      setState((prev) => ({
        ...prev,
        status: "authenticated",
        user: bootstrap.user as AuthenticatedUser,
      }));
      // Replay any action queued before the user signed in.
      void replayPending();
    },
    [replayPending],
  );

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (input) => {
      const { signup } = await import("@/lib/api/auth");
      const bootstrap = await signup(input);
      latestBootstrapRef.current = bootstrap;
      likeCacheRef.current = null;
      saveCacheRef.current = null;
      setState((prev) => ({
        ...prev,
        status: "authenticated",
        user: bootstrap.user as AuthenticatedUser,
      }));
      void replayPending();
    },
    [replayPending],
  );

  const signOut = useCallback(async () => {
    try {
      const { logout } = await import("@/lib/api/auth");
      await logout();
    } finally {
      latestBootstrapRef.current = null;
      likeCacheRef.current = null;
      saveCacheRef.current = null;
      setState({
        status: "anonymous",
        user: null,
        likedIds: new Set<string>(),
        savedIds: new Set<string>(),
      });
    }
  }, []);

  const requireSignIn = useCallback<AuthContextValue["requireSignIn"]>(
    (reason) => {
      if (reason) {
        pendingActionRef.current = reason;
      }
      setIsSignInOpen(true);
    },
    [],
  );

  const openSignIn = useCallback(() => setIsSignInOpen(true), []);
  const closeSignIn = useCallback(() => setIsSignInOpen(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      likedIds: state.likedIds,
      savedIds: state.savedIds,
      requireSignIn,
      openSignIn,
      closeSignIn,
      isSignInOpen,
      signIn,
      signUp,
      signOut,
      setLikedIds,
      setSavedIds,
    }),
    [
      state.status,
      state.user,
      state.likedIds,
      state.savedIds,
      requireSignIn,
      openSignIn,
      closeSignIn,
      isSignInOpen,
      signIn,
      signUp,
      signOut,
      setLikedIds,
      setSavedIds,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

// Re-export the helper consumers use to delete a comment so the drawer
// imports it from a single place.
export { deleteComment };
