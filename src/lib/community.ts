/**
 * The community-puzzles launch switch (docs/community-puzzles-spec.md
 * decision 13). The `/puzzles` routes, the menu row, the studio's Publish
 * button and the account page's "Your puzzles" card exist only with
 * VITE_COMMUNITY=1, so the migration and the edge functions can ship dark and
 * Andrew flips it once the publishing terms are live.
 */
export function communityEnabled(env: { VITE_COMMUNITY?: string } = import.meta.env as { VITE_COMMUNITY?: string }): boolean {
  return env.VITE_COMMUNITY === "1";
}

/**
 * The date of the last change to the terms' publishing sections
 * (legalContent.ts: "Publishing puzzles", "Community rules", "Reports,
 * removal and blocking"). accept_publishing_terms() records it; a newer
 * version re-shows the checkbox in the publish dialog.
 */
export const PUBLISHING_TERMS_VERSION = "2026-10-28";
