"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

const useChart = () => {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within a <ChartContainer />");
  return ctx;
};

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
};

export const ChartContainer = ({
  id,
  className,
  children,
  config,
  ...rest
}: ChartContainerProps) => {
  const uid = React.useId();
  const chartId = `chart-${id ?? uid.replace(/:/g, "")}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...rest}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
};

export const ChartStyle = (props: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(props.config).filter(
    ([, c]) => c.theme || c.color,
  );
  if (!colorConfig.length) return null;
  const css = Object.entries(THEMES)
    .map(
      ([theme, prefix]) => `
${prefix} [data-chart=${props.id}] {
${colorConfig
  .map(([key, item]) => {
    const color =
      item.theme?.[theme as keyof typeof item.theme] ?? item.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .filter(Boolean)
  .join("\n")}
}
`,
    )
    .join("\n");
  // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted CSS string built from chart config
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
};

export const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown> & { fill?: string };
};

type ChartTooltipContentProps = Omit<
  React.ComponentProps<"div">,
  "color" | "content"
> & {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: React.ReactNode;
  labelFormatter?: (
    label: React.ReactNode,
    payload: TooltipPayloadItem[],
  ) => React.ReactNode;
  formatter?: (
    value: number | string | undefined,
    name: string | number | undefined,
    item: TooltipPayloadItem,
    index: number,
    payload: unknown,
  ) => React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "line" | "dot" | "dashed";
  nameKey?: string;
  labelKey?: string;
  color?: string;
  labelClassName?: string;
};

export const ChartTooltipContent = ({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) => {
  const { config } = useChart();
  const tooltipLabel = (() => {
    if (hideLabel || !payload?.length) return null;
    const [item] = payload;
    const key = `${labelKey || item?.dataKey || item?.name || "value"}`;
    const itemConfig = getPayloadConfig(config, item, key);
    const value =
      !labelKey && typeof label === "string"
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label;
    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }
    if (!value) return null;
    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  })();
  if (!active || !payload?.length) return null;
  const nestLabel = payload.length === 1 && indicator !== "dot";
  return (
    <div
      className={cn(
        "border-border/50 bg-popover text-popover-foreground grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || "value"}`;
          const itemConfig = getPayloadConfig(config, item, key);
          const indicatorColor = color || item.payload?.fill || item.color;
          return (
            <div
              key={item.dataKey ?? index}
              className={cn(
                "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                indicator === "dot" && "items-center",
              )}
            >
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn(
                          "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                          {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1": indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent":
                              indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed",
                          },
                        )}
                        style={
                          {
                            "--color-bg": indicatorColor,
                            "--color-border": indicatorColor,
                          } as React.CSSProperties
                        }
                      />
                    )
                  )}
                  <div
                    className={cn(
                      "flex flex-1 justify-between leading-none",
                      nestLabel ? "items-end" : "items-center",
                    )}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? tooltipLabel : null}
                      <span className="text-muted-foreground">
                        {itemConfig?.label || item.name}
                      </span>
                    </div>
                    {item.value !== undefined && item.value !== null && (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {Number(item.value).toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ChartLegend = RechartsPrimitive.Legend;

type LegendPayloadItem = {
  value?: string | number;
  dataKey?: string | number;
  color?: string;
};

type ChartLegendContentProps = React.ComponentProps<"div"> & {
  payload?: LegendPayloadItem[];
  verticalAlign?: "top" | "bottom" | "middle";
  hideIcon?: boolean;
  nameKey?: string;
};

export const ChartLegendContent = ({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: ChartLegendContentProps) => {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || "value"}`;
        const itemConfig = getPayloadConfig(config, item, key);
        return (
          <div
            key={String(item.value)}
            className="[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
            )}
            {itemConfig?.label}
          </div>
        );
      })}
    </div>
  );
};

const getPayloadConfig = (
  config: ChartConfig,
  payload: unknown,
  key: string,
) => {
  if (typeof payload !== "object" || payload === null) return undefined;
  const inner =
    "payload" in payload &&
    typeof (payload as { payload?: unknown }).payload === "object" &&
    (payload as { payload: unknown }).payload !== null
      ? ((payload as { payload: Record<string, unknown> }).payload)
      : undefined;
  let labelKey: string = key;
  if (
    key in payload &&
    typeof (payload as Record<string, unknown>)[key] === "string"
  ) {
    labelKey = (payload as Record<string, string>)[key];
  } else if (
    inner &&
    key in inner &&
    typeof inner[key] === "string"
  ) {
    labelKey = inner[key] as string;
  }
  return labelKey in config
    ? config[labelKey]
    : config[key as keyof typeof config];
};
