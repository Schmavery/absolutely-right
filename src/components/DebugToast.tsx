import { useEffect, useState } from 'react';
import { setDebugToastListener } from '../lib/debugToast';

/** Dev-only lifecycle toasts for save / blur / focus / reload. */
export function DebugToast() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDebugToastListener((text) => setMessage(text));
    return () => setDebugToastListener(null);
  }, []);

  if (!import.meta.env.DEV || !message) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none font-mono text-[11px] text-fg bg-bg border border-border px-3 py-2 shadow-sm max-w-[min(92vw,520px)] text-center"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
