import { useEffect, useState } from "react";

interface LockoutOverlayProps {
  lockedUntil: number;
}

export function LockoutOverlay({ lockedUntil }: LockoutOverlayProps) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (lockedUntil <= 0) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const left = Math.max(0, lockedUntil - Date.now());
      setRemaining(left);
    };

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [lockedUntil]);

  if (remaining <= 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-30 flex items-center justify-center pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 pointer-events-none"
      role="status"
      aria-live="assertive"
    >
      <div className="bg-red-500/90 text-white font-bold text-lg px-5 py-2 rounded-full lockout-pulse shadow-lg">
        {(remaining / 1000).toFixed(1)}s
      </div>
    </div>
  );
}
