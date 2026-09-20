"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import type { LoginInput, SignupInput } from "@epireels/types";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "signup";

interface SignInSignUpModalProps {
  /** Defaults to `signin`; pass `signup` when the user came from a CTA. */
  initialMode?: Mode;
}

/**
 * Sign in / Sign up modal.
 *
 * Mounted once at the application root via `<AuthProvider>` consumers.
 * Two stacked tabs — Sign In and Create Account — share the same shell
 * so the brand identity stays consistent. Field validation is done
 * inline to match the rest of the app; server errors are surfaced
 * beneath the submit button.
 */
export default function SignInSignUpModal({
  initialMode = "signin",
}: SignInSignUpModalProps) {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal is (re-)opened so stale state doesn't bleed
  // between sessions.
  useEffect(() => {
    if (auth.isSignInOpen) {
      setMode(initialMode);
      setError(null);
    }
  }, [auth.isSignInOpen, initialMode]);

  // Allow `Esc` to close.
  useEffect(() => {
    if (!auth.isSignInOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") auth.closeSignIn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auth]);

  if (!auth.isSignInOpen) return null;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await auth.signIn({ email, password } satisfies LoginInput);
      } else {
        await auth.signUp({
          email,
          password,
          username: username.trim(),
          displayName: displayName.trim(),
        } satisfies SignupInput);
      }
      auth.closeSignIn();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Something went wrong. Try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "signin" ? "Sign in" : "Create account"}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 px-4 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) auth.closeSignIn();
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#0e0f15] p-6 shadow-2xl md:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h2>
          <button
            type="button"
            onClick={auth.closeSignIn}
            className="rounded-full p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-full px-3 py-1.5 font-medium transition ${
              mode === "signin"
                ? "bg-white text-black"
                : "text-white/65 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full px-3 py-1.5 font-medium transition ${
              mode === "signup"
                ? "bg-white text-black"
                : "text-white/65 hover:text-white"
            }`}
          >
            Create Account
          </button>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (submitting) return;
            void submit();
          }}
        >
          <Field
            label="Email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={setEmail}
            placeholder="you@epireels.app"
          />
          {mode === "signup" && (
            <>
              <Field
                label="Username"
                value={username}
                autoComplete="username"
                onChange={setUsername}
                placeholder="lowercase, no spaces"
              />
              <Field
                label="Display name"
                value={displayName}
                autoComplete="nickname"
                onChange={setDisplayName}
                placeholder="How your name appears on comments"
              />
            </>
          )}
          <div className="relative">
            <Field
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              onChange={setPassword}
              placeholder="At least 8 characters"
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-white/55 hover:text-white"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-white/50">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-medium text-white underline-offset-2 hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-medium text-white underline-offset-2 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  suffix?: React.ReactNode;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  suffix,
}: FieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/55">
        {label}
      </span>
      <div className="relative">
        <input
          type={type}
          value={value}
          required
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
        />
        {suffix && (
          <div className="absolute inset-y-0 right-2 flex items-center">
            {suffix}
          </div>
        )}
      </div>
    </label>
  );
}
