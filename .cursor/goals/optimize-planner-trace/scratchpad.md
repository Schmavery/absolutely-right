# Goal: Optimize planner heuristic and trace bots via cross-informed opt loop

- **Status**: active
- **Started At**: 2026-06-06T00:00:00Z
- **Budget**: unlimited seconds
- **Conversation**: (set on first watcher arm)
- **Watcher PID**: (set on first watcher arm)

## Objective

Optimize the planner A* heuristic and trace bots together using the opt loop harness. Use planner bounds to characterize optimal paths; run hypothetical heuristics as trace bots; tune generically in planHeuristic.ts, moveIntent.ts, bots.ts.

## Plan

- [x] Extract configurable `planHeuristic` + `heuristicBot`
- [x] Add `optLoop.ts` harness + `npm run opt:loop` / `opt:loop:smoke`
- [x] Add `.cursor/rules/planner-trace-opt.mdc` agent guidance
- [x] Run smoke suite (passes — launch vs progress bot on seed 42)
- [x] Planner uses real reducers + sim-faithful stepMove (replay launches)
- [ ] First tuning iteration from report hints
- [ ] Full `opt:loop` on launch + multi_agent

## Progress Log

- 2026-06-06 — Scaffolded opt loop: planHeuristic.ts, heuristicBot.ts, optLoop.ts, tests, cursor rule, goal directory.
- 2026-06-06 — Smoke tests green (`npm run opt:loop:smoke`, planReach tests).
- 2026-06-06 — Planner fixed: real `move.apply`, full `waitMs` gates, no double cooldown charge; replay ~9.1m vs search ~10.2m on launch seed 42.

## Open Questions / Blockers

- (none)
