/**
 * Run planner-style heuristics as trace bots: one-step lookahead on legal moves
 * (and optional patience for soon-unlocks). Compare against planner bounds in
 * `optLoop.ts` to see if an A* estimate works as a greedy policy.
 */

import type { Move } from '../game/availability';
import type { PlanGoal } from './planReach';
import type { PlanHeuristicFn } from './planHeuristic';
import { defaultPlanHeuristic } from './planHeuristic';
import type { Bot } from '../sim/Sim';
import { TRACE_PATIENCE_MS } from '../sim/bots';
import { mcpBlocksPlay } from '../game/mcpApproval';

function mcpMoves(legal: Move[]): Move[] {
  return legal.filter(
    (m) =>
      m.actionId === 'mcp_allow' ||
      m.actionId === 'mcp_always_allow' ||
      m.actionId === 'mcp_deny',
  );
}

export interface HeuristicBotOpts {
  heuristic?: PlanHeuristicFn;
  patienceMs?: number;
}

/**
 * Greedy bot: pick the legal move whose post-apply state has the lowest
 * heuristic distance to `goal`. Returns null to wait when a higher-scoring
 * visible move unlocks within `patienceMs`.
 */
export function heuristicBot(goal: PlanGoal, opts: HeuristicBotOpts = {}): Bot {
  const h = opts.heuristic ?? defaultPlanHeuristic;
  const patienceMs = opts.patienceMs ?? TRACE_PATIENCE_MS;

  return (ctx) => {
    if (mcpBlocksPlay(ctx.state)) {
      const mcp = mcpMoves(ctx.legal);
      if (mcp.length === 0) return null;
      const score = (m: Move) => h(m.apply(ctx.state), goal);
      return [...mcp].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))[0]!;
    }

    const score = (m: Move) => h(m.apply(ctx.state), goal);
    const sortedLegal = [...ctx.legal].sort(
      (a, b) => score(a) - score(b) || a.id.localeCompare(b.id),
    );
    const bestLegal = sortedLegal[0];
    const bestScore = bestLegal ? score(bestLegal) : Infinity;

    let soon: Move | null = null;
    let soonScore = bestScore;
    for (const m of ctx.visible) {
      if (m.legal) continue;
      if (m.waitMs === null || m.waitMs <= 0 || m.waitMs > patienceMs) continue;
      const s = score(m);
      if (s < soonScore) {
        soon = m;
        soonScore = s;
      }
    }
    if (soon) return null;
    return bestLegal ?? null;
  };
}
