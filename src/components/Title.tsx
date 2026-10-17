import { lazy, Suspense, useEffect, useState } from "react";

// Lazy so lottie-react + the animation JSON load only where the logo animates.
const AnimatedLogo = lazy(() => import("./AnimatedLogo"));

interface TitleProps {
  variant?: "light" | "dark";
  className?: string;
  /** Construct the wordmark via a one-shot Lottie animation instead of the static image. */
  animate?: boolean;
}

// Comp aspect of the animation (see crossword-lottie/scripts/build-crossword-logo.mjs).
// Two rows of crossword cells — wide and short — sized by width so it scales
// down on narrow screens.
const ANIM_BOX = { width: "min(92vw, 600px)", aspectRatio: "1222 / 326" } as const;

/** Set once the intro has played this tab session; later menu visits rest on the still. */
export const LOGO_INTRO_PLAYED_KEY = "crossword-clash:logo-intro-played";

function introAlreadyPlayed(): boolean {
  try {
    return sessionStorage.getItem(LOGO_INTRO_PLAYED_KEY) === "1";
  } catch {
    return false;
  }
}

function markIntroPlayed(): void {
  try {
    sessionStorage.setItem(LOGO_INTRO_PLAYED_KEY, "1");
  } catch {
    // Storage blocked: the intro simply plays again next time.
  }
}

/**
 * Whether this mount should play the intro: once per tab session, and never
 * under reduced motion. Decided once at mount so a re-render mid-animation
 * can't swap the player for the still.
 */
function useIntroPlayback(animate: boolean): boolean {
  const [play] = useState(() => {
    if (!animate || typeof window === "undefined") return false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return !introAlreadyPlayed();
  });
  useEffect(() => {
    if (play) markIntroPlayed();
  }, [play]);
  return play;
}

export function Title({ className = "", animate = false }: TitleProps) {
  const play = useIntroPlayback(animate);

  if (animate) {
    return (
      <div className={`text-center ${className}`}>
        {play ? (
          /* fallback reserves the box (transparent) so layout doesn't shift while
             the chunk/JSON load, then the wordmark flips into it. */
          <Suspense fallback={<div className="mx-auto" style={ANIM_BOX} />}>
            <AnimatedLogo className="mx-auto" style={ANIM_BOX} autoplay />
          </Suspense>
        ) : (
          /* The animation's final frame as a still: logo.png is rendered from the
             same comp (crossword-lottie/scripts/render-still.mjs) at the same
             aspect, so it fills the box pixel-for-pixel without loading lottie.
             Also what reduced motion gets. */
          <img src="/logo.png" alt="Crossword Clash" className="mx-auto object-contain" style={ANIM_BOX} />
        )}
      </div>
    );
  }

  return (
    <div className={`text-center ${className}`}>
      <img
        src="/logo.png"
        alt="Crossword Clash"
        className="h-36 mx-auto object-contain"
      />
    </div>
  );
}
