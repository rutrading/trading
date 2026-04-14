"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toastManager } from "@/components/ui/toast";

export const AccountActions = () => {
  const handleResetBalance = () => {
    toastManager.add({
      title: "Balance reset",
      description: "Your virtual cash has been restored to the default amount.",
      type: "success",
    });
  };

  const handleDeleteAccount = () => {
    toastManager.add({
      title: "Not available",
      description: "Account deletion is not yet available.",
      type: "error",
    });
  };

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Account</h2>
      <div className="space-y-4 rounded-xl bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Reset Balance</p>
            <p className="text-xs text-muted-foreground">
              Restore your virtual cash to the default amount.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleResetBalance}>
            Reset
          </Button>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete Account</p>
            <p className="text-xs text-muted-foreground">
              Permanently remove your account and all data.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={handleDeleteAccount}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};
