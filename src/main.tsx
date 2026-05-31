import { createRoot } from 'react-dom/client';
import { Game } from './Game';
import { PhasesDebug } from './components/PhasesDebug';
import './styles/index.css';

const showPhasesDebug =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('debug') === 'phases';

createRoot(document.getElementById('root')!).render(
  showPhasesDebug ? <PhasesDebug /> : <Game />,
);
