import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'launch' | 'yolo' | 'bounty' | 'subtle';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  /** Disabled-style without `pointer-events: none` so tooltips still work. */
  off?: boolean;
  /** Extra className appended after the variant classes. */
  className?: string;
  children?: ReactNode;
  /**
   * 0..1 fill of an inline progress bar. Used for both time-based cooldowns
   * and resource accumulation. A full bar (1.0) signals "ready to click" by
   * giving the button a solid background tint.
   */
  progress?: number;
  /**
   * Tailwind class for the progress fill. Defaults to a neutral
   * monochromatic tint (`bg-dim/20`) used for resource accumulation.
   *
   * For time-based cooldowns, pass a chromatic tint matching the variant
   * (e.g. `bg-green/10`, `bg-blue/10`, `bg-purple/10`) so the two styles
   * are visually distinguishable: chromatic ⇒ "system is busy",
   * monochromatic ⇒ "you're saving up".
   */
  progressClassName?: string;
}

const DEFAULT_PROGRESS_BG = 'bg-dim/20';

const BASE =
  'inline-flex items-center justify-center bg-transparent font-mono text-[13px] ' +
  'leading-[1.65] mr-2 mb-[5px] select-none px-[11px] py-[3px] border ' +
  'transition-colors';

const ENABLED = 'border-btn-border text-btn-text hover:text-fg hover:border-dim';

const OFF = 'border-border text-dimmer';

const VARIANTS: Record<Variant, { on: string; off: string }> = {
  default: {
    on: ENABLED,
    off: OFF,
  },
  primary: {
    on: 'border-dim text-title px-[22px] py-[6px] text-[14px] mb-4 hover:text-fg',
    off: OFF + ' px-[22px] py-[6px] text-[14px] mb-4',
  },
  launch: {
    on: 'border-yellow text-yellow px-[18px] py-[5px] hover:text-fg',
    off: OFF + ' px-[18px] py-[5px]',
  },
  yolo: {
    on: 'border-purple text-purple hover:text-fg',
    off: OFF,
  },
  bounty: {
    on: 'border-blue text-blue hover:text-fg',
    off: OFF,
  },
  subtle: {
    on: 'border-border text-dimmer text-[11px] hover:text-fg',
    off: OFF + ' text-[11px]',
  },
};

/**
 * Tiny terminal-styled button. The "off" state is deliberately not the
 * `disabled` HTML attribute — it just changes appearance and drops the
 * onClick handler — so tooltips still appear on hover.
 *
 * Optionally renders an inline progress bar (`progress`, 0..1) to show
 * cooldown remaining or resource accumulation. When the bar is full the
 * button gains a "solid bg" look — the visual cue that it's clickable.
 */
export function Button({
  variant = 'default',
  off = false,
  className,
  children,
  progress,
  progressClassName = DEFAULT_PROGRESS_BG,
  ...rest
}: Props) {
  const v = VARIANTS[variant];
  const onClick = off ? undefined : rest.onClick;
  const hasProgress = progress !== undefined;
  const pct = hasProgress ? Math.max(0, Math.min(1, progress)) * 100 : 0;
  return (
    <button
      {...rest}
      onClick={onClick}
      className={[
        BASE,
        off ? v.off : v.on,
        hasProgress ? 'relative overflow-hidden' : '',
        className ?? '',
      ].join(' ')}
    >
      {hasProgress && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 pointer-events-none ${progressClassName}`}
          style={{ width: `${pct}%` }}
        />
      )}
      {hasProgress ? <span className="relative">{children}</span> : children}
    </button>
  );
}
