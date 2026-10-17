import { useEffect, useState } from "react";
import { useNavigation } from "react-router";
import { useTranslation } from "react-i18next";

/** A navigation pending for longer than this gets the bar; quicker hops get nothing. */
export const PROGRESS_DELAY_MS = 150;

/**
 * A 2 px brand-coloured bar along the top of the viewport while a navigation is
 * loading its route chunk. It appears only once the navigation has been pending
 * for PROGRESS_DELAY_MS, so a warm hop never flashes it, and goes the moment
 * the router settles. The sweep is CSS (index.css) and stops under
 * prefers-reduced-motion, leaving a steady bar.
 */
export function NavigationProgress() {
  const { t } = useTranslation();
  const pending = useNavigation().state === "loading";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), PROGRESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!visible) return null;
  return (
    <div role="progressbar" aria-label={t("common.loadingPage")} className="nav-progress">
      <span className="nav-progress-sweep" />
    </div>
  );
}
