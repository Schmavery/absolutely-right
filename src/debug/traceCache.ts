import type { TraceRunPayload } from './traceTypes';

const cache = new Map<string, TraceRunPayload>();

export function getTraceCache(runKey: string): TraceRunPayload | undefined {
  return cache.get(runKey);
}

export function setTraceCache(runKey: string, payload: TraceRunPayload): void {
  cache.set(runKey, payload);
}

export function clearTraceCache(): void {
  cache.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => clearTraceCache());
}
