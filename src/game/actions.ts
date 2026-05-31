/**
 * Player action reducers. Each is a pure `(prev, …args) => GameState`.
 * The `Game` component wires them to `setState`. Cooldown/affordability
 * checks live here so the UI just needs to ask "could I run this right
 * now?" via the `can*` predicates exported alongside.
 *
 * Per-action tunables (cost, cooldown, event probability, formula numbers,
 * message pools) live in `data/actions.yaml` and are reached via
 * `action(id)`. Cross-cutting numbers stay in `./constants`.
 */

import type { ActionDef, GameState } from '../types';
import { action, GENS, UPGRADES } from './data';
import { AGENT_BUFF, LOC_PER_CLICK_POWER } from './constants';
import { appendLog } from './log';
import { maybeFireEvent } from './events';
import { computeFlags, effectiveThresholds, hasFlag } from './flags';
import {
  calcClickBonus,
  calcClickPower,
  calcPromptEventProbability,
  calcTokenConfig,
  genCost,
} from './rates';
import { pick, render } from '../lib/template';
import { now, random } from './runtime';

// ─── helpers ───────────────────────────────────────────────────────────────

function spendTokens(prev: GameState, n: number): GameState {
  return {
    ...prev,
    tokens: prev.tokens - n,
    totalTokensSpent: (prev.totalTokensSpent ?? 0) + n,
  };
}

function isOnCooldown(prev: GameState, key: string, ms: number): boolean {
  return now() - (prev.actionCooldowns[key] ?? 0) < ms;
}

function startCooldown(prev: GameState, key: string): GameState {
  return {
    ...prev,
    actionCooldowns: { ...prev.actionCooldowns, [key]: now() },
  };
}

/** Returns true and short-circuits if the action's `tokenCost` isn't met. */
function canAfford(prev: GameState, a: ActionDef): boolean {
  return a.tokenCost === undefined || prev.tokens >= a.tokenCost;
}

// ─── prompt ────────────────────────────────────────────────────────────────

export function promptAction(prev: GameState): GameState {
  const a = action('prompt');
  if (!canAfford(prev, a)) return prev;
  // Player can't talk over the AI mid-stream.
  if (now() < (prev.chatBusyUntil ?? 0)) return prev;
  const thresholds = effectiveThresholds(prev.upgrades);
  const power = calcClickPower(prev.upgrades);
  const locGain = power * LOC_PER_CLICK_POWER + calcClickBonus(prev.upgrades);
  const bugFromPrompt =
    prev.totalLoc >= thresholds.bugSpawnLoc && random() < thresholds.promptBugChance ? 1 : 0;
  let next: GameState = {
    ...spendTokens(prev, a.tokenCost!),
    loc: prev.loc + locGain,
    bugs: prev.bugs + bugFromPrompt,
    totalLoc: prev.totalLoc + locGain,
    totalClicks: prev.totalClicks + 1,
    started: true,
  };
  const scripted = a.earlyPromptMsgs ?? [];
  if (prev.totalClicks < scripted.length) {
    next = appendLog(next, render(scripted[prev.totalClicks]), 'info');
  } else if (a.eventProbability) {
    const past = prev.totalClicks - scripted.length;
    const prob = calcPromptEventProbability(a.eventProbability, past);
    next = maybeFireEvent(next, prob, appendLog);
  }
  return next;
}

// ─── agent ─────────────────────────────────────────────────────────────────

export function kickAgentAction(prev: GameState): GameState {
  const a = action('kick_agent');
  if (!canAfford(prev, a)) return prev;
  if (now() < (prev.agentBuffExpires ?? 0)) return prev;
  let next: GameState = {
    ...spendTokens(prev, a.tokenCost!),
    agentBuffExpires: now() + a.buffMs!,
  };
  if (a.messages) next = appendLog(next, render(pick(a.messages)), 'info');
  if (a.eventProbability) next = maybeFireEvent(next, a.eventProbability, appendLog);
  return next;
}

// ─── paste error ───────────────────────────────────────────────────────────

