"use client";

import { Question } from "@phosphor-icons/react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";

export function InfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="More information"
          >
            <Question className="size-3.5" />
          </button>
        }
      />
      <TooltipPopup className="max-w-64 p-2 text-left leading-relaxed">
        {content}
      </TooltipPopup>
    </Tooltip>
  );
}
