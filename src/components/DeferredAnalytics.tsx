import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

/**
 * Mounts Vercel Analytics + Speed Insights only after the browser goes idle
 * (post first paint), so their scripts don't compete with the app's initial
 * render. Both are resilient to a delayed mount.
 */
export function DeferredAnalytics() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hasRIC = typeof window.requestIdleCallback === "function";
    const id = hasRIC
      ? window.requestIdleCallback(() => setShow(true), { timeout: 3000 })
      : window.setTimeout(() => setShow(true), 1500);
    return () => {
      if (hasRIC) window.cancelIdleCallback(id as number);
      else window.clearTimeout(id as number);
    };
  }, []);

  if (!show) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
