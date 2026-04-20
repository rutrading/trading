"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { toastManager } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export const SecurityForm = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const sameAsCurrent =
    newPassword.length > 0 && newPassword === currentPassword;

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
    <Form onSubmit={handleSubmit}>
      <Field>
        <FieldLabel htmlFor="current-password">Current Password</FieldLabel>
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
      </Field>
      <Field>
        <FieldLabel htmlFor="new-password">New Password</FieldLabel>
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
        />
        {sameAsCurrent ? (
          <FieldError match={true}>
            New password can&apos;t match your current password.
          </FieldError>
        ) : tooShort ? (
          <FieldError match={true}>Must be at least 8 characters.</FieldError>
        ) : (
          <FieldDescription>
            Must be at least 8 characters and different from your current
            password.
          </FieldDescription>
        )}
      </Field>
      <Button
        type="submit"
        size="sm"
        disabled={!canSubmit}
        className="self-start"
      >
        {loading ? "Changing..." : "Change Password"}
      </Button>
    </Form>
  );
};
