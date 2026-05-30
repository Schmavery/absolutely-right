/**
 * Player action reducers. Each is a pure `(prev, …args) => GameState`.
 * The `Game` component wires them to `setState`. Cooldown/affordability
 * checks live here so the UI just needs to ask "could I run this right
 * now?" via the `can*` predicates exported alongside.
 */

import type { GameState } from '../types';
import { GENS, MESSAGES, UPGRADES } from './data';
import {
  AGENT_BUFF_MS,
  BUG_BOUNTY,
  COOLDOWNS,
  EVENT_PROBABILITIES,
  HYPE,
  LOC_PER_CLICK_POWER,
  PASTE_ERROR,
  RUN_TESTS,
  THRESHOLDS,
  TOKEN_COSTS,
  WRITE_TEST,
  YOLO_MERGE,
} from './constants';
import { appendLog } from './log';
import { maybeFireEvent } from './events';
import { calcClickBonus, calcClickPower, calcTokenConfig, genCost } from './rates';
import { pick, render } from '../lib/template';

// ─── helpers ───────────────────────────────────────────────────────────────

function spendTokens(prev: GameState, n: number): GameState {
  return {
    ...prev,
    tokens: prev.tokens - n,
    totalTokensSpent: (prev.totalTokensSpent ?? 0) + n,
  };
}

function isOnCooldown(prev: GameState, key: string, ms: number): boolean {
  return Date.now() - (prev.actionCooldowns[key] ?? 0) < ms;
}

function startCooldown(prev: GameState, key: string): GameState {
  return {
    ...prev,
    actionCooldowns: { ...prev.actionCooldowns, [key]: Date.now() },
  };
}

// ─── prompt ────────────────────────────────────────────────────────────────

export function promptAction(prev: GameState): GameState {
  if (prev.tokens < TOKEN_COSTS.prompt) return prev;
  const power = calcClickPower(prev.upgrades);
  const locGain = power * LOC_PER_CLICK_POWER + calcClickBonus(prev.upgrades);
  const bugFromPrompt =
    prev.totalLoc >= THRESHOLDS.bugSpawnLoc && Math.random() < THRESHOLDS.promptBugChance ? 1 : 0;
  let next: GameState = {
    ...spendTokens(prev, TOKEN_COSTS.prompt),
    loc: prev.loc + locGain,
    bugs: prev.bugs + bugFromPrompt,
    totalLoc: prev.totalLoc + locGain,
    totalClicks: prev.totalClicks + 1,
    started: true,
  };
  if (!prev.started) {
    next = appendLog(
      next,
      "> build me a startup\nCertainly! I'd be happy to help with that. Here's a robust, scalable solution—",
      'info',
    );
  }
  next = maybeFireEvent(next, EVENT_PROBABILITIES.prompt, appendLog);
  return next;
}

// ─── agent ─────────────────────────────────────────────────────────────────

export function kickAgentAction(prev: GameState): GameState {
  if (prev.tokens < TOKEN_COSTS.agent) return prev;
  if (Date.now() < (prev.agentBuffExpires ?? 0)) return prev;
  let next: GameState = {
    ...spendTokens(prev, TOKEN_COSTS.agent),
    agentBuffExpires: Date.now() + AGENT_BUFF_MS,
  };
  next = appendLog(next, pick(MESSAGES.agentMsgs), 'info');
  next = maybeFireEvent(next, EVENT_PROBABILITIES.kickAgent, appendLog);
  return next;
}

// ─── paste error ───────────────────────────────────────────────────────────

