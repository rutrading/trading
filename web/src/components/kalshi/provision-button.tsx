"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { provisionSubaccount } from "@/app/actions/kalshi";
import { toast } from "@/lib/toasts";

export function ProvisionSubaccountButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await provisionSubaccount();
          if (!res.success) {
            toast.error("Provisioning failed", res.error);
            return;
          }
          toast.success("Subaccount provisioned");
          router.refresh();
        })
      }
    >
      {pending ? "Provisioning..." : label}
    </Button>
  );
}
