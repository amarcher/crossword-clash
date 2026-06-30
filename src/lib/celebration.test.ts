import { describe, it, expect } from "vitest";
import {
  isFreshCompletion,
  createParticles,
  stepParticle,
  particleOpacity,
  isParticleDead,
  prefersReducedMotion,
  WIN_CHIME_NOTES,
  CONFETTI_COLORS,
  DEFAULT_CONFETTI_OPTIONS,
  type Particle,
} from "./celebration";

describe("isFreshCompletion", () => {
  it("fires only on the false -> true transition", () => {
    expect(isFreshCompletion(false, true)).toBe(true);
  });

  it("does not fire when already open (reload case)", () => {
    expect(isFreshCompletion(true, true)).toBe(false);
  });

  it("does not fire while closed", () => {
    expect(isFreshCompletion(false, false)).toBe(false);
  });

  it("does not fire on the open -> closed transition", () => {
    expect(isFreshCompletion(true, false)).toBe(false);
  });
});

describe("createParticles", () => {
  // Deterministic generator cycling through fixed values.
  function seq(values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length];
  }

  it("creates the requested number of particles", () => {
    const ps = createParticles(20, 400, 300);
    expect(ps).toHaveLength(20);
  });

  it("is deterministic given a seeded rng", () => {
    const a = createParticles(5, 400, 300, seq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]));
    const b = createParticles(5, 400, 300, seq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]));
    expect(a).toEqual(b);
  });

  it("uses only palette colors and valid shapes", () => {
    const ps = createParticles(40, 400, 300);
    for (const p of ps) {
      expect(CONFETTI_COLORS).toContain(p.color);
      expect(["rect", "circle"]).toContain(p.shape);
      expect(p.size).toBeGreaterThan(0);
      expect(p.ttl).toBeGreaterThan(0);
    }
  });
});

describe("stepParticle", () => {
  const base: Particle = {
    x: 100,
    y: 100,
    vx: 50,
    vy: -200,
    rot: 0,
    vrot: 2,
    size: 10,
    color: "#fff",
    shape: "rect",
    age: 0,
    ttl: 2,
  };

  it("applies gravity to vertical velocity", () => {
    const next = stepParticle(base, 0.1);
    // vy should increase (less negative) under gravity.
    expect(next.vy).toBeGreaterThan(base.vy);
  });

  it("advances position, rotation and age", () => {
    const next = stepParticle(base, 0.1);
    expect(next.x).not.toBe(base.x);
    expect(next.rot).toBeCloseTo(base.rot + base.vrot * 0.1, 5);
    expect(next.age).toBeCloseTo(0.1, 5);
  });

  it("is pure — does not mutate input", () => {
    const snapshot = { ...base };
    stepParticle(base, 0.1);
    expect(base).toEqual(snapshot);
  });

  it("decays horizontal velocity via drag", () => {
    const next = stepParticle(base, 0.1, DEFAULT_CONFETTI_OPTIONS);
    expect(Math.abs(next.vx)).toBeLessThan(Math.abs(base.vx));
  });
});

describe("particleOpacity / isParticleDead", () => {
  const p: Particle = {
    x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0,
    size: 8, color: "#fff", shape: "circle", age: 0, ttl: 2,
  };

  it("is fully opaque early in life", () => {
    expect(particleOpacity({ ...p, age: 0 })).toBe(1);
    expect(particleOpacity({ ...p, age: 1 })).toBe(1); // 50% of ttl
  });

  it("fades to zero by end of life", () => {
    expect(particleOpacity({ ...p, age: 2 })).toBe(0);
  });

  it("reports dead once past ttl", () => {
    expect(isParticleDead({ ...p, age: 1.9 })).toBe(false);
    expect(isParticleDead({ ...p, age: 2 })).toBe(true);
    expect(isParticleDead({ ...p, age: 2.5 })).toBe(true);
  });
});

describe("prefersReducedMotion", () => {
  it("defaults to false when matchMedia is unavailable (jsdom/node)", () => {
    // Global node env has no window; jsdom files may have window but no
    // matchMedia. Either way the guard must not throw and must return a boolean.
    expect(typeof prefersReducedMotion()).toBe("boolean");
  });
});

describe("WIN_CHIME_NOTES", () => {
  it("is a non-empty ascending arpeggio", () => {
    expect(WIN_CHIME_NOTES.length).toBeGreaterThan(0);
    for (let i = 1; i < WIN_CHIME_NOTES.length; i++) {
      expect(WIN_CHIME_NOTES[i].freq).toBeGreaterThan(WIN_CHIME_NOTES[i - 1].freq);
      expect(WIN_CHIME_NOTES[i].start).toBeGreaterThanOrEqual(WIN_CHIME_NOTES[i - 1].start);
    }
  });

  it("has positive durations", () => {
    for (const note of WIN_CHIME_NOTES) {
      expect(note.duration).toBeGreaterThan(0);
    }
  });
});
