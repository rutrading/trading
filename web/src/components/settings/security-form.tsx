"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { toastManager } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const SecurityForm = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const sameAsCurrent =
    newPassword.length > 0 && newPassword === currentPassword;

  let newPasswordHint: { message: string; tone: "muted" | "error" };
  if (sameAsCurrent) {
    newPasswordHint = {
      message: "New password can't match your current password.",
      tone: "error",
    };
  } else if (tooShort) {
    newPasswordHint = {
      message: "Must be at least 8 characters.",
      tone: "error",
    };
  } else {
    newPasswordHint = {
      message: "Must be at least 8 characters and different from your current password.",
      tone: "muted",
    };
  }

  const canSubmit =
    !loading &&
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    !sameAsCurrent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);

    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
    });

    if (error) {
      toastManager.add({
        title: "Failed to change password",
        description: error.message ?? "Please try again.",
        type: "error",
      });
    } else {
      toastManager.add({
        title: "Password changed",
        description: "Your password has been updated.",
        type: "success",
      });
      setCurrentPassword("");
      setNewPassword("");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="current-password">Current Password</Label>
        <Input
          id="current-password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-password">New Password</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          disabled={loading}
          aria-invalid={sameAsCurrent || tooShort}
          aria-describedby="new-password-hint"
        />
        <p
          id="new-password-hint"
          className={
            newPasswordHint.tone === "error"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {newPasswordHint.message}
        </p>
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={!canSubmit}
        className="self-start"
      >
        {loading ? "Changing..." : "Change Password"}
      </Button>
    </form>
  );
};
