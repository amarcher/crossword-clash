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
// The wordmark's width inside the comp: 2292 of 2444 (= 1222 × 2) units.
const STILL_WIDTH = { width: `${((2292 / 2444) * 100).toFixed(3)}%` } as const;

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
          /* The animation's final frame as a still, without loading lottie (also
             what reduced motion gets). logo.png is the wordmark rendered from the
             same comp (crossword-lottie/scripts/render-still.mjs) and cropped to
             its opaque pixels, which the comp pads by 76px on every side — so it
             sits centred in the animation's box at the wordmark's share of it. */
          <div className="mx-auto flex items-center justify-center" style={ANIM_BOX}>
            <img src="/logo.png" alt="Crossword Clash" width={2292} height={500} className="h-auto" style={STILL_WIDTH} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`text-center ${className}`}>
      <img
        src="/logo.png"
        alt="Crossword Clash"
        width={2292}
        height={500}
        className="mx-auto h-28 w-auto"
      />
    </div>
  );
}
