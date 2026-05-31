import type {
  PlanGoal,
  PlanSearchOpts,
  PlanSearchOutcome,
  PlanSearchProgress,
} from './planReach';

export type { PlanSearchProgress, PlanSearchOutcome } from './planReach';

export type PlanWorkerIn = {
  type: 'search';
  requestId: number;
  goal: PlanGoal;
  opts: PlanSearchOpts;
};

export type PlanWorkerOut =
  | { type: 'progress'; requestId: number; progress: PlanSearchProgress }
  | { type: 'done'; requestId: number; outcome: PlanSearchOutcome }
  | { type: 'error'; requestId: number; message: string };
