"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/auth";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const nameChanged = name !== initialName;
  const emailChanged = email !== initialEmail;
  const hasChanges = nameChanged || emailChanged;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;
    setError("");
    setLoading(true);

    if (nameChanged) {
      const result = await updateProfile(name);
      if (!result.success) {
        setError(result.error);
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
        setError(authError.message ?? "Failed to update email");
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

  return (
    <Form onSubmit={handleSubmit}>
      <Field>
        <FieldLabel htmlFor="name">Display Name</FieldLabel>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={loading}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="submit"
        size="sm"
        disabled={loading || !hasChanges}
        className="self-start"
      >
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </Form>
  );
};
