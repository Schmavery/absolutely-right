import type { ReactNode } from 'react';
import { debugHref, gameHref, type DebugViewId } from '../debug/routes';
import '../styles/debug.css';
import { useTheme } from '../lib/theme';

export const DEBUG_VIEWS = [
  {
    id: 'phases',
    label: 'Phase map',
    hint: 'YAML unlock tables, flavor phase rules, and target chapters from PHASES.md.',
  },
  {
    id: 'trace',
    label: 'Bot trace',
    hint: 'Compare bots side by side (one column each) + chapter-colored upgrade heatmap.',
  },
  {
    id: 'planner',
    label: 'Planner',
    hint: 'Shortest-time buy/launch paths using waitMs (optimal milestone lower bounds).',
  },
  {
    id: 'graph',
    label: 'Upgrade graph',
    hint: 'Static requires: dependency trees and edges from upgrades.yaml.',
  },
] as const;

export type { DebugViewId };
export type DebugNavId = DebugViewId | 'home';

export function DebugShell({
  active,
  children,
}: {
  active: DebugNavId;
  children: ReactNode;
}) {
  useTheme();

  return (
    <div className="debug-tools min-h-screen font-mono text-[13px] leading-relaxed p-6 max-w-[1200px] mx-auto">
      <header className="mb-6">
        <h1 className="text-[18px] mb-1 tracking-wide text-blue">&gt; debug</h1>
        <p className="debug-prose text-[12px] mb-3">
          Dev-only.{' '}
          <a href={gameHref()} className="text-blue underline hover:text-log-news">
            Play
          </a>
        </p>
        <nav className="flex flex-wrap gap-2">
          <a
            href={debugHref()}
            className={
              active === 'home'
                ? 'debug-nav-active px-3 py-1 rounded border'
                : 'debug-nav-idle px-3 py-1 rounded border'
            }
            title="Debug index"
          >
            Home
          </a>
          {DEBUG_VIEWS.map((v) => (
            <a
              key={v.id}
              href={debugHref(v.id)}
              className={
                v.id === active
                  ? 'debug-nav-active px-3 py-1 rounded border'
                  : 'debug-nav-idle px-3 py-1 rounded border'
              }
              title={v.hint}
            >
              {v.label}
            </a>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

/** Shared section chrome for debug pages. */
export function DebugSection({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-8 ${className}`}>
      <h2 className="debug-heading">{title}</h2>
      {children}
    </section>
  );
}
