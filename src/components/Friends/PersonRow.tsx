import type { ReactNode } from "react";
import { PLAYER_COLORS } from "../../lib/playerColors";

/** A stable colour per username, from the room colour pool. */
export function personColor(username: string): string {
  let h = 0;
  for (const ch of username.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

export function Avatar({ username, className = "" }: { username: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-10 shrink-0 place-items-center rounded-full font-display text-base font-bold text-white ${className}`}
      style={{ backgroundColor: personColor(username) }}
    >
      {username.slice(0, 1).toUpperCase()}
    </span>
  );
}

interface PersonRowProps {
  username: string;
  /** The muted line under the name. */
  detail?: ReactNode;
  /** Actions, right-aligned; each at least 36px tall (44 on phones is the row's own height). */
  children?: ReactNode;
}

/** One person in a list: avatar, @username, a detail line, actions. 44px minimum, no left accents. */
export function PersonRow({ username, detail, children }: PersonRowProps) {
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <Avatar username={username} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold leading-snug text-ink">@{username}</span>
        {detail && <span className="mt-0.5 block truncate text-sm leading-snug text-muted">{detail}</span>}
      </span>
      {children && <span className="flex shrink-0 items-center gap-1.5">{children}</span>}
    </li>
  );
}

/** A bordered list of PersonRows with dividers (the ListGroup look). */
export function PersonList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</ul>;
}
