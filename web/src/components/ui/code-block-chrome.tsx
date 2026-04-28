"use client";

import { useId, useState } from "react";
import { Check, Copy, FileCode, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CodeBlockTab = {
  label: string;
  code: string;
  lang: string;
  html: string;
};

type CodeBlockChromeProps = {
  tabs: CodeBlockTab[];
  picker: "tabs" | "select" | "filename";
  filename?: string;
  className?: string;
};

const HEADER_BG =
  "bg-[linear-gradient(180deg,var(--popover),color-mix(in_srgb,var(--foreground)_3%,var(--popover)))]";

const BODY_BG = "bg-neutral-100 dark:bg-neutral-900";

const LangBadge = (props: {
  bg: string;
  fg: string;
  text: string;
  className?: string;
}) => (
  <svg
    viewBox="0 0 16 16"
    aria-hidden="true"
    className={cn("size-3.5", props.className)}
  >
    <rect x="0" y="0" width="16" height="16" rx="3" fill={props.bg} />
    <text
      x="8"
      y="11.5"
      textAnchor="middle"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      fontSize="7.5"
      fontWeight="800"
      fill={props.fg}
      letterSpacing="-0.3"
    >
      {props.text}
    </text>
  </svg>
);

type IconProps = { className?: string };

const TsIcon = (p: IconProps) => (
  <LangBadge bg="#3178c6" fg="#ffffff" text="TS" className={p.className} />
);
const JsIcon = (p: IconProps) => (
  <LangBadge bg="#f7df1e" fg="#111827" text="JS" className={p.className} />
);
const PyIcon = (p: IconProps) => (
  <LangBadge bg="#3776ab" fg="#ffd43b" text="Py" className={p.className} />
);
const RsIcon = (p: IconProps) => (
  <LangBadge bg="#ce422b" fg="#ffffff" text="Rs" className={p.className} />
);
const GoIcon = (p: IconProps) => (
  <LangBadge bg="#00add8" fg="#ffffff" text="Go" className={p.className} />
);
const HtmlIcon = (p: IconProps) => (
  <LangBadge bg="#e34f26" fg="#ffffff" text="H" className={p.className} />
);
const CssIcon = (p: IconProps) => (
  <LangBadge bg="#1572b6" fg="#ffffff" text="C" className={p.className} />
);
const JsonIcon = (p: IconProps) => (
  <LangBadge bg="#737373" fg="#ffffff" text="{}" className={p.className} />
);
const MdIcon = (p: IconProps) => (
  <LangBadge bg="#0a0a0a" fg="#ffffff" text="M" className={p.className} />
);
const SqlIcon = (p: IconProps) => (
  <LangBadge bg="#00758f" fg="#ffffff" text="Sq" className={p.className} />
);
const ShIcon = (p: IconProps) => (
  <svg
    viewBox="0 0 16 16"
    aria-hidden="true"
    className={cn("size-3.5", p.className)}
  >
    <rect x="0" y="0" width="16" height="16" rx="3" fill="#1f2937" />
    <path
      d="M3.5 5.5l2.5 2.5-2.5 2.5"
      stroke="#10b981"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M7.5 11h4"
      stroke="#10b981"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const LANG_ICON: Record<string, (p: IconProps) => React.ReactElement> = {
  ts: TsIcon,
  tsx: TsIcon,
  typescript: TsIcon,
  js: JsIcon,
  jsx: JsIcon,
  javascript: JsIcon,
  py: PyIcon,
  python: PyIcon,
  rs: RsIcon,
  rust: RsIcon,
  go: GoIcon,
  html: HtmlIcon,
  css: CssIcon,
  json: JsonIcon,
  md: MdIcon,
  mdx: MdIcon,
  markdown: MdIcon,
  sql: SqlIcon,
  sh: ShIcon,
  bash: ShIcon,
  shell: ShIcon,
  zsh: ShIcon,
};

const FallbackIcon = (p: IconProps) => (
  <FileCode className={cn("size-3.5 opacity-70", p.className)} />
);

const iconFor = (lang: string) =>
  LANG_ICON[lang.toLowerCase()] ?? FallbackIcon;

export const CodeBlockChrome = (props: CodeBlockChromeProps) => {
  const first = props.tabs[0];
  if (!first) return null;
  if (props.picker === "filename") {
    return (
      <Card className={props.className}>
        <header
          className={cn(
            "flex h-9 items-center gap-2 border-border border-b px-3",
            HEADER_BG,
          )}
        >
          <span className="font-mono text-foreground/80 text-xs">
            {props.filename ?? first.label}
          </span>
          <div className="ml-auto">
            <CopyButton code={first.code} />
          </div>
        </header>
        <CodeArea html={first.html} />
      </Card>
    );
  }
  if (props.picker === "select") {
    return <SelectPickerCard tabs={props.tabs} className={props.className} />;
  }
  return (
    <TabsCard
      tabs={props.tabs}
      filename={props.filename}
      className={props.className}
    />
  );
};

const TabsCard = (props: {
  tabs: CodeBlockTab[];
  filename?: string;
  className?: string;
}) => {
  const [active, setActive] = useState(props.tabs[0]?.label ?? "");
  const layoutId = useId();
  const current = props.tabs.find((t) => t.label === active) ?? props.tabs[0];
  if (!current) return null;
  const tabsRow = (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {props.tabs.map((t) => {
        const isActive = t.label === current.label;
        const TabIcon = iconFor(t.lang);
        return (
          <button
            key={t.label}
            type="button"
            onClick={() => setActive(t.label)}
            className={cn(
              "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-mono text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-muted"
                transition={{ type: "spring", duration: 0.3, bounce: 0.15 }}
              />
            ) : null}
            <TabIcon className="relative z-10 size-3.5" />
            <span className="relative z-10">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <Card className={props.className}>
      <header
        className={cn(
          "flex h-9 items-center gap-2 border-border border-b px-3",
          HEADER_BG,
        )}
      >
        {props.filename ? (
          <>
            <span className="font-mono text-foreground/80 text-xs">
              {props.filename}
            </span>
            <div className="ml-auto">{tabsRow}</div>
          </>
        ) : (
          <div>{tabsRow}</div>
        )}
        <CopyButton code={current.code} className={props.filename ? undefined : "ml-auto"} />
      </header>
      <CodeArea html={current.html} />
    </Card>
  );
};

const SelectPickerCard = (props: {
  tabs: CodeBlockTab[];
  className?: string;
}) => {
  const [active, setActive] = useState(props.tabs[0]?.label ?? "");
  const current = props.tabs.find((t) => t.label === active) ?? props.tabs[0];
  if (!current) return null;
  const Icon = iconFor(current.lang);
  return (
    <Card className={props.className}>
      <header
        className={cn(
          "flex h-9 items-center gap-2 border-border border-b px-3",
          HEADER_BG,
        )}
      >
        <Select
          value={active}
          onValueChange={(v) => v && setActive(String(v))}
        >
          <SelectTrigger size="sm" className="w-fit">
            <Icon className="size-3.5" />
            <SelectValue>
              {() => (
                <span className="font-mono text-xs">{current.label}</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {props.tabs.map((t) => {
              const TabIcon = iconFor(t.lang);
              return (
                <SelectItem key={t.label} value={t.label}>
                  <span className="flex items-center gap-2">
                    <TabIcon className="size-3.5" />
                    <span className="font-mono text-xs">{t.label}</span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectPopup>
        </Select>
        <div className="ml-auto">
          <CopyButton code={current.code} />
        </div>
      </header>
      <CodeArea html={current.html} />
    </Card>
  );
};

const CodeArea = (props: { html: string }) => (
  <div
    className={cn(
      "overflow-auto px-3 py-3 font-mono text-xs leading-5 [&_.shiki]:bg-transparent! [&_.shiki]:outline-none [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:outline-none [&_.shiki[data-line-numbers]_[data-line]::before]:hidden",
      BODY_BG,
    )}
    // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-rendered Shiki output
    dangerouslySetInnerHTML={{ __html: props.html }}
  />
);

type CopyState = "idle" | "done" | "error";

const ICON_TRANSITION = { duration: 0.15, ease: "easeOut" as const };
const ICON_VARIANTS = {
  initial: { opacity: 0, scale: 0.8, filter: "blur(2px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.8 },
};

const CopyButton = (props: { code: string; className?: string }) => {
  const [state, setState] = useState<CopyState>("idle");
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.code);
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={
        state === "done"
          ? "Copied"
          : state === "error"
            ? "Copy failed"
            : "Copy"
      }
      onClick={onCopy}
      className={props.className}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {state === "idle" ? (
          <motion.span key="idle" {...ICON_VARIANTS} transition={ICON_TRANSITION}>
            <Copy />
          </motion.span>
        ) : state === "done" ? (
          <motion.span key="done" {...ICON_VARIANTS} transition={ICON_TRANSITION}>
            <Check strokeWidth={3} />
          </motion.span>
        ) : (
          <motion.span key="error" {...ICON_VARIANTS} transition={ICON_TRANSITION}>
            <X />
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
};
