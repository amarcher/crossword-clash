import { useEffect, useRef } from "react";
import {
  isAdsEnabled,
  getPublisherId,
  AD_PLACEMENTS,
  type AdPlacement,
} from "../../lib/adConfig";

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

interface AdSlotProps {
  placement: AdPlacement;
  darkMode?: boolean;
}

let scriptInjected = false;

function injectAdSenseScript() {
  if (scriptInjected) return;
  scriptInjected = true;
  const script = document.createElement("script");
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${getPublisherId()}`;
  script.async = true;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
}

export function AdSlot({ placement, darkMode = false }: AdSlotProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!isAdsEnabled() || pushed.current) return;
    // Defer the AdSense script + push to browser idle so it doesn't compete
    // with the app's initial render/paint.
    const load = () => {
      injectAdSenseScript();
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushed.current = true;
      } catch {
        // AdSense not ready yet — will retry on next mount
      }
    };
    const hasRIC = typeof window.requestIdleCallback === "function";
    const id = hasRIC
      ? window.requestIdleCallback(load, { timeout: 2500 })
      : window.setTimeout(load, 1500);
    return () => {
      if (hasRIC) window.cancelIdleCallback(id as number);
      else window.clearTimeout(id as number);
    };
  }, []);

  if (!isAdsEnabled()) return null;

  const config = AD_PLACEMENTS[placement];

  const bg = darkMode
    ? "bg-neutral-800/50 border-neutral-700"
    : "bg-neutral-50 border-neutral-200";

  return (
    <div
      className={`relative w-full ${config.maxWidthClass} rounded-lg border ${bg} overflow-hidden`}
    >
      <span
        className={`absolute top-1 right-1.5 text-[10px] leading-none ${
          darkMode ? "text-neutral-500" : "text-neutral-400"
        }`}
      >
        Ad
      </span>
      <ins
        ref={adRef}
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={getPublisherId()}
        data-ad-slot={config.slot}
        data-ad-format={config.format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
