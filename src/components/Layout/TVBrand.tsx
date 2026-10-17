/** Wordmark on a white plate — the logo's dark tile outlines need a light ground on the stage. */
export function TVBrand({ className = "", height = "calc(var(--u) * 2.76)" }: { className?: string; height?: string }) {
  return (
    <div
      className={`inline-flex items-center rounded-xl bg-white shadow-raised ${className}`}
      style={{ padding: "calc(var(--u) * 0.35) calc(var(--u) * 0.7)" }}
    >
      <img src="/logo.png" alt="Crossword Clash" width={2292} height={500} className="w-auto" style={{ height }} />
    </div>
  );
}
