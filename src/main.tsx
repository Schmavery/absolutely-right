import { createRoot } from 'react-dom/client';
import { Game } from './Game';
import './styles/index.css';
import { initTheme } from './lib/theme';

initTheme();

async function bootstrap(): Promise<void> {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;

  if (import.meta.env.DEV) {
    const { getDebugRouting } = await import('./debug/routes');
    const { inDebug, view } = getDebugRouting();
    if (inDebug) {
      const { mountDebugApp } = await import('./debug-entry');
      mountDebugApp(view, rootEl);
      return;
    }
  }

  createRoot(rootEl).render(<Game />);
}

void bootstrap();
