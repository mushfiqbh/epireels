"use client";

import { AuthProvider } from "./AuthProvider";
import SignInSignUpModal from "./SignInSignUpModal";

/**
 * Single component that owns the `<AuthProvider>` boundary and the
 * sign-in modal. We use it from the root layout so the modal sits above
 * every page (and any nested route) without needing per-page wiring.
 */
export default function AuthMount({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      {children}
      <SignInSignUpModal />
    </AuthProvider>
  );
}
