/** Path-based dev debug routes (see `main.tsx`). Respects Vite `base` for GitHub Pages. */

const DEBUG_VIEW_IDS = new Set(['phases', 'trace', 'planner', 'graph', 'save']);

export type DebugViewId = 'phases' | 'trace' | 'planner' | 'graph' | 'save';

function normalizeBase(): string {
  const base = import.meta.env.BASE_URL;
  if (!base || base === '/') return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/** App-root path with deploy base prefix (e.g. `/repo/debug/trace`). */
export function appPath(subpath = ''): string {
  const base = normalizeBase();
  const suffix = subpath.replace(/^\//, '');
  if (!suffix) return `${base}/` || '/';
  return `${base}/${suffix}`;
}

export function gameHref(): string {
  return appPath();
}

export function debugHref(view?: DebugViewId | null): string {
  if (!view) return appPath('debug');
  return appPath(`debug/${view}`);
}

function pathnameWithoutBase(): string {
  const base = normalizeBase();
  const { pathname } = window.location;
  if (!base) return pathname;
  if (pathname === base || pathname.startsWith(`${base}/`)) {
    const rest = pathname.slice(base.length);
    return rest || '/';
  }
  return pathname;
}

export function getDebugRouting(): { inDebug: boolean; view: string | null } {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return { inDebug: false, view: null };
  }
  const rest = pathnameWithoutBase();
  const match = rest.match(/^\/debug\/?(.*)$/);
  if (!match) return { inDebug: false, view: null };
  const segment = match[1] ?? '';
  if (!segment) return { inDebug: true, view: null };
  if (DEBUG_VIEW_IDS.has(segment)) return { inDebug: true, view: segment };
  return { inDebug: true, view: null };
}
