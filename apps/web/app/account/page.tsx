"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getProfile, type UserProfile } from "@/lib/api/users";
import { ApiError } from "@/lib/api/client";
import AccountView from "@/components/account/AccountView";
import AppLayout from "@/components/AppLayout";

export default function AccountPage() {
  const { user, status, requireSignIn } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "anonymous") {
      requireSignIn();
      return;
    }

    if (status === "authenticated" && user) {
      setLoading(true);
      getProfile()
        .then((data) => {
          setProfile(data);
          setLoading(false);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) {
            requireSignIn();
          }
          setLoading(false);
        });
    }
  }, [status, user, requireSignIn]);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <AppLayout>
      <AccountView profile={profile} />
    </AppLayout>
  );
}
