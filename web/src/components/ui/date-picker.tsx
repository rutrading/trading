"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import type { DateRange, DropdownProps } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CalendarProps = React.ComponentProps<typeof Calendar>;
type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type PopupAlign = React.ComponentProps<typeof PopoverPopup>["align"];

type SingleVariantProps = {
  mode?: "single";
  value?: Date;
  onValueChange?: (value: Date | undefined) => void;
};

type RangeVariantProps = {
  mode: "range";
  value?: DateRange;
  onValueChange?: (value: DateRange | undefined) => void;
  numberOfMonths?: number;
};

type CommonProps = {
  placeholder?: React.ReactNode;
  /** date-fns format string. Default `"PPP"` for single, `"LLL dd, y"` for range. */
  formatStr?: string;
  triggerClassName?: string;
  triggerVariant?: ButtonVariant;
  /** Controlled popover open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Auto-close the popover when a selection is made (range closes after both dates). */
  closeOnSelect?: boolean;
  /** Content rendered inside the popover before the Calendar (preset rails, etc.). */
  beforeCalendar?: React.ReactNode;
  popupAlign?: PopupAlign;
  popupClassName?: string;
  defaultMonth?: Date;
  month?: Date;
  onMonthChange?: (month: Date) => void;
  captionLayout?: CalendarProps["captionLayout"];
  startMonth?: Date;
  endMonth?: Date;
  components?: CalendarProps["components"];
  id?: string;
  disabled?: boolean;
};

export type DatePickerProps = CommonProps &
  (SingleVariantProps | RangeVariantProps);

const CalendarSelectDropdown = (props: DropdownProps) => {
  const { options, value, onChange, "aria-label": ariaLabel } = props;
  const current = value !== undefined ? String(value) : undefined;
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        if (!onChange || next === null) return;
        const event = {
          target: { value: String(next) },
        } as unknown as React.ChangeEvent<HTMLSelectElement>;
        onChange(event);
      }}
    >
      <SelectTrigger size="sm" className="min-w-0" aria-label={ariaLabel}>
        <SelectValue>
          {(v) =>
            options?.find((o) => String(o.value) === String(v))?.label ??
            (v as React.ReactNode)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectPopup className="max-h-60">
        {options?.map((opt) => (
          <SelectItem
            key={opt.value}
            value={String(opt.value)}
            disabled={opt.disabled}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
};

const formatRange = (range: DateRange, fmt: string): string => {
  if (!range.from) return "";
  if (!range.to) return format(range.from, fmt);
  return `${format(range.from, fmt)} – ${format(range.to, fmt)}`;
};

export const DatePicker = (props: DatePickerProps) => {
  const isRange = props.mode === "range";
  const fmt = props.formatStr ?? (isRange ? "LLL dd, y" : "PPP");
  const placeholder =
    props.placeholder ?? (isRange ? "Pick a date range" : "Pick a date");

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = props.open !== undefined;
  const open = isControlled ? props.open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    props.onOpenChange?.(next);
  };

  let label: React.ReactNode = (
    <span className="text-muted-foreground">{placeholder}</span>
  );
  if (isRange) {
    const range = props.value as DateRange | undefined;
    if (range?.from) label = formatRange(range, fmt);
  } else {
    const date = props.value as Date | undefined;
    if (date) label = format(date, fmt);
  }

  const components: CalendarProps["components"] =
    props.captionLayout === "dropdown" ||
    props.captionLayout === "dropdown-months" ||
    props.captionLayout === "dropdown-years"
      ? { Dropdown: CalendarSelectDropdown, ...(props.components ?? {}) }
      : props.components;

  const defaultMonth =
    props.defaultMonth ??
    (isRange
      ? (props.value as DateRange | undefined)?.from
      : (props.value as Date | undefined));

  const calendarShared = {
    defaultMonth,
    month: props.month,
    onMonthChange: props.onMonthChange,
    captionLayout: props.captionLayout,
    startMonth: props.startMonth,
    endMonth: props.endMonth,
    components,
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={props.id}
        disabled={props.disabled}
        render={
          <Button
            className={cn(
              "w-[260px] justify-start font-normal",
              props.triggerClassName,
            )}
            variant={props.triggerVariant ?? "outline"}
          />
        }
      >
        <CalendarIcon aria-hidden="true" />
        {label}
      </PopoverTrigger>
      <PopoverPopup
        align={props.popupAlign ?? "start"}
        className={props.popupClassName}
      >
        <div className={cn(props.beforeCalendar && "flex max-sm:flex-col")}>
          {props.beforeCalendar}
          {isRange ? (
            <Calendar
              mode="range"
              selected={props.value as DateRange | undefined}
              onSelect={(next) => {
                (
                  props.onValueChange as
                    | ((v: DateRange | undefined) => void)
                    | undefined
                )?.(next);
                if (props.closeOnSelect && next?.from && next?.to) {
                  setOpen(false);
                }
              }}
              numberOfMonths={
                (props as RangeVariantProps).numberOfMonths ?? 2
              }
              className={props.beforeCalendar ? "sm:ps-2" : undefined}
              {...calendarShared}
            />
          ) : (
            <Calendar
              mode="single"
              selected={props.value as Date | undefined}
              onSelect={(next) => {
                (
                  props.onValueChange as
                    | ((v: Date | undefined) => void)
                    | undefined
                )?.(next);
                if (props.closeOnSelect && next) setOpen(false);
              }}
              className={props.beforeCalendar ? "sm:ps-2" : undefined}
              {...calendarShared}
            />
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
};