export function pasteErrorAction(prev: GameState): GameState {
  const a = action('paste_error');
  if (prev.bugs <= 0) return prev;
  if (!canAfford(prev, a)) return prev;
  if (isOnCooldown(prev, 'paste_error', a.cooldownMs!)) return prev;

  const fixed = random() < a.fixChance!;
  const bugDelta = fixed ? -1 : 0;
  const locDelta = a.baseLocGain! + Math.floor(random() * a.extraLocRange!);
  const pool = fixed
    ? a.goodMessages!
    : random() < 0.5
      ? a.badMessages!
      : a.neutralMessages!;
  const msg = render(pick(pool));

  let next: GameState = {
    ...spendTokens(prev, a.tokenCost!),
    loc: prev.loc + locDelta,
    totalLoc: prev.totalLoc + locDelta,
    bugs: Math.max(0, prev.bugs + bugDelta),
  };
  next = startCooldown(next, 'paste_error');

  const lines = 2 + Math.floor(random() * 15);
  const ref = 1 + Math.floor(random() * 8);
  const suffixed = msg.replace(/^(>[^\n]*)/, `$1 [Pasted text #${ref} · ${lines} lines]`);
  next = appendLog(next, suffixed, 'info');
  return next;
}

// ─── clear context ─────────────────────────────────────────────────────────

export function clearContextAction(prev: GameState): GameState {
  const a = action('clear_context');
  if (isOnCooldown(prev, 'clear_context', a.cooldownMs!)) return prev;
  const { maxTokens } = calcTokenConfig(prev.upgrades, prev.freeAccounts);
  let next: GameState = { ...prev, tokens: maxTokens };
  next = startCooldown(next, 'clear_context');
  if (a.messages) next = appendLog(next, render(pick(a.messages)), 'info');
  return next;
}

// ─── yolo merge ────────────────────────────────────────────────────────────

export function yoloMergeAction(prev: GameState): GameState {
  const a = action('yolo_merge');
  if (!canAfford(prev, a)) return prev;
  if (isOnCooldown(prev, 'yolo_merge', a.cooldownMs!)) return prev;
  const locGain =
    a.baseLoc! + Math.floor(prev.bugs * a.locPerBug! + random() * a.extraLocRange!);
  const bugGain =
    Math.floor(prev.bugs * a.bugMultiplier!) + a.baseBugs! + Math.floor(random() * a.extraBugRange!);
  let next: GameState = {
    ...spendTokens(prev, a.tokenCost!),
    loc: prev.loc + locGain,
    totalLoc: prev.totalLoc + locGain,
    bugs: prev.bugs + bugGain,
    hype: prev.hype + (a.hypeReward ?? 0),
  };
  next = startCooldown(next, 'yolo_merge');
  if (a.messages) next = appendLog(next, render(pick(a.messages)), 'system');
  if (a.eventProbability) next = maybeFireEvent(next, a.eventProbability, appendLog);
  return next;
}

// ─── run tests ─────────────────────────────────────────────────────────────

export function runTestsAction(prev: GameState): GameState {
  const a = action('run_tests');
  if ((prev.tests ?? 0) <= 0) return prev;
  if (!canAfford(prev, a)) return prev;
  const cost = runTestsCost(prev.totalLoc);
  if (prev.loc < cost) return prev;
  const fixed = Math.max(1, Math.floor(prev.bugs * runTestsFixFraction(prev.tests)));
  let next: GameState = {
    ...spendTokens(prev, a.tokenCost!),
    loc: prev.loc - cost,
    bugs: Math.max(0, prev.bugs - fixed),
  };
  const t = now();
  if (a.messages && t - prev.lastTestLogTime > (a.logCooldownMs ?? 0)) {
    next = appendLog(next, render(pick(a.messages), { n: fixed }), 'info');
    next = { ...next, lastTestLogTime: t };
  }
  if (a.eventProbability) next = maybeFireEvent(next, a.eventProbability, appendLog);
  return next;
}

export function runTestsCost(totalLoc: number): number {
  const a = action('run_tests');
  return Math.max(a.minCost!, Math.floor(totalLoc * a.costFraction!));
}

/**
 * Fraction of outstanding bugs caught by running the suite, scaled by test
 * count. Each test independently catches each bug with probability `p`, so
 * the suite catches `1 - (1 - p)^tests`. Returns 0 with no tests.
 */
export function runTestsFixFraction(tests: number): number {
  if (tests <= 0) return 0;
  const p = action('run_tests').perTestFixFraction!;
  return 1 - Math.pow(1 - p, tests);
}

// ─── bug bounty ────────────────────────────────────────────────────────────

