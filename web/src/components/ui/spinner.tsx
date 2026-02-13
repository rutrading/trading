import { SpinnerGapIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof SpinnerGapIcon>) {
  return (
    <SpinnerGapIcon
      aria-label="Loading"
      className={cn("animate-spin", className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };
