const CONFETTI_COLORS = [
  "#f43f5e", "#3b82f6", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
];

const PARTICLE_COUNT = 24;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-10" aria-hidden>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const left = randomBetween(5, 95);
        const delay = randomBetween(0, 1.5);
        const size = randomBetween(6, 12);
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const isRect = i % 3 !== 0;

        return (
          <div
            key={i}
            className="confetti-particle absolute"
            style={{
              left: `${left}%`,
              top: `-${size}px`,
              width: `${size}px`,
              height: isRect ? `${size * 0.6}px` : `${size}px`,
              backgroundColor: color,
              borderRadius: isRect ? "1px" : "50%",
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}
