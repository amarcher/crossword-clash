import { useEffect, useRef, useState, type CSSProperties } from "react";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";

interface LottieDoc {
  op?: number;
  fr?: number;
  [k: string]: unknown;
}

/**
 * The Crossword Clash wordmark, built from real font glyphs seated in crossword
 * cells that flip in Wordle-style (see crossword-lottie/scripts/build-crossword-logo.mjs).
 * Transparent background so it sits on any surface. Default export so it can be
 * React.lazy()'d — keeps lottie-react out of every bundle except the menu.
 *
 * Playback is driven MANUALLY with a per-frame, capped-delta loop instead of
 * lottie-web's built-in autoplay. lottie-web is time-based: if the flip starts
 * while the main thread is slammed by initial app load, its first frame computes
 * a huge elapsed time and jumps straight to the end — the animation "pops in"
 * with no visible motion. Capping the per-tick advance (≤3 frames) makes a stall
 * cost a few dropped frames at most, never a skip-to-end, at correct speed on any
 * refresh rate. Under reduced motion we rest on the finished frame.
 */
export default function AnimatedLogo({
  className = "",
  style,
  autoplay = true,
}: {
  className?: string;
  style?: CSSProperties;
  autoplay?: boolean;
}) {
  const [data, setData] = useState<LottieDoc | null>(null);
  const ref = useRef<LottieRefCurrentProps | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    let active = true;
    import("../assets/logo-intro.json").then((m) => {
      if (active) setData((m.default ?? m) as LottieDoc);
    });
    return () => {
      active = false;
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const startPlayback = () => {
    const lottie = ref.current;
    if (!lottie || !data?.op) return;
    const total = data.op;
    const fps = data.fr ?? 60;
    let frame = 0;
    let last = performance.now();
    lottie.goToAndStop(0, true);
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      frame += Math.min(dt * fps, 3); // capped: a stall drops frames, never skips to end
      if (frame >= total - 1) {
        lottie.goToAndStop(total - 1, true);
        return;
      }
      lottie.goToAndStop(frame, true);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  // Start once lottie is ready. Reduced motion: rest on the finished frame.
  const handleReady = () => {
    if (!autoplay) {
      if (data?.op) ref.current?.goToAndStop(data.op - 1, true);
      return;
    }
    startPlayback();
  };

  return (
    <div className={className} style={style} role="img" aria-label="Crossword Clash">
      {data && (
        <Lottie
          lottieRef={ref}
          animationData={data}
          loop={false}
          autoplay={false}
          onDOMLoaded={handleReady}
          rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}
