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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        />
        <p className="text-xs text-muted-foreground">
          Must be at least 8 characters
        </p>
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={loading || !currentPassword || !newPassword}
        className="self-start"
      >
        {loading ? "Changing..." : "Change Password"}
      </Button>
    </form>
  );
};
