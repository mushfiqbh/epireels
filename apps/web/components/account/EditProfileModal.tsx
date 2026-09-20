"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { UserProfile } from "@/lib/api/users";

interface EditProfileModalProps {
  profile: UserProfile;
  onSave: (data: {
    displayName?: string;
    avatarUrl?: string;
    password?: string;
    currentPassword?: string;
  }) => void;
  onClose: () => void;
  isSaving: boolean;
  error: string | null;
}

export default function EditProfileModal({
  profile,
  onSave,
  onClose,
  isSaving,
  error,
}: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || "");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [changePassword, setChangePassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: {
      displayName?: string;
      avatarUrl?: string;
      password?: string;
      currentPassword?: string;
    } = {};

    if (displayName !== profile.displayName) {
      data.displayName = displayName;
    }

    if (avatarUrl !== profile.avatarUrl) {
      data.avatarUrl = avatarUrl || undefined;
    }

    if (changePassword) {
      data.password = password;
      data.currentPassword = currentPassword;
    }

    onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Edit Profile</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
              maxLength={80}
            />
          </div>

          {/* Avatar URL */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Avatar URL
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
            />
          </div>

          {/* Password Change */}
          <div className="pt-4 border-t border-white/10">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={changePassword}
                onChange={(e) => setChangePassword(e.target.checked)}
                className="h-4 w-4 accent-yt-red"
              />
              <span className="text-sm text-white/80">Change password</span>
            </label>
          </div>

          {changePassword && (
            <div className="space-y-4 pt-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-yt-red/40 bg-yt-red/10 px-4 py-3 text-sm text-yt-red">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 rounded-md bg-yt-red px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-yt-red/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
