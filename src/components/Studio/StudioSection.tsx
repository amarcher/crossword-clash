import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, Eyebrow } from "../ui";

interface StudioSectionProps {
  title: string;
  /** Open on first render; after that the constructor's own toggles rule. */
  defaultOpen?: boolean;
  /** Controls on the header line (e.g. Versions' Save), kept clickable while closed. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * A setup card that folds to its title, so the desk's side column holds every
 * tool without growing past the screen. Native `<details>`, so it needs no
 * script to open and the browser's find-in-page still reaches folded text.
 */
export function StudioSection({ title, defaultOpen = false, action, children }: StudioSectionProps) {
  // Read once: `open` on a <details> is only the starting state.
  const [initiallyOpen] = useState(defaultOpen);
  return (
    <Card className="relative">
      <details className="group" open={initiallyOpen}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-2 hover:bg-surface-sunken/60 focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 shrink-0 -rotate-90 text-subtle transition-transform group-open:rotate-0 motion-reduce:transition-none" aria-hidden="true" />
          <Eyebrow as="h2">{title}</Eyebrow>
        </summary>
        <div className="px-4 pb-4">{children}</div>
      </details>
      {action && <div className="absolute top-1 right-2">{action}</div>}
    </Card>
  );
}
