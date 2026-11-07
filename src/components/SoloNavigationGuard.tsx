import { useBlocker } from "react-router";

/** Mounted only under a data router. A failed checkpoint keeps the only copy open. */
export function SoloNavigationGuard({ saveBeforeLeave }: { saveBeforeLeave: () => boolean }) {
  useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && !saveBeforeLeave());
  return null;
}
