/** Wordmark on a white plate — the logo's dark tile outlines need a light ground on the stage. */
export function TVBrand({ className = "", height = "calc(var(--u) * 3.6)" }: { className?: string; height?: string }) {
  return (
    <div
      className={`inline-flex items-center rounded-xl bg-white shadow-raised ${className}`}
      style={{ padding: "calc(var(--u) * 0.35) calc(var(--u) * 0.7)" }}
    >
      <img src="/logo.png" alt="Crossword Clash" className="w-auto object-contain" style={{ height }} />
    </div>
  );
}
