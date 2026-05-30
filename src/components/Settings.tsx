import { useEffect, useState } from 'react';
import { THEMES, useTheme } from '../lib/theme';

/**
 * Top-right toolbar. Two icon buttons:
 *
 *   ☀ / ☾  — toggle between the current theme and its dark/light counterpart
 *   ⚙       — open the settings modal (theme picker for now; intended to grow)
 *
 * The modal closes on Esc, on backdrop click, and on its own close button.
 */
export function Settings() {
  const { theme, kind, setTheme, toggleDarkLight } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <div className="absolute top-[14px] right-[14px] sm:right-6 z-10 flex items-center gap-[6px] font-mono">
        <ToolbarButton
          onClick={toggleDarkLight}
          label={kind === 'dark' ? 'switch to light theme' : 'switch to dark theme'}
        >
          {kind === 'dark' ? <SunIcon /> : <MoonIcon />}
        </ToolbarButton>
        <ToolbarButton onClick={() => setOpen(true)} label="settings">
          <GearIcon />
        </ToolbarButton>
      </div>

      {open && (
        <SettingsModal
          theme={theme}
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
      className="border border-border text-dimmer hover:text-fg w-[26px] h-[26px] inline-flex items-center justify-center cursor-pointer bg-transparent"
    >
      {children}
    </button>
  );
}

interface SettingsModalProps {
  theme: string;
  onPickTheme: (id: string) => void;
  onClose: () => void;
}

function SettingsModal({ theme, onPickTheme, onClose }: SettingsModalProps) {
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
        className="absolute inset-0 bg-bg/70 cursor-default border-0 p-0"
      />
      <div className="relative bg-card-bg border border-card-border w-[min(92vw,420px)] max-h-[80vh] overflow-y-auto">
        <div className="flex items-baseline justify-between border-b border-border px-[14px] py-[10px]">
          <span className="text-dim text-[11px] tracking-[0.12em] uppercase">settings</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="text-dimmer hover:text-fg text-[14px] leading-none cursor-pointer bg-transparent border-0"
          >
            ×
          </button>
        </div>

        <div className="px-[14px] py-[12px]">
          <div className="text-dimmer text-[10px] tracking-[0.12em] uppercase mb-[8px]">
            theme
          </div>
          <div className="flex flex-col">
            {THEMES.map((t) => {
              const active = t.id === theme;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onPickTheme(t.id)}
                  aria-pressed={active}
                  className={[
                    'text-left px-[10px] py-[6px] cursor-pointer bg-transparent border-0 font-mono text-[12px] flex items-baseline gap-[10px]',
                    active ? 'text-fg' : 'text-dimmer hover:text-fg',
                  ].join(' ')}
                >
                  <span className="w-[10px] inline-block">{active ? '›' : ''}</span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
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