export function bugBountyAction(prev: GameState): GameState {
  const a = action('bug_bounty');
  if (!canAfford(prev, a)) return prev;
  if (prev.bugs <= 0) return prev;
  if (isOnCooldown(prev, 'bug_bounty', a.cooldownMs!)) return prev;
  const converted = Math.min(prev.bugs, a.maxConvertedPerRun!);
  const ninesGain = converted * a.ninesPerBug!;
  const flags = computeFlags(prev.upgrades);
  const ninesBase = hasFlag(flags, 'nines_tracking')
    ? prev.nines || AGENT_BUFF.ninesFloorFallback
    : prev.nines || 0;
  let next: GameState = {
    ...spendTokens(prev, a.tokenCost!),
    bugs: Math.max(0, prev.bugs - converted),
    nines: ninesBase + ninesGain,
  };
  next = startCooldown(next, 'bug_bounty');
  if (a.runMsg) {
    next = appendLog(
      next,
      render(a.runMsg, { converted: Math.floor(converted), ninesGain: ninesGain.toFixed(3) }),
      'info',
    );
  }
  return next;
}

// ─── launch ────────────────────────────────────────────────────────────────

export function launchAction(prev: GameState): GameState {
  const a = action('launch');
  if (prev.launched) return prev;
  let next: GameState = { ...prev, launched: true, hype: prev.hype + (a.hypeReward ?? 0) };
  if (a.messages) next = appendLog(next, render(pick(a.messages)), 'system');
  return next;
}

// ─── new free account ──────────────────────────────────────────────────────

export function newFreeAccountAction(prev: GameState): GameState {
  const a = action('new_free_account');
  if (isOnCooldown(prev, 'free_account', a.cooldownMs!)) return prev;
  let next: GameState = {
    ...prev,
    freeAccounts: (prev.freeAccounts ?? 1) + 1,
  };
  next = startCooldown(next, 'free_account');
  if (a.messages) {
    next = appendLog(next, render(pick(a.messages), { n: next.freeAccounts }), 'info');
  }
  return next;
}

// ─── write test ────────────────────────────────────────────────────────────

export function writeTestCost(tests: number): number {
  const a = action('write_test');
  return Math.ceil(a.baseCost! * Math.pow(a.costMult!, tests ?? 0));
}

export function writeTestAction(prev: GameState): GameState {
  const a = action('write_test');
  const cost = writeTestCost(prev.tests ?? 0);
  if (prev.loc < cost || !canAfford(prev, a)) return prev;
  let next: GameState = {
    ...spendTokens(prev, a.tokenCost!),
    loc: prev.loc - cost,
    tests: (prev.tests ?? 0) + 1,
  };
  const milestone = a.milestones?.find((m) => m.count === next.tests);
  if (milestone) {
    next = appendLog(next, render(milestone.text, { n: next.tests }), 'info');
  }
  return next;
}

// ─── buy generator ─────────────────────────────────────────────────────────

export function buyGenAction(prev: GameState, genId: string): GameState {
  const a = action('buy_gen');
  const g = GENS.find((g) => g.id === genId);
  if (!g) return prev;
  const owned = prev.genCounts[genId] ?? 0;
  const cost = genCost(g, owned);
  if (prev.loc < cost) return prev;
  let next: GameState = {
    ...prev,
    loc: prev.loc - cost,
    genCounts: { ...prev.genCounts, [genId]: owned + 1 },
  };
  if (owned === 0 && a.firstPurchaseMsg) {
    next = appendLog(next, render(a.firstPurchaseMsg, { name: g.name, desc: g.desc }), 'info');
  }
  if (a.eventProbability) next = maybeFireEvent(next, a.eventProbability, appendLog);
  return next;
}

// ─── buy upgrade ───────────────────────────────────────────────────────────

export function buyUpgradeAction(prev: GameState, upgId: string): GameState {
  const a = action('buy_upgrade');
  const u = UPGRADES.find((u) => u.id === upgId);
  if (!u) return prev;
  if (prev.loc < u.cost || prev.upgrades.includes(upgId)) return prev;
  let next: GameState = { ...prev, loc: prev.loc - u.cost, upgrades: [...prev.upgrades, upgId] };
  if (u.ninesFloor !== undefined) {
    next = { ...next, nines: Math.max(next.nines || 0, u.ninesFloor) };
  }
  const flavor = u.purchaseMsg ?? `${u.name} unlocked. ${u.desc}.`;
  next = appendLog(next, render(flavor, { name: u.name, desc: u.desc }), 'info');
  if (a.eventProbability) next = maybeFireEvent(next, a.eventProbability, appendLog);
  return next;
}
