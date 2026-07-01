import { useEffect, useRef } from "react";
import {
  createParticles,
  stepParticle,
  particleOpacity,
  isParticleDead,
  type Particle,
} from "../../lib/celebration";

const PARTICLE_COUNT = 90;

/**
 * A lightweight, dependency-free confetti burst rendered on a single inline
 * <canvas>. Mounting the component fires exactly one burst; the parent is
 * responsible for mounting it only on a genuine completion and for respecting
 * `prefers-reduced-motion` (this component does no work once mounted beyond a
 * brief, self-terminating animation).
 */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // jsdom / unsupported environments: keep the element, skip the animation.
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let particles: Particle[] = createParticles(PARTICLE_COUNT, width, height);

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx.clearRect(0, 0, width, height);
      particles = particles
        .map((p) => stepParticle(p, dt))
        .filter((p) => !isParticleDead(p));

      for (const p of particles) {
        const alpha = particleOpacity(p);
        if (alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }

      if (particles.length > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="confetti-canvas"
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      aria-hidden
    />
  );
}
