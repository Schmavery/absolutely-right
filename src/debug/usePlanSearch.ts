import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PlanClosestStream,
  PlanGoal,
  PlanSearchOpts,
  PlanSearchOutcome,
  PlanSearchProgress,
} from './planReach';
import type { PlanWorkerIn, PlanWorkerOut } from './planTypes';

export type PlanSearchStatus = 'idle' | 'searching' | 'ready' | 'error';

export interface PlanSearchState {
  status: PlanSearchStatus;
  outcome: PlanSearchOutcome | null;
  /** Latest frontier while searching (no step list). */
  streamingClosest: PlanClosestStream | null;
  statesVisited: number;
  maxStates: number;
  error: string | null;
}

const initial: PlanSearchState = {
  status: 'idle',
  outcome: null,
  streamingClosest: null,
  statesVisited: 0,
  maxStates: 0,
  error: null,
};

let worker: Worker | null = null;
let requestId = 0;

function acquireWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./planWorker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  requestId += 1;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => terminateWorker());
}

export function usePlanSearch(): {
  state: PlanSearchState;
  run: (goal: PlanGoal, opts: PlanSearchOpts) => void;
  cancel: () => void;
} {
  const [state, setState] = useState<PlanSearchState>(initial);
  const activeReq = useRef(0);

  const cancel = useCallback(() => {
    activeReq.current += 1;
    terminateWorker();
    setState((s) =>
      s.status === 'searching'
        ? { ...s, status: 'idle', streamingClosest: null, error: null }
        : s,
    );
  }, []);

  const run = useCallback((goal: PlanGoal, opts: PlanSearchOpts) => {
    activeReq.current += 1;
    const req = activeReq.current;
    const maxStates = opts.maxStates ?? 8000;

    setState({
      status: 'searching',
      outcome: null,
      streamingClosest: null,
      statesVisited: 0,
      maxStates,
      error: null,
    });

    const w = acquireWorker();
    const id = ++requestId;
    const msg: PlanWorkerIn = { type: 'search', requestId: id, goal, opts };

    const onMessage = (event: MessageEvent<PlanWorkerOut>) => {
      if (event.data.requestId !== id || req !== activeReq.current) return;
      const data = event.data;
      if (data.type === 'progress') {
        applyProgress(data.progress);
        return;
      }
      w.removeEventListener('message', onMessage);
      if (data.type === 'error') {
        setState({
          status: 'error',
          outcome: null,
          streamingClosest: null,
          statesVisited: 0,
          maxStates,
          error: data.message,
        });
        return;
      }
      setState({
        status: 'ready',
        outcome: data.outcome,
        streamingClosest: null,
        statesVisited: data.outcome.statesVisited,
        maxStates: data.outcome.maxStates,
        error: null,
      });
    };

    function applyProgress(p: PlanSearchProgress) {
      setState((s) => ({
        ...s,
        status: 'searching',
        statesVisited: p.statesVisited,
        maxStates: p.maxStates,
        streamingClosest: p.closest,
      }));
    }

    w.addEventListener('message', onMessage);
    w.postMessage(msg);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { state, run, cancel };
}
