import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'launch' | 'yolo' | 'bounty' | 'subtle';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  /** Disabled-style without `pointer-events: none` so tooltips still work. */
  off?: boolean;
  /** Extra className appended after the variant classes. */
  className?: string;
  children?: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center bg-transparent font-mono text-[13px] ' +
  'leading-[1.65] mr-2 mb-[5px] select-none px-[11px] py-[3px] border ' +
  'transition-colors';

const ENABLED =
  'border-btn-border text-btn-text cursor-pointer hover:text-fg hover:border-dim';

const OFF = 'border-border text-dimmer cursor-not-allowed';

const VARIANTS: Record<Variant, { on: string; off: string }> = {
  default: {
    on: ENABLED,
    off: OFF,
  },
  primary: {
    on: 'border-dim text-title cursor-pointer px-[22px] py-[6px] text-[14px] mb-4 hover:text-fg',
    off: OFF + ' px-[22px] py-[6px] text-[14px] mb-4',
  },
  launch: {
    on: 'border-yellow text-yellow cursor-pointer px-[18px] py-[5px] hover:text-fg',
    off: OFF + ' px-[18px] py-[5px]',
  },
  yolo: {
    on: 'border-purple text-purple cursor-pointer hover:text-fg',
    off: OFF,
  },
  bounty: {
    on: 'border-blue text-blue cursor-pointer hover:text-fg',
    off: OFF,
  },
  subtle: {
    on: 'border-border text-dimmer cursor-pointer text-[11px] hover:text-fg',
    off: OFF + ' text-[11px]',
  },
};

/**
 * Tiny terminal-styled button. The "off" state is deliberately not the
 * `disabled` HTML attribute — it just changes appearance and drops the
 * onClick handler — so tooltips still appear on hover.
 */
export function Button({ variant = 'default', off = false, className, children, ...rest }: Props) {
  const v = VARIANTS[variant];
  const onClick = off ? undefined : rest.onClick;
  return (
    <button
      {...rest}
      onClick={onClick}
      className={[BASE, off ? v.off : v.on, className ?? ''].join(' ')}
    >
      {children}
    </button>
  );
}
