import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../src/game/data';
import { calcRates, calcUptime } from '../src/game/rates';
import { defaultState } from '../src/game/state';
import { tickReducer } from '../src/game/tick';
import { THRESHOLDS } from '../src/game/constants';

const centaurPolicy = UPGRADES.find((u) => u.id === 'upside_down_centaur_policy')!;
const codeReview = UPGRADES.find((u) => u.id === 'code_review')!;
const codeReviewReview = UPGRADES.find((u) => u.id === 'code_review_review')!;
const alwaysAllow = UPGRADES.find((u) => u.id === 'always_allow')!;
const yoloMode = UPGRADES.find((u) => u.id === 'yolo_mode')!;

function stateForReviewCrisisUnlock() {
  const unlockAt = Math.min(centaurPolicy.unlockAt, codeReview.unlockAt);
  const cost = Math.min(centaurPolicy.cost, codeReview.cost);
  return {
    ...defaultState(),
    started: true,
    launched: true,
    upgrades: ['mcp_tools'],
    totalLoc: unlockAt * THRESHOLDS.upgradeUnlockFraction,
    loc: cost * THRESHOLDS.upgradeAffordFraction,
    bugs: 1200,
  };
}

describe('approval-chain bug multipliers', () => {
  const gens = { autocomplete: 3 };

  it('always_allow doubles bug rate', () => {
    const base = calcRates(gens, ['mcp_tools'], 0).bugRate;
    const withAllow = calcRates(gens, ['mcp_tools', 'always_allow'], 0).bugRate;
    expect(withAllow).toBeCloseTo(base * (alwaysAllow.bugMult ?? 1), 8);
  });

  it('yolo stacks ~20× with always_allow', () => {
    const base = calcRates(gens, ['mcp_tools'], 0).bugRate;
    const reckless = calcRates(gens, ['mcp_tools', 'always_allow', 'yolo_mode'], 0).bugRate;
    expect(reckless).toBeCloseTo(base * 20, 8);
  });
});

describe('review crisis shop gates', () => {
  it('does not unlock crisis upgrades with healthy uptime', () => {
    const prev = stateForReviewCrisisUnlock();
    prev.bugs = 50;
    const next = tickReducer(prev, 1);
    expect(next.unlockedUpgrades).not.toContain('upside_down_centaur_policy');
    expect(next.unlockedUpgrades).not.toContain('code_review');
  });

  it('unlocks centaur policy at ≤1 nine with MCP owned', () => {
    const prev = stateForReviewCrisisUnlock();
    expect(calcUptime(prev.bugs).nines).toBeLessThanOrEqual(1);
    const next = tickReducer(prev, 1);
    expect(next.unlockedUpgrades).toContain('upside_down_centaur_policy');
  });

  it('does not unlock code_review until centaur policy is owned', () => {
    const prev = stateForReviewCrisisUnlock();
    const next = tickReducer(prev, 1);
    expect(next.unlockedUpgrades).toContain('upside_down_centaur_policy');
    expect(next.unlockedUpgrades).not.toContain('code_review');
  });

  it('unlocks code_review after centaur policy is purchased', () => {
    const prev = stateForReviewCrisisUnlock();
    prev.upgrades = ['mcp_tools', 'upside_down_centaur_policy'];
    prev.totalLoc = codeReview.unlockAt * THRESHOLDS.upgradeUnlockFraction;
    prev.loc = codeReview.cost * THRESHOLDS.upgradeAffordFraction;
    const next = tickReducer(prev, 1);
    expect(next.unlockedUpgrades).toContain('code_review');
  });

  it('does not unlock crisis chain before mcp_tools', () => {
    const prev = stateForReviewCrisisUnlock();
    prev.upgrades = [];
    const next = tickReducer(prev, 1);
    expect(next.unlockedUpgrades).not.toContain('upside_down_centaur_policy');
    expect(next.unlockedUpgrades).not.toContain('code_review');
  });
});

describe('review chain rate multipliers', () => {
  const gens = { autocomplete: 5 };

  it('centaur policy increases bug rate', () => {
    const base = calcRates(gens, ['mcp_tools'], 0).bugRate;
    const withCentaur = calcRates(gens, ['mcp_tools', 'upside_down_centaur_policy'], 0).bugRate;
    expect(withCentaur).toBeCloseTo(base * (centaurPolicy.bugMult ?? 1), 8);
  });

  it('code_review_review last-wins: slower output and fewer bugs than code_review alone', () => {
    const humanOnly = calcRates(gens, ['code_review'], 0);
    const meta = calcRates(gens, ['code_review', 'code_review_review'], 0);
    expect(meta.locRate).toBeCloseTo(
      humanOnly.locRate * ((codeReviewReview.reviewLocMult ?? 1) / (codeReview.reviewLocMult ?? 1)),
      6,
    );
    expect(meta.bugRate).toBeLessThan(humanOnly.bugRate);
  });
});

describe('unlockMaxUptimeNines threshold', () => {
  it('≈1000 current bugs is at most one nine', () => {
    const { nines } = calcUptime(1000);
    expect(nines).toBeLessThanOrEqual(1);
  });
});

describe('superlinear bug generation', () => {
  const empireGens = { autocomplete: 9, copilot: 7, chatgpt: 3, api: 1 };
  const empireUpgrades = [
    'model_update_1',
    'model_update_2',
    'model_update_3',
    'better_prompts',
    'few_shot',
    'cicd',
    'eslint',
    'cot',
    'multi_agent',
    'mcp_tools',
    'pro_plan',
    'model_update_4',
    'unit_tests',
    'typescript',
    'extended_thinking',
    'always_allow',
  ];

  it('scales bugs faster than LOC when stacking generators', () => {
    const small = calcRates({ autocomplete: 3 }, [], 0);
    const big = calcRates({ autocomplete: 9 }, [], 0);
    const locRatio = big.locRate / small.locRate;
    const bugRatio = big.bugRate / small.bugRate;
    expect(bugRatio).toBeGreaterThan(locRatio);
  });

  it('high-throughput + always_allow can outpace CI fixes (review crisis reachable)', () => {
    const { bugRate, fixRate } = calcRates(empireGens, empireUpgrades, 21);
    expect(bugRate).toBeGreaterThan(fixRate);
  });
});