export function pasteErrorAction(prev: GameState): GameState {
  if (prev.bugs <= 0) return prev;
  if (prev.tokens < TOKEN_COSTS.pasteError) return prev;
  if (isOnCooldown(prev, 'paste_error', COOLDOWNS.pasteError)) return prev;

  const fixed = Math.random() < PASTE_ERROR.fixChance;
  const bugDelta = fixed ? -1 : 0;
  const locDelta =
    PASTE_ERROR.baseLocGain + Math.floor(Math.random() * PASTE_ERROR.extraLocRange);
  const msg = fixed ? pick(MESSAGES.pasteErrorGood) : pick(MESSAGES.pasteErrorNeutral);

  let next: GameState = {
    ...spendTokens(prev, TOKEN_COSTS.pasteError),
    loc: prev.loc + locDelta,
    totalLoc: prev.totalLoc + locDelta,
    bugs: Math.max(0, prev.bugs + bugDelta),
  };
  next = startCooldown(next, 'paste_error');

  const lines = 2 + Math.floor(Math.random() * 15);
  const ref = 1 + Math.floor(Math.random() * 8);
  const suffixed = msg.replace(/^(>[^\n]*)/, `$1 [Pasted text #${ref} · ${lines} lines]`);
  next = appendLog(next, suffixed, 'info');
  return next;
}

// ─── clear context ─────────────────────────────────────────────────────────

export function clearContextAction(prev: GameState): GameState {
  if (isOnCooldown(prev, 'clear_context', COOLDOWNS.clearContext)) return prev;
  const { maxTokens } = calcTokenConfig(prev.upgrades, prev.freeAccounts);
  let next: GameState = { ...prev, tokens: maxTokens };
  next = startCooldown(next, 'clear_context');
  next = appendLog(next, pick(MESSAGES.clearContextMsgs), 'info');
  return next;
}

// ─── yolo merge ────────────────────────────────────────────────────────────

export function yoloMergeAction(prev: GameState): GameState {
  if (prev.tokens < TOKEN_COSTS.yoloMerge) return prev;
  if (isOnCooldown(prev, 'yolo_merge', COOLDOWNS.yoloMerge)) return prev;
  const locGain =
    YOLO_MERGE.baseLoc +
    Math.floor(prev.bugs * YOLO_MERGE.locPerBug + Math.random() * YOLO_MERGE.extraLocRange);
  const bugGain =
    Math.floor(prev.bugs * YOLO_MERGE.bugMultiplier) +
    YOLO_MERGE.baseBugs +
    Math.floor(Math.random() * YOLO_MERGE.extraBugRange);
  let next: GameState = {
    ...spendTokens(prev, TOKEN_COSTS.yoloMerge),
    loc: prev.loc + locGain,
    totalLoc: prev.totalLoc + locGain,
    bugs: prev.bugs + bugGain,
    hype: prev.hype + HYPE.yoloMerge,
  };
  next = startCooldown(next, 'yolo_merge');
  next = appendLog(next, pick(MESSAGES.yoloMergeMsgs), 'system');
  next = maybeFireEvent(next, EVENT_PROBABILITIES.yoloMerge, appendLog);
  return next;
}

// ─── run tests ─────────────────────────────────────────────────────────────

export function runTestsAction(prev: GameState): GameState {
  if (prev.tokens < TOKEN_COSTS.tests) return prev;
  const cost = runTestsCost(prev.totalLoc);
  if (prev.loc < cost) return prev;
  const fixed = Math.max(1, Math.floor(prev.bugs * RUN_TESTS.bugFixFraction));
  let next: GameState = {
    ...spendTokens(prev, TOKEN_COSTS.tests),
    loc: prev.loc - cost,
    bugs: Math.max(0, prev.bugs - fixed),
  };
  const now = Date.now();
  if (now - prev.lastTestLogTime > COOLDOWNS.testLog) {
    next = appendLog(next, render(pick(MESSAGES.testMessages), { n: fixed }), 'info');
    next = { ...next, lastTestLogTime: now };
  }
  next = maybeFireEvent(next, EVENT_PROBABILITIES.runTests, appendLog);
  return next;
}

export function runTestsCost(totalLoc: number): number {
  return Math.max(RUN_TESTS.minCost, Math.floor(totalLoc * RUN_TESTS.costFraction));
}

// ─── bug bounty ────────────────────────────────────────────────────────────

