import { debugHref, gameHref } from '../debug/routes';
import { DEBUG_VIEWS, DebugShell } from './DebugShell';

export function DebugHome() {
  return (
    <DebugShell active="home">
      <p className="debug-prose mb-6 max-w-[640px]">
        Balance and pacing tools built from the same sim harness as vitest (
        <code className="debug-code">src/sim</code>, event-driven runs). Pick a view
        below or use the header tabs.
      </p>
      <ul className="grid gap-4 sm:grid-cols-1">
        {DEBUG_VIEWS.map((v) => (
          <li key={v.id}>
            <a href={debugHref(v.id)} className="debug-card-link block rounded p-4 border">
              <div className="debug-card-title text-[15px] mb-1">{v.label}</div>
              <p className="debug-prose text-[12px] mb-2">{v.hint}</p>
            </a>
          </li>
        ))}
      </ul>
      <p className="debug-prose mt-8 text-[12px]">
        <a href={gameHref()} className="text-blue underline hover:text-log-news">
          Play the game
        </a>
      </p>
    </DebugShell>
  );
}
