import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import type React from "react";
import { cn } from "@/lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  children,
  ...props
}: SeparatorPrimitive.Props & {
  children?: React.ReactNode;
}): React.ReactElement {
  if (children !== undefined && children !== null && children !== false) {
    if (orientation === "vertical") {
      return (
        <div
          className={cn(
            "inline-flex flex-col items-center gap-3 self-stretch text-xs text-muted-foreground",
            className,
          )}
          data-slot="separator-with-label"
        >
          <SeparatorPrimitive
            className="w-px flex-1 shrink bg-border"
            data-slot="separator"
            orientation="vertical"
            {...props}
          />
          <span className="uppercase tracking-wider">{children}</span>
          <SeparatorPrimitive
            className="w-px flex-1 shrink bg-border"
            data-slot="separator"
            orientation="vertical"
            {...props}
          />
        </div>
      );
    }
    return (
      <div
        className={cn(
          "flex items-center gap-3 text-xs text-muted-foreground",
          className,
        )}
        data-slot="separator-with-label"
      >
        <SeparatorPrimitive
          className="h-px flex-1 shrink bg-border"
          data-slot="separator"
          orientation="horizontal"
          {...props}
        />
        <span className="uppercase tracking-wider">{children}</span>
        <SeparatorPrimitive
          className="h-px flex-1 shrink bg-border"
          data-slot="separator"
          orientation="horizontal"
          {...props}
        />
      </div>
    );
  }

  return (
    <SeparatorPrimitive
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:not-[[class^='h-']]:not-[[class*='_h-']]:self-stretch",
        className,
      )}
      data-slot="separator"
      orientation={orientation}
      {...props}
    />
  );
}

export { SeparatorPrimitive };
