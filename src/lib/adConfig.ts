export type AdPlacement =
  | "menu-bottom"
  | "completion-footer"
  | "import-bottom"
  | "puzzle-ready-bottom";

export interface AdPlacementConfig {
  /** AdSense ad slot ID */
  slot: string;
  /** Ad format hint for AdSense */
  format: "horizontal" | "rectangle";
  /** Tailwind max-width class */
  maxWidthClass: string;
}

const ADSENSE_PUB_ID = import.meta.env.VITE_ADSENSE_PUB_ID as
  | string
  | undefined;

export function isAdsEnabled(): boolean {
  return !!ADSENSE_PUB_ID;
}

export function getPublisherId(): string {
  return ADSENSE_PUB_ID ?? "";
}

/**
 * Per-placement config. Slot IDs are set via env vars; if not set,
 * AdSlot renders nothing (graceful degradation).
 */
export const AD_PLACEMENTS: Record<AdPlacement, AdPlacementConfig> = {
  "menu-bottom": {
    slot: (import.meta.env.VITE_AD_SLOT_MENU as string) ?? "",
    format: "horizontal",
    maxWidthClass: "max-w-xs",
  },
  "completion-footer": {
    slot: (import.meta.env.VITE_AD_SLOT_COMPLETION as string) ?? "",
    format: "horizontal",
    maxWidthClass: "max-w-md",
  },
  "import-bottom": {
    slot: (import.meta.env.VITE_AD_SLOT_IMPORT as string) ?? "",
    format: "horizontal",
    maxWidthClass: "max-w-md",
  },
  "puzzle-ready-bottom": {
    slot: (import.meta.env.VITE_AD_SLOT_PUZZLE_READY as string) ?? "",
    format: "horizontal",
    maxWidthClass: "max-w-xs",
  },
};
