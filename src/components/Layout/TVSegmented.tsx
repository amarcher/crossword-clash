interface Props<T extends number | string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

/** Stage-themed radiogroup (same roles as TimeoutSelector so it stays accessible). */
export function TVSegmented<T extends number | string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div>
      <p className="tv-t-sm mb-2 font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={`tv-t-md min-h-11 flex-1 rounded-full px-5 py-2 font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                selected
                  ? "bg-brand-600 text-white shadow-[0_0_0_1px_rgb(58_107_240/0.6)]"
                  : "border border-stage-line bg-stage text-slate-300 hover:bg-stage-line active:bg-stage-line"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
