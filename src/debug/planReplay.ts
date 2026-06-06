/**
 * Replay planner witness steps through the real Sim harness to compare
 * planner-internal virtual time vs actual sim physics.
 */

import type { Move } from '../game/availability';
import type { Bot } from '../sim/Sim';
import { Sim } from '../sim/Sim';
import { setRandom } from '../game/runtime';
import { defaultMaxEventDtMs } from './runBotSim';
import type { PlanGoal, PlanStep } from './planReach';
import { measureGoalProgress, plannerRngForState } from './planReach';

function stepMatchesMove(step: PlanStep, m: Move): boolean {
  if (m.id !== step.moveId) return false;
  if (step.target != null && m.target !== step.target) return false;
  return true;
}

/**
 * Bot that plays `steps` in order at each step's planned `t`.
 * Returns null to advance sim time (afford/cooldown) until `step.t`, then fires when legal.
 */
export function planReplayBot(steps: PlanStep[], searchSeed: number): Bot {
  let i = 0;
  return (ctx) => {
    if (i >= steps.length) return null;
    const step = steps[i]!;
    if (ctx.t < step.t) return null;
    const legal = ctx.legal.find((m) => stepMatchesMove(step, m));
    if (!legal) return null;
    setRandom(plannerRngForState(searchSeed, ctx.state, ctx.t));
    i += 1;
    return legal;
  };
}

export function replayPlanInSim(
  steps: PlanStep[],
  seed: number,
  goal: PlanGoal,
  budgetMs = 10 * 3_600_000,
): {
  planInternalMs: number;
  simGoalMs: number | null;
  simEndMs: number;
  launched: boolean;
} {
  const planInternalMs = steps[steps.length - 1]?.t ?? 0;
  let goalT: number | null = null;
  const sim = new Sim({
    seed,
    recordTrace: false,
    maxEventDtMs: defaultMaxEventDtMs(budgetMs),
  });
  const goalReached = (s: import('../types').GameState) =>
    measureGoalProgress(s, goal).progress >= 1;

  try {
    sim.runEventDriven(planReplayBot(steps, seed), budgetMs, {
      stopWhen: (s) => {
        if (goalReached(s) && goalT == null) goalT = sim.t;
        return goalReached(s);
      },
    });
    if (goalT == null && goalReached(sim.state)) goalT = sim.t;

    return {
      planInternalMs,
      simGoalMs: goalT,
      simEndMs: sim.t,
      launched: sim.state.launched,
    };
  } finally {
    Sim.teardown();
  }
}
