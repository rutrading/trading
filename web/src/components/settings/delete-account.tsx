"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteAccount } from "@/app/actions/auth";
import { toast } from "@/lib/toasts";

type Props = {
  accountId: number;
  accountName: string;
};

export const DeleteAccount = ({ accountId, accountName }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccount(accountId);
      if (!result.success) {
        toast.error("Delete failed", result.error);
        return;
      }
      toast.success("Account deleted", accountName);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="destructive-outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Trash size={14} />
        Delete
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete {accountName}. All positions, orders, and
              history will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? "Deleting..." : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
