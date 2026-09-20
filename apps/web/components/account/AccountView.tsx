"use client";

import { useState } from "react";
import { User, Mail, Calendar, Edit2, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { updateProfile, type UserProfile } from "@/lib/api/users";
import { ApiError } from "@/lib/api/client";
import EditProfileModal from "./EditProfileModal";

interface AccountViewProps {
  profile: UserProfile;
}

export default function AccountView({ profile }: AccountViewProps) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localProfile, setLocalProfile] = useState(profile);

  const { signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = "/";
    } catch (err) {
      console.error("Sign out failed", err);
    }
  };

  const handleSaveProfile = async (data: {
    displayName?: string;
    avatarUrl?: string;
    password?: string;
    currentPassword?: string;
  }) => {
    setIsUpdating(true);
    setError(null);

    try {
      const updated = await updateProfile(data);
      setLocalProfile(updated);
      setIsEditing(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to update profile");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-ink pb-20">
      {/* Header */}
      <div className="bg-gradient-to-b from-white/5 to-transparent pt-8 pb-12">
        <div className="container mx-auto px-4">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-gradient-to-br from-yt-red to-orange-500 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                {localProfile.avatarUrl ? (
                  <img
                    src={localProfile.avatarUrl}
                    alt={localProfile.displayName}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  localProfile.displayName.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">
                {localProfile.displayName}
              </h1>
              <p className="text-sm text-white/60 mt-1">@{user?.id}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-white/50">
                {localProfile.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4" />
                    <span>{localProfile.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>Joined {formatDate(new Date().toISOString())}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <Edit2 className="h-4 w-4" />
              Edit profile
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 mt-8">
        {/* Quick Actions */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <button
              onClick={() => setIsEditing(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-white transition hover:bg-white/10"
            >
              <Settings className="h-5 w-5 text-white/60" />
              <span>Edit Profile</span>
            </button>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-yt-red transition hover:bg-yt-red/10"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Account Info */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Account Information</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-white/50">
                Display Name
              </label>
              <p className="mt-1 text-white">{localProfile.displayName}</p>
            </div>
            {localProfile.email && (
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-white/50">
                  Email
                </label>
                <p className="mt-1 text-white">{localProfile.email}</p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-white/50">
                Role
              </label>
              <p className="mt-1 text-white capitalize">{localProfile.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <EditProfileModal
          profile={localProfile}
          onSave={handleSaveProfile}
          onClose={() => {
            setIsEditing(false);
            setError(null);
          }}
          isSaving={isUpdating}
          error={error}
        />
      )}
    </div>
  );
}
