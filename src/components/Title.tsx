import { lazy, Suspense } from "react";
import { useHydrated } from "../lib/hydration";

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
  // The prerendered menu (and its hydration pass) carries only the reserved
  // box: a Suspense boundary that suspends under renderToString is emitted as
  // "client-render me", which React then reports as a hydration error. The
  // Lottie mounts on the render after hydration; a plain client render mounts
  // it straight away as before.
  const hydrated = useHydrated();

  if (animate) {
    // The box reserves the space (transparent) so layout doesn't shift while
    // the chunk/JSON load, then the wordmark flips into it. Under reduced
    // motion the logo rests on its final assembled frame.
    const box = <div className="mx-auto" style={ANIM_BOX} />;
    return (
      <div className={`text-center ${className}`}>
        {hydrated ? (
          <Suspense fallback={box}>
            <AnimatedLogo className="mx-auto" style={ANIM_BOX} autoplay={!reduceMotion} />
          </Suspense>
        ) : (
          box
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
