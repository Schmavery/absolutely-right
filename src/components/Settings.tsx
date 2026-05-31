import { useEffect, useState } from 'react';
import { debugHref } from '../debug/routes';
import {
  SYSTEM_THEME_ID,
  THEMES,
  type AppearanceMode,
  useTheme,
} from '../lib/theme';

/**
 * Top-right toolbar. Two icon buttons:
 *
 *   auto / ☀ / ☾  — cycle system → light → dark → system
 *   ⚙             — open the settings modal (theme picker for now; intended to grow)
 *
 * The modal closes on Esc, on backdrop click, and on its own close button.
 */
export function Settings() {
  const { theme, appearance, setTheme, cycleAppearance } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const appearanceLabel =
    appearance === 'system'
      ? 'appearance: system (follow browser) — click for light'
      : appearance === 'light'
        ? 'appearance: light — click for dark'
        : 'appearance: dark — click for system';

  return (
    <>
      <div className="absolute top-[14px] right-[14px] sm:right-6 z-10 flex items-center gap-[6px] font-mono">
        <ToolbarButton onClick={cycleAppearance} label={appearanceLabel}>
          {appearance === 'system' ? (
            <AutoIcon />
          ) : appearance === 'light' ? (
            <SunIcon />
          ) : (
            <MoonIcon />
          )}
        </ToolbarButton>
        <ToolbarButton onClick={() => setOpen(true)} label="settings">
          <GearIcon />
        </ToolbarButton>
      </div>

      {open && (
        <SettingsModal
          theme={theme}
          appearance={appearance}
          onPickTheme={(id) => setTheme(id)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="border border-border text-dimmer hover:text-fg w-[26px] h-[26px] inline-flex items-center justify-center overflow-visible bg-transparent"
    >
      {children}
    </button>
  );
}

interface SettingsModalProps {
  theme: string;
  appearance: AppearanceMode;
  onPickTheme: (id: string) => void;
  onClose: () => void;
}

function SettingsModal({ theme, appearance, onPickTheme, onClose }: SettingsModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="settings"
      className="fixed inset-0 z-20 flex items-center justify-center font-mono"
    >
      <button
        type="button"
        aria-label="close settings"
        onClick={onClose}
        className="absolute inset-0 bg-bg/70 border-0 p-0"
      />
      <div className="relative bg-card-bg border border-card-border w-[min(92vw,420px)] max-h-[80vh] overflow-y-auto">
        <div className="flex items-baseline justify-between border-b border-border px-[14px] py-[10px]">
          <span className="text-dim text-[11px] tracking-[0.12em] uppercase">settings</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="text-dimmer hover:text-fg text-[14px] leading-none bg-transparent border-0"
          >
            ×
          </button>
        </div>

        <div className="px-[14px] py-[12px]">
          <div className="text-dimmer text-[10px] tracking-[0.12em] uppercase mb-[8px]">
            theme
          </div>
          <div className="flex flex-col">
            <ThemeRow
              active={appearance === 'system'}
              onClick={() => onPickTheme(SYSTEM_THEME_ID)}
              label="system · auto"
              hint="follow browser light/dark"
            />
            {THEMES.map((t) => {
              const active = appearance !== 'system' && t.id === theme;
              return (
                <ThemeRow
                  key={t.id}
                  active={active}
                  onClick={() => onPickTheme(t.id)}
                  label={t.label}
                />
              );
            })}
          </div>
        </div>

        {import.meta.env.DEV && (
          <div className="px-[14px] py-[12px] border-t border-border">
            <a
              href={debugHref()}
              className="text-dimmer hover:text-fg text-[12px] underline underline-offset-2"
            >
              debug
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeRow({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'text-left px-[10px] py-[6px] bg-transparent border-0 font-mono text-[12px] flex items-baseline gap-[10px]',
        active ? 'text-fg' : 'text-dimmer hover:text-fg',
      ].join(' ')}
    >
      <span className="w-[10px] inline-block shrink-0">{active ? '›' : ''}</span>
      <span>
        {label}
        {hint && <span className="text-dimmer ml-[6px] text-[10px]">({hint})</span>}
      </span>
    </button>
  );
}

/** Sun top-right + moon bottom-left (same glyphs as solo icons, scaled). */
function AutoIcon() {
  const scale = 0.76;
  const stroke = 1.7 / scale;
  const glyphCx = 12;
  const glyphCy = 12;
  /** Scale about glyph center, then place — same transform for both icons. */
  const place = (x: number, y: number) =>
    `translate(${x} ${y}) scale(${scale}) translate(${-glyphCx} ${-glyphCy})`;

  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      overflow="visible"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform={place(17.6, 7.8)} strokeWidth={stroke}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </g>
      <g transform={place(6.5, 17.4)} strokeWidth={stroke}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </g>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
