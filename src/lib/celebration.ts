/**
 * Pure, testable logic for the completion celebration (confetti + win chime).
 *
 * Keeping the maths here (out of the React component / WebAudio glue) means the
 * one-shot guard and the particle physics can be unit-tested deterministically,
 * while the side-effecting parts (canvas drawing, AudioContext) stay thin.
 */

/** Brand palette for confetti — bright but on-theme with the app accents. */
export const CONFETTI_COLORS = [
  "#f43f5e", "#3b82f6", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
] as const;

export type ConfettiShape = "rect" | "circle";

export interface Particle {
  /** Position in CSS pixels relative to the canvas. */
  x: number;
  y: number;
  /** Velocity in pixels per second. */
  vx: number;
  vy: number;
  /** Rotation (radians) and angular velocity (radians/sec). */
  rot: number;
  vrot: number;
  /** Edge length in pixels. */
  size: number;
  color: string;
  shape: ConfettiShape;
  /** Lifetime accumulator in seconds — drives fade-out. */
  age: number;
  /** Total life before the particle is fully transparent (seconds). */
  ttl: number;
}

export interface ConfettiOptions {
  /** Downward acceleration in px/s². */
  gravity: number;
  /** Per-second velocity retention (air drag), 0–1. */
  drag: number;
}

export const DEFAULT_CONFETTI_OPTIONS: ConfettiOptions = {
  gravity: 900,
  drag: 0.86,
};

/** How long the burst runs before the canvas is torn down. */
export const CONFETTI_DURATION_MS = 2600;

/**
 * One-shot guard: the celebration should fire only on the *transition* into the
 * completed state, never when a finished puzzle is restored on reload (where the
 * modal is already open on first render) and never on incidental re-renders.
 *
 * @param prevOpen  the modal's `open` value on the previous render
 * @param open      the modal's `open` value on this render
 */
export function isFreshCompletion(prevOpen: boolean, open: boolean): boolean {
  return open && !prevOpen;
}

/**
 * Build a celebratory burst of particles fired upward-and-outward from a point
 * near the top-centre of the canvas (where the trophy sits).
 *
 * Deterministic when given a seeded `rng`, so particle generation is testable.
 */
export function createParticles(
  count: number,
  width: number,
  height: number,
  rng: () => number = Math.random,
): Particle[] {
  const particles: Particle[] = [];
  const originX = width / 2;
  const originY = height * 0.3;

  for (let i = 0; i < count; i++) {
    // Fan the launch angle across the upper hemisphere so confetti sprays out
    // and to the sides before gravity pulls it down.
    const angle = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 1.1;
    const speed = 320 + rng() * 480;

    particles.push({
      x: originX + (rng() - 0.5) * width * 0.25,
      y: originY + (rng() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: rng() * Math.PI * 2,
      vrot: (rng() - 0.5) * 12,
      size: 6 + rng() * 8,
      color: CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length)],
      shape: rng() < 0.5 ? "rect" : "circle",
      age: 0,
      ttl: 1.6 + rng() * 1.0,
    });
  }

  return particles;
}

/**
 * Advance a single particle by `dt` seconds. Pure — returns a new particle so
 * the physics can be asserted in tests without a canvas.
 */
export function stepParticle(
  p: Particle,
  dt: number,
  options: ConfettiOptions = DEFAULT_CONFETTI_OPTIONS,
): Particle {
  // Frame-rate independent drag: scale the per-second retention by dt.
  const dragFactor = Math.pow(options.drag, dt);
  const vx = p.vx * dragFactor;
  const vy = p.vy * dragFactor + options.gravity * dt;

  return {
    ...p,
    x: p.x + vx * dt,
    y: p.y + vy * dt,
    vx,
    vy,
    rot: p.rot + p.vrot * dt,
    age: p.age + dt,
  };
}

/** Remaining opacity for a particle, easing out over the back half of its life. */
export function particleOpacity(p: Particle): number {
  const remaining = 1 - p.age / p.ttl;
  if (remaining <= 0) return 0;
  // Stay fully opaque for the first 60% of life, then fade.
  const fadeStart = 0.6;
  const t = p.age / p.ttl;
  if (t < fadeStart) return 1;
  return Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart));
}

/** True once a particle has fully faded and can be culled. */
export function isParticleDead(p: Particle): boolean {
  return p.age >= p.ttl;
}

/**
 * Whether large motion should be suppressed. Guards for environments without
 * `matchMedia` (jsdom / SSR), where we default to *allowing* motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Notes for the win chime — a bright major arpeggio resolving up an octave.
 * Pure data so the melody is testable and the player stays trivial.
 */
export interface ChimeNote {
  /** Frequency in Hz. */
  freq: number;
  /** Start offset from chime start, in seconds. */
  start: number;
  /** Duration in seconds. */
  duration: number;
}

export const WIN_CHIME_NOTES: readonly ChimeNote[] = [
  { freq: 523.25, start: 0.0, duration: 0.16 },  // C5
  { freq: 659.25, start: 0.09, duration: 0.16 }, // E5
  { freq: 783.99, start: 0.18, duration: 0.18 }, // G5
  { freq: 1046.5, start: 0.27, duration: 0.34 }, // C6
];
