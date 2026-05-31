import { createRoot } from 'react-dom/client';
import { Game } from './Game';
import { PhasesDebug } from './components/PhasesDebug';
import { TraceDebug } from './components/TraceDebug';
import { GraphDebug } from './components/GraphDebug';
import { PlannerDebug } from './components/PlannerDebug';
import { SaveDebug } from './components/SaveDebug';
import { DebugHome } from './components/DebugHome';
import { getDebugRouting } from './debug/routes';
import './styles/index.css';
import { initTheme } from './lib/theme';

initTheme();

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

const { inDebug, view } = getDebugRouting();

createRoot(document.getElementById('root')!).render(
  inDebug ? <DebugApp view={view} /> : <Game />,
);
