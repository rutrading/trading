import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Level = 1 | 2 | 3 | 4 | 5 | 6;

type HeadingProps = {
  level?: Level;
} & ComponentPropsWithoutRef<"h1" | "h2" | "h3" | "h4" | "h5" | "h6">;

export function Heading(props: HeadingProps) {
  const { level = 1, className, ...rest } = props;
  const Tag = `h${level}` as `h${Level}`;
  return (
    <Tag
      {...rest}
      className={cn(
        "font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-xl",
        className,
      )}
    />
  );
}

export function Subheading(props: HeadingProps) {
  const { level = 2, className, ...rest } = props;
  const Tag = `h${level}` as `h${Level}`;
  return (
    <Tag
      {...rest}
      className={cn(
        "font-heading text-base font-semibold tracking-tight text-foreground sm:text-sm",
        className,
      )}
    />
  );
}
