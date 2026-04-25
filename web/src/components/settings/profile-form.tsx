"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/auth";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toastManager } from "@/components/ui/toast";

export const ProfileForm = ({
  name: initialName,
  email: initialEmail,
}: {
  name: string;
  email: string;
}) => {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);

  const trimmedName = name.trim();
  const nameChanged = name !== initialName;
  const emailChanged = email !== initialEmail;
  const hasChanges = nameChanged || emailChanged;

  const nameEmpty = nameChanged && trimmedName.length === 0;
  const emailInvalid =
    emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const canSubmit =
    !loading && hasChanges && !nameEmpty && !emailInvalid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setNameError("");
    setEmailError("");
    setLoading(true);

    if (nameChanged) {
      const result = await updateProfile(trimmedName);
      if (!result.success) {
        setNameError(result.error);
        setLoading(false);
        return;
      }
    }

    if (emailChanged) {
      const { error: authError } = await authClient.changeEmail({
        newEmail: email,
        callbackURL: "/settings",
      });
      if (authError) {
        setEmailError(authError.message ?? "Failed to update email");
        setLoading(false);
        return;
      }
      toastManager.add({
        title: "Email updated",
        description: `Your account email is now ${email}.`,
        type: "success",
      });
    }

    if (nameChanged) {
      toastManager.add({ title: "Display name updated", type: "success" });
    }

    setLoading(false);
    router.refresh();
  };

  const nameInvalid = nameEmpty || nameError.length > 0;
  const emailShowError = emailInvalid || emailError.length > 0;

  return (
    <Form onSubmit={handleSubmit}>
      <Field>
        <FieldLabel htmlFor="name">Display Name</FieldLabel>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError("");
          }}
          required
          disabled={loading}
          aria-invalid={nameInvalid}
        />
        {nameError ? (
          <FieldError match={true}>{nameError}</FieldError>
        ) : nameEmpty ? (
          <FieldError match={true}>Display name can&apos;t be empty.</FieldError>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError("");
          }}
          required
          disabled={loading}
          aria-invalid={emailShowError}
        />
        {emailError ? (
          <FieldError match={true}>{emailError}</FieldError>
        ) : emailInvalid ? (
          <FieldError match={true}>Enter a valid email address.</FieldError>
        ) : null}
      </Field>
      <Button
        type="submit"
        size="sm"
        disabled={!canSubmit}
        className="self-start"
      >
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </Form>
  );
};
