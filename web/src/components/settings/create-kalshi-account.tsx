"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Robot } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createKalshiAccount } from "@/app/actions/auth";
import { toast } from "@/lib/toasts";

export function CreateKalshiAccountButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const button = (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const result = await createKalshiAccount("My Kalshi Account");
          if (!result.success) {
            toast.error("Could not create Kalshi account", result.error);
            return;
          }
          toast.success("Kalshi account created");
          router.refresh();
          router.push("/kalshi");
        })
      }
    >
      <Robot size={14} />
      {pending ? "Creating..." : "New Kalshi Account"}
    </Button>
  );

  if (!disabled) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span>{button}</span>} />
      <TooltipContent>You already have a Kalshi account.</TooltipContent>
    </Tooltip>
  );
}
