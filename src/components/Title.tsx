import { lazy, Suspense } from "react";

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

export function Title({ className = "", animate = false }: TitleProps) {
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (animate) {
    return (
      <div className={`text-center ${className}`}>
        {/* fallback reserves the box (transparent) so layout doesn't shift while
            the chunk/JSON load, then the wordmark flips into it. Under reduced
            motion the logo rests on its final assembled frame. */}
        <Suspense fallback={<div className="mx-auto" style={ANIM_BOX} />}>
          <AnimatedLogo className="mx-auto" style={ANIM_BOX} autoplay={!reduceMotion} />
        </Suspense>
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
