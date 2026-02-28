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
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="bg-red-500/90 text-white font-bold text-lg px-5 py-2 rounded-full lockout-pulse">
        {(remaining / 1000).toFixed(1)}s
      </div>
    </div>
  );
}
