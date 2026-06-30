import { useEffect } from "react";
import { useLocation } from "react-router";
import { trackPageView } from "../lib/analytics";

/**
 * Fires a GA4 page_view on every client-side route change. Mounted once per
 * router tree (RootLayout + HostLayout). Without this, GA4 only ever sees the
 * initial HTML load — see src/lib/analytics.ts.
 */
export function usePageViews(): void {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
}
