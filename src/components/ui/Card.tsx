import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl bg-surface border border-line shadow-card ${className}`} {...rest} />;
}

/** Small uppercase label that heads a section or card. */
export function Eyebrow({ className = "", ...rest }: HTMLAttributes<HTMLElement>) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.08em] text-subtle ${className}`} {...rest} />;
}
