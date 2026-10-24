/**
 * Who gets into /studio (docs/monetization-spec.md §2.2), as pure rules so the
 * route config, the Vite build and the gate screen agree and can be tested.
 *
 * - Dev builds and `VITE_STUDIO=1` builds skip the gate entirely (the
 *   constructor's own browser), as before Plus.
 * - A production web build with `VITE_PLUS=1` registers the route and gates it:
 *   the editor renders for a Plus subscriber or a studio admin; everyone else
 *   sees the Plus pitch (sign-in first when anonymous).
 * - The native apps never register the route: the studio is web-only.
 */
export interface StudioEnv {
  DEV?: boolean;
  MODE?: string;
  VITE_STUDIO?: string;
  VITE_PLUS?: string;
}

const env = (): StudioEnv => import.meta.env as unknown as StudioEnv;

/** Whether this build has a /studio route at all. */
export function studioRouteEnabled(e: StudioEnv = env()): boolean {
  if (e.DEV || e.VITE_STUDIO === "1") return true;
  return e.VITE_PLUS === "1" && e.MODE !== "mobile";
}

/** Whether this build lets anyone in without a Plus or admin check (dev, VITE_STUDIO=1). */
export function studioGateBypassed(e: StudioEnv = env()): boolean {
  return !!e.DEV || e.VITE_STUDIO === "1";
}

/** Whether the studio's worker and wasm must stay in the bundle (any build whose route can render the editor). */
export function studioAssetsNeeded(e: StudioEnv): boolean {
  return studioRouteEnabled(e);
}

/** What the studio's panels may do for this visitor. */
export interface StudioAccess {
  /** A studio admin (signed in and listed) or the studio token: everything. */
  admin: boolean;
  /** A Plus subscriber: the editor and metered Claude drafting, nothing admin-only. */
  plus: boolean;
}

export type StudioVerdict = "editor" | "sign-in" | "plus" | "loading";

/**
 * What the gate screen shows: the editor (bypass, admin or Plus), the sign-in
 * pitch (anonymous), the Plus pitch (a free account), or nothing yet.
 */
export function studioVerdict(input: { bypass: boolean; ready: boolean; plusReady: boolean; signedIn: boolean; admin: boolean; plus: boolean }): StudioVerdict {
  if (input.bypass) return "editor";
  if (!input.ready) return "loading";
  if (input.admin) return "editor";
  if (!input.plusReady) return "loading";
  if (input.plus) return "editor";
  return input.signedIn ? "plus" : "sign-in";
}
