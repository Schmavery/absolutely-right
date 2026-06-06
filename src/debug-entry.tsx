/**
 * Dev-only debug UI entry. Loaded dynamically from `main.tsx` when
 * `import.meta.env.DEV` and the URL is under `/debug`.
 */

import { createRoot } from 'react-dom/client';
import { PhasesDebug } from './components/PhasesDebug';
import { TraceDebug } from './components/TraceDebug';
import { GraphDebug } from './components/GraphDebug';
import { PlannerDebug } from './components/PlannerDebug';
import { SaveDebug } from './components/SaveDebug';
import { DebugHome } from './components/DebugHome';

function DebugApp({ view }: { view: string | null }) {
  switch (view) {
    case 'phases':
      return <PhasesDebug />;
    case 'trace':
      return <TraceDebug />;
    case 'planner':
      return <PlannerDebug />;
    case 'graph':
      return <GraphDebug />;
    case 'save':
      return <SaveDebug />;
    default:
      return <DebugHome />;
  }
}

export function mountDebugApp(view: string | null, rootEl: HTMLElement): void {
  createRoot(rootEl).render(<DebugApp view={view} />);
}
