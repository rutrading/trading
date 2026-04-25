"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameAccount } from "@/app/actions/auth";
import { toast } from "@/lib/toasts";

type Props = {
  accountId: number;
  currentName: string;
};

export const EditAccountName = ({ accountId, currentName }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [pending, startTransition] = useTransition();

  const trimmed = name.trim();
  const canSave =
    trimmed.length > 0 && trimmed.length <= 64 && trimmed !== currentName;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    startTransition(async () => {
      const result = await renameAccount(accountId, trimmed);
      if (!result.success) {
        toast.error("Rename failed", result.error);
        return;
      }
      toast.success("Account renamed", trimmed);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setName(currentName);
          setOpen(true);
        }}
      >
        <PencilSimple size={14} />
        Edit Name
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Rename account</DialogTitle>
              <DialogDescription>
                Give this account a new name. Only you and account members will
                see it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 px-6 pb-4">
              <Label htmlFor={`account-name-${accountId}`}>Account name</Label>
              <Input
                id={`account-name-${accountId}`}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                placeholder="My Investment Account"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
