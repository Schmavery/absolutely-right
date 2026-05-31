/// <reference lib="webworker" />
import { planShortestPath } from './planReach';
import type { PlanWorkerIn, PlanWorkerOut } from './planTypes';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<PlanWorkerIn>) => {
  const msg = event.data;
  if (msg.type !== 'search') return;
  try {
    const outcome = planShortestPath(msg.goal, {
      ...msg.opts,
      onProgress: (p) => {
        ctx.postMessage({
          type: 'progress',
          requestId: msg.requestId,
          progress: p,
        } satisfies PlanWorkerOut);
      },
    });
    ctx.postMessage({
      type: 'done',
      requestId: msg.requestId,
      outcome,
    } satisfies PlanWorkerOut);
  } catch (e) {
    ctx.postMessage({
      type: 'error',
      requestId: msg.requestId,
      message: e instanceof Error ? e.message : String(e),
    } satisfies PlanWorkerOut);
  }
};

export {};
