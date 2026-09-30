"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId, type ReactNode } from "react";

export type DataCardProps = {
  title?: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  variant?: "solid" | "glass";
  padding?: "none" | "compact" | "comfortable";
  interactive?: boolean;
  overflow?: "hidden" | "visible";
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
};

const paddingClasses: Record<NonNullable<DataCardProps["padding"]>, string> = {
  none: "",
  compact: "p-5 sm:p-6",
  comfortable: "p-6 sm:p-7 lg:p-8",
};

export function DataCard({
  title,
  description,
  eyebrow,
  action,
  children,
  variant = "solid",
  padding = "comfortable",
  interactive = false,
  overflow = "hidden",
  className = "",
  contentClassName = "",
  ariaLabel,
}: DataCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const hasHeader = Boolean(title || description || eyebrow || action);

  return (
    <motion.section
      aria-label={!title ? ariaLabel : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      initial={false}
      whileHover={interactive && !prefersReducedMotion ? { scale: 1.004, y: -2 } : undefined}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.72 }}
      className={`relative ${overflow === "hidden" ? "overflow-hidden" : "overflow-visible"} rounded-[1.5rem] border border-line ${
        variant === "glass" ? "bg-surface-glass backdrop-blur-xl" : "bg-surface"
      } shadow-panel ${paddingClasses[padding]} ${interactive ? "transition-shadow hover:shadow-floating" : ""} ${className}`}
    >
      {variant === "glass" ? (
        <span
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--card-highlight)] to-transparent"
          aria-hidden="true"
        />
      ) : null}

      {hasHeader ? (
        <header className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-ink">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 id={titleId} className={`${eyebrow ? "mt-2" : ""} text-lg font-bold tracking-[-0.02em] text-ink`}>
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="mt-1.5 max-w-3xl text-sm font-light leading-6 text-muted">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}

      <div className={`${hasHeader ? "mt-6" : ""} relative ${contentClassName}`}>{children}</div>
    </motion.section>
  );
}
