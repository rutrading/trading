"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toastManager } from "@/components/ui/toast";

export const ProfileForm = ({
  name: initialName,
  email,
}: {
  name: string;
  email: string;
}) => {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const nameChanged = name.trim().length > 0 && name !== initialName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameChanged) return;
    setError("");
    setLoading(true);

    const result = await updateProfile(name);
    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    toastManager.add({ title: "Display name updated", type: "success" });
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
          readOnly
          disabled
          aria-readonly
        />
        <FieldDescription>
          Contact support to change the email on your account.
        </FieldDescription>
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="submit"
        size="sm"
        disabled={loading || !nameChanged}
        className="self-start"
      >
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </Form>
  );
};
