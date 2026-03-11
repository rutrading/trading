"use client";

import * as React from "react";
import { motion } from "motion/react";
import { CheckIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

type StepStatus = "completed" | "active" | "upcoming";

interface Step {
  label: string;
  icon: React.ReactNode;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

function getStatus(index: number, currentStep: number): StepStatus {
  if (index < currentStep) return "completed";
  if (index === currentStep) return "active";
  return "upcoming";
}

function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-slot="stepper"
    >
      {/* Circle row: circles and connector lines, vertically centered */}
      <div className="flex items-center">
        {steps.map((step, index) => {
          const status = getStatus(index, currentStep);
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.label}>
              <motion.div
                animate={{
                  backgroundColor:
                    status === "completed" || status === "active"
                      ? "var(--color-primary)"
                      : "transparent",
                  borderColor:
                    status === "upcoming"
                      ? "var(--color-border)"
                      : "var(--color-primary)",
                }}
                className="flex size-10 shrink-0 items-center justify-center rounded-full border-2"
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {status === "completed" ? (
                  <motion.div
                    animate={{ opacity: 1, scale: 1 }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  >
                    <CheckIcon
                      className="size-4 text-primary-foreground"
                      weight="bold"
                    />
                  </motion.div>
                ) : (
                  <div
                    className={cn(
                      "[&_svg]:size-4 [&_svg]:pointer-events-none",
                      status === "active"
                        ? "text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {step.icon}
                  </div>
                )}
              </motion.div>
              {!isLast && (
                <div className="relative mx-2 flex flex-1 items-center">
                  <div className="h-0.5 w-full bg-border" />
                  <motion.div
                    animate={{ scaleX: status === "completed" ? 1 : 0 }}
                    className="absolute inset-x-0 h-0.5 origin-left bg-primary"
                    initial={false}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Label row: evenly spaced labels aligned under each circle */}
      <div className="flex">
        {steps.map((step, index) => {
          const status = getStatus(index, currentStep);
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.label}>
              <span
                className={cn(
                  "w-10 shrink-0 select-none text-center text-xs font-medium",
                  status === "upcoming"
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {step.label}
              </span>
              {/* spacer to match the connector width above */}
              {!isLast && <div className="mx-2 flex-1" />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export { Stepper };
export type { Step, StepperProps };
