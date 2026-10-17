import { useLayoutEffect } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { NavigationProgress } from "../components/NavigationProgress";
import { signalRouteCommit } from "../lib/routeCommit";

/**
 * Pathless layout around every route. It holds the pieces of site chrome that
 * must outlive any one layout: scroll restoration (top on push, restored on
 * back/forward — a no-op on the full-height, overflow-hidden game screens),
 * the pending bar shown when a route's chunk is slow to arrive, and the
 * "location committed" signal the route cross-fade waits for.
 */
export function SiteFrame() {
  const { key } = useLocation();
  // After the DOM mutation, before paint: the new route is really on screen.
  useLayoutEffect(() => {
    signalRouteCommit();
  }, [key]);

  return (
    <>
      <ScrollRestoration />
      <NavigationProgress />
      <Outlet />
    </>
  );
}
