import { useEffect } from 'react';
import { Button } from './Button';

interface ResetConfirmModalProps {
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirms wiping saved progress. Closes on Esc, backdrop click, or cancel.
 */
export function ResetConfirmModal({ onConfirm, onClose }: ResetConfirmModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-confirm-title"
      className="fixed inset-0 z-20 flex items-center justify-center font-mono"
    >
      <button
        type="button"
        aria-label="cancel"
        onClick={onClose}
        className="absolute inset-0 bg-bg/70 cursor-default border-0 p-0"
      />
      <div className="relative bg-card-bg border border-card-border w-[min(92vw,420px)]">
        <div className="flex items-baseline justify-between border-b border-border px-[14px] py-[10px]">
          <span
            id="reset-confirm-title"
            className="text-dim text-[11px] tracking-[0.12em] uppercase"
          >
            rewrite from scratch?
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="text-dimmer hover:text-fg text-[14px] leading-none cursor-pointer bg-transparent border-0"
          >
            ×
          </button>
        </div>

        <div className="px-[14px] py-[12px] text-dimmer text-[13px] leading-[1.65]">
          resets all progress
        </div>

        <div className="flex flex-wrap gap-0 px-[14px] pb-[12px]">
          <Button variant="default" onClick={onClose}>
            cancel
          </Button>
          <Button
            variant="default"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            rewrite
          </Button>
        </div>
      </div>
    </div>
  );
}