export function bugBountyAction(prev: GameState): GameState {
  if (prev.tokens < TOKEN_COSTS.bugBounty) return prev;
  if (prev.bugs <= 0) return prev;
  if (isOnCooldown(prev, 'bug_bounty', COOLDOWNS.bugBounty)) return prev;
  const converted = Math.min(prev.bugs, BUG_BOUNTY.maxConvertedPerRun);
  const ninesGain = converted * BUG_BOUNTY.ninesPerBug;
  let next: GameState = {
    ...spendTokens(prev, TOKEN_COSTS.bugBounty),
    bugs: Math.max(0, prev.bugs - converted),
    nines: (prev.nines || THRESHOLDS.revampMinNines) + ninesGain,
  };
  next = startCooldown(next, 'bug_bounty');
  next = appendLog(
    next,
    `Bug bounty run. Converted ${Math.floor(converted)} reports into reliability data. Nines: +${ninesGain.toFixed(3)}.`,
    'info',
  );
  return next;
}

// ─── launch ────────────────────────────────────────────────────────────────

export function launchAction(prev: GameState): GameState {
  if (prev.launched) return prev;
  let next: GameState = { ...prev, launched: true, hype: prev.hype + HYPE.launch };
  next = appendLog(
    next,
    "I've deployed to production! This is exciting. What could go wrong?",
    'system',
  );
  return next;
}

// ─── new free account ──────────────────────────────────────────────────────

export function newFreeAccountAction(prev: GameState): GameState {
  if (isOnCooldown(prev, 'free_account', COOLDOWNS.freeAccount)) return prev;
  let next: GameState = {
    ...prev,
    freeAccounts: (prev.freeAccounts ?? 1) + 1,
  };
  next = startCooldown(next, 'free_account');
  next = appendLog(next, render(pick(MESSAGES.newAccountMsgs), { n: next.freeAccounts }), 'info');
  return next;
}

// ─── write test ────────────────────────────────────────────────────────────

export function writeTestCost(tests: number): number {
  return Math.ceil(WRITE_TEST.baseCost * Math.pow(WRITE_TEST.costMult, tests ?? 0));
}

export function writeTestAction(prev: GameState): GameState {
  const cost = writeTestCost(prev.tests ?? 0);
  if (prev.loc < cost || prev.tokens < TOKEN_COSTS.writeTest) return prev;
  let next: GameState = {
    ...spendTokens(prev, TOKEN_COSTS.writeTest),
    loc: prev.loc - cost,
    tests: (prev.tests ?? 0) + 1,
  };
  const t = next.tests;
  if (t === 1) {
    next = appendLog(
      next,
      "Test suite initialized. I've written the first test. It asserts that the code exists. Coverage: technically 100%.",
      'info',
    );
  } else if (t === 10) {
    next = appendLog(
      next,
      '10 tests! The test for the payment flow is aspirational. The rest are solid.',
      'info',
    );
  } else if (t === 50) {
    next = appendLog(
      next,
      "50 tests! I've helpfully included a test that tests the test runner. Very thorough.",
      'info',
    );
  } else if (t === 100) {
    next = appendLog(
      next,
      "100 tests. The suite takes 4 minutes to run. I've added a skip flag to the slow ones.",
      'info',
    );
  }
  return next;
}

// ─── buy generator ─────────────────────────────────────────────────────────

export function buyGenAction(prev: GameState, genId: string): GameState {
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
  if (owned === 0) {
    next = appendLog(
      next,
      `Certainly! I've integrated ${g.name} into our workflow. "${g.desc}"`,
      'info',
    );
  }
  next = maybeFireEvent(next, EVENT_PROBABILITIES.buyGen, appendLog);
  return next;
}

// ─── buy upgrade ───────────────────────────────────────────────────────────

export function buyUpgradeAction(prev: GameState, upgId: string): GameState {
  const u = UPGRADES.find((u) => u.id === upgId);
  if (!u) return prev;
  if (prev.loc < u.cost || prev.upgrades.includes(upgId)) return prev;
  let next: GameState = { ...prev, loc: prev.loc - u.cost, upgrades: [...prev.upgrades, upgId] };
  if (u.ninesFloor !== undefined) {
    next = { ...next, nines: Math.max(next.nines || 0, u.ninesFloor) };
  }
  const flavor = u.purchaseMsg ?? `${u.name} unlocked. ${u.desc}.`;
  next = appendLog(next, flavor, 'info');
  next = maybeFireEvent(next, EVENT_PROBABILITIES.buyUpgrade, appendLog);
  return next;
}
