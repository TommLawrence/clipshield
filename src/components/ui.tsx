'use client';

/** Small design-system primitives shared across the ClipShield workspace. */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`clip-card p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'emerald' | 'indigo' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-400/60',
  emerald:
    'bg-emerald-500 text-obsidian-950 border-emerald-400 hover:bg-emerald-400 font-semibold',
  indigo:
    'bg-indigo-500/15 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/25 hover:border-indigo-400/60',
  ghost:
    'bg-transparent text-slate-300 border-edge hover:bg-slate-raised hover:text-slate-100',
  danger:
    'bg-rose-500/10 text-rose-300 border-rose-500/40 hover:bg-rose-500/20',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}) {
  const sizeCls =
    size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  return (
    <button
      {...props}
      className={`clip-focus inline-flex items-center justify-center gap-1.5 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sizeCls} ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

export function Badge({
  tone = 'slate',
  children,
  title,
}: {
  tone?: 'slate' | 'emerald' | 'indigo' | 'amber' | 'rose' | 'cyan';
  children: React.ReactNode;
  title?: string;
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`clip-focus flex cursor-pointer items-start gap-3 rounded-lg border border-edge bg-obsidian-850/60 p-3 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-slate-500/50'
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`clip-focus relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked
            ? 'border-emerald-400/60 bg-emerald-500/70'
            : 'border-edge bg-slate-raised'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-obsidian-950 transition-all ${
            checked ? 'left-[18px] bg-obsidian-950' : 'left-0.5'
          }`}
        />
      </button>
      <span>
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/** Deterministic meter for the exposure score. */
export function ScoreDial({ score, severity }: { score: number; severity: string }) {
  const color =
    severity === 'CRITICAL'
      ? '#fb7185'
      : severity === 'HIGH'
        ? '#fb923c'
        : severity === 'MEDIUM'
          ? '#fcd34d'
          : '#34d399';
  const angle = Math.min(100, Math.max(0, score)) * 3.6;
  return (
    <div className="flex items-center gap-4">
      <div
        className="relative grid h-20 w-20 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${angle}deg, rgba(44,51,69,0.5) ${angle}deg)`,
        }}
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Exposure score ${score} of 100`}
      >
        <div className="grid h-[62px] w-[62px] place-items-center rounded-full bg-obsidian-900">
          <span className="font-mono text-xl font-semibold" style={{ color }}>
            {score.toFixed(0)}
          </span>
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Exposure score</p>
        <p className="text-lg font-semibold" style={{ color }}>
          {severity}
        </p>
        <p className="text-[11px] text-slate-500">deterministic · explainable</p>
      </div>
    </div>
  );
}
