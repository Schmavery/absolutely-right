const TOAST_MS = 3000;

type ToastListener = (message: string) => void;

let listener: ToastListener | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function setDebugToastListener(fn: ToastListener | null): void {
  listener = fn;
}

export function debugToast(message: string): void {
  if (!import.meta.env.DEV) return;
  listener?.(message);
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => listener?.(''), TOAST_MS);
}
