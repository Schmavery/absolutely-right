/**
 * Pure rate / cost calculations. None of these touch React or persistence —
 * they take game state (or relevant slices of it) and return derived values.
 *
 * Most calcs iterate over `UPGRADES` and apply effect fields with a
 * combination strategy documented inline (multiplicative, additive,
 * last-wins, max-wins). See `src/types.ts` for the full effect vocabulary.
 */

import { action, GENS, UPGRADES } from './data';
import type { GameState, GenDef, UpgDef } from '../types';
import {
  AGENT_BUFF,
  BUG_GENERATION,
  INVESTOR,
  NEGLIGIBLE_RATE,
  PROMPT_EVENT,
  TOKENS,
  UPTIME,
} from './constants';

// ─── helpers ───────────────────────────────────────────────────────────────

function ownedDefs(upgrades: string[]): UpgDef[] {
  // Iterating UPGRADES (not `upgrades`) preserves data-file order, which is
  // what last-wins semantics rely on.
  return UPGRADES.filter((u) => upgrades.includes(u.id));
}

// ─── generators / clicks ───────────────────────────────────────────────────

export function genCost(g: GenDef, owned: number): number {
  return Math.ceil(g.baseCost * Math.pow(g.costMult, owned));
}

export function calcClickPower(upgrades: string[]): number {
  let mult = 1;
  for (const u of ownedDefs(upgrades)) if (u.clickMult) mult *= u.clickMult;
  return mult;
}

export function calcClickBonus(upgrades: string[]): number {
  let bonus = 0;
  for (const u of ownedDefs(upgrades)) if (u.clickBonus) bonus += u.clickBonus;
  return bonus;
}

/** Prompt button cooldown; min-wins owned `promptCooldownMs` vs `actions.yaml` base. */
export function calcPromptCooldownMs(upgrades: string[]): number {
  const base = action('prompt').cooldownMs ?? 4000;
  let cd = base;
  for (const u of ownedDefs(upgrades)) {
    if (u.promptCooldownMs != null) cd = Math.min(cd, u.promptCooldownMs);
  }
  return cd;
}

/** Random prompt event chance after scripted msgs; decays to `baseProbability`. */
export function calcPromptEventProbability(
  baseProbability: number,
  clicksPastScripted: number,
): number {
  const { decayClicks } = PROMPT_EVENT;
  const t = Math.max(0, clicksPastScripted);
  if (t >= decayClicks) return baseProbability;
  return baseProbability + (1 - baseProbability) * ((decayClicks - t) / decayClicks);
}

export function calcAgentLocMult(upgrades: string[]): number {
  // Last-owned-wins (later upgrades replace earlier).
  let mult = 1;
  for (const u of ownedDefs(upgrades)) if (u.agentLocMult !== undefined) mult = u.agentLocMult;
  return mult;
}

/** Flat LOC/s from legacy `kick_agent` buff (pre-McMini); base + summed upgrade bonuses. */
export function calcKickAgentLocPerSec(upgrades: string[]): number {
  let rate = AGENT_BUFF.locPerSec;
  for (const u of ownedDefs(upgrades)) {
    if (u.kickAgentLocPerSec) rate += u.kickAgentLocPerSec;
  }
  return snapRate(rate);
}

export function kickAgentBuffActive(
  state: Pick<GameState, 'agentBuffExpires' | 'mcMinis'>,
  t: number,
): boolean {
  return (state.mcMinis ?? 0) === 0 && t < (state.agentBuffExpires ?? 0);
}

/** Effective `kick_agent` token cost; base from `actions.yaml` + summed bonuses. */
export function calcKickAgentTokenCost(upgrades: string[]): number {
  const base = action('kick_agent').tokenCost ?? 0;
  let bonus = 0;
  for (const u of ownedDefs(upgrades)) {
    if (u.kickAgentTokenCostBonus) bonus += u.kickAgentTokenCostBonus;
  }
  return base + bonus;
}

// ─── rates ─────────────────────────────────────────────────────────────────

/** Snap negligible per-second rates to zero so ticks and UI ignore noise. */
export function snapRate(rate: number): number {
  return Math.abs(rate) < NEGLIGIBLE_RATE ? 0 : rate;
}

/** Per-test bug-fix rate from owned CI-style upgrades (summed). */
export function calcTestFixRate(upgrades: string[]): number {
  let testFixRate = 0;
  for (const u of ownedDefs(upgrades)) if (u.testFixRate) testFixRate += u.testFixRate;
  return testFixRate;
}

export function calcRates(
  genCounts: Record<string, number>,
  upgrades: string[],
  tests: number,
): { locRate: number; bugRate: number; fixRate: number } {
  let locRate = 0;
  let bugRate = 0;
  let fixRate = 0;

  let globalMult = 1;
  let bugMult = 1;
  let reviewLocMult = 1;
  let reviewBugMult = 1;
  const testFixRate = calcTestFixRate(upgrades);

  for (const u of ownedDefs(upgrades)) {
    if (u.globalMult) globalMult *= u.globalMult;
    if (u.bugMult) bugMult *= u.bugMult;
    if (u.reviewLocMult !== undefined) reviewLocMult = u.reviewLocMult; // last-wins
    if (u.reviewBugMult !== undefined) reviewBugMult = u.reviewBugMult; // last-wins
  }

  // Each test reduces bug generation rate.
  const writeTestDamping = action('write_test').bugDamping ?? 0;
  if (tests > 0) bugMult *= 1 / (1 + tests * writeTestDamping);

  const { genCountExponent, throughputScale, throughputExponent } = BUG_GENERATION;

  for (const g of GENS) {
    const count = genCounts[g.id] ?? 0;
    if (count > 0) {
      locRate += g.locPerSec * count * globalMult * reviewLocMult;
      const bugUnits =
        genCountExponent === 1 ? count : Math.pow(count, genCountExponent);
      bugRate += g.bugsPerSec * bugUnits * bugMult * reviewBugMult;
      fixRate += g.fixPerSec * count;
    }
  }

  // More LOC/s ⇒ disproportionately more bugs (surface area / integration load).
  if (bugRate > 0 && locRate > 0 && throughputExponent > 0) {
    bugRate *= Math.pow(1 + locRate / throughputScale, throughputExponent);
  }

  // CI runs the test suite continuously, fixing bugs proportional to coverage.
  if (testFixRate > 0 && tests > 0) fixRate += tests * testFixRate;

  return {
    locRate: snapRate(locRate),
    bugRate: snapRate(bugRate),
    fixRate: snapRate(fixRate),
  };
}

// ─── tokens ────────────────────────────────────────────────────────────────

export function calcTokenConfig(
  upgrades: string[],
  freeAccounts: number = 1,
): { maxTokens: number; tokenRegen: number } {
  let maxTokens = TOKENS.baseMax;
  let tokenRegen = TOKENS.baseRegen;
  // Each additional free account adds a little capacity.
  const extraAccounts = Math.max(0, freeAccounts - 1);
  const newAccount = action('new_free_account');
  maxTokens += extraAccounts * (newAccount.maxTokensPerExtra ?? 0);
  tokenRegen += extraAccounts * (newAccount.tokenRegenPerExtra ?? 0);

  for (const u of ownedDefs(upgrades)) {
    if (u.maxTokensBonus) maxTokens += u.maxTokensBonus;
    if (u.tokenRegenBonus) tokenRegen += u.tokenRegenBonus;
  }
  return { maxTokens, tokenRegen: snapRate(tokenRegen) };
}

// ─── nines / bug bounty drain ──────────────────────────────────────────────

export function calcNinesRate(upgrades: string[], bugs: number): number {
  let rate = 0;
  for (const u of ownedDefs(upgrades)) {
    if (u.ninesPerSec) rate += u.ninesPerSec;
    if (u.ninesPerBugSec) rate += bugs * u.ninesPerBugSec;
  }
  return snapRate(rate);
}

/**
 * Returns the effective auto-drain rate (max-wins): a later upgrade with a
 * larger rate replaces earlier ones rather than stacking. Multiply by `bugs`
 * and `dt` at the call site.
 */
export function calcAutoBugDrainRate(upgrades: string[]): number {
  let rate = 0;
  for (const u of ownedDefs(upgrades)) {
    if (u.autoBugDrainRate && u.autoBugDrainRate > rate) rate = u.autoBugDrainRate;
  }
  return snapRate(rate);
}

// ─── uptime ────────────────────────────────────────────────────────────────

export interface Uptime {
  fraction: number;
  nines: number;
  pct: string;
  label: string;
}

export function calcUptime(bugs: number): Uptime {
  const fraction = Math.min(
    UPTIME.fractionMax,
    Math.max(UPTIME.fractionMin, 1 - bugs * UPTIME.bugFractionRate),
  );
  const nines = Math.min(5, -Math.log10(Math.max(1e-6, 1 - fraction)));
  const pct =
    fraction >= 0.9999
      ? (fraction * 100).toFixed(3) + '%'
      : fraction >= 0.999
        ? (fraction * 100).toFixed(2) + '%'
        : fraction >= 0.99
          ? (fraction * 100).toFixed(1) + '%'
          : (fraction * 100).toFixed(0) + '%';
  const label =
    nines >= 4.9
      ? '5 nines'
      : nines >= 3.9
        ? '4 nines'
        : nines >= 2.9
          ? '3 nines'
          : nines >= 1.9
            ? '2 nines'
            : nines >= 0.9
              ? '1 nine'
              : 'no nines';
  return { fraction, nines, pct, label };
}

export function formatNinesPct(n: number): string {
  if (n <= 2) return '99%';
  return '99.' + '9'.repeat(n - 2) + '%';
}

// ─── burn (investor overlay) ───────────────────────────────────────────────

/** LOC/s from McMinis assigned to code (before bug penalty). */
export function calcMcMiniCodeLocRate(codeMinis: number, upgrades: string[]): number {
  if (codeMinis <= 0) return 0;
  return snapRate(codeMinis * INVESTOR.codeLocPerMini * calcAgentLocMult(upgrades));
}

/** Infra burn $/s from owned subs (`moneyCostPerSec` max-wins). Higher is good for raises. */
export function calcInfraBurnPerSec(upgrades: string[]): number {
  let burn = 0;
  for (const u of ownedDefs(upgrades)) {
    if (u.moneyCostPerSec && u.moneyCostPerSec > burn) burn = u.moneyCostPerSec;
  }
  return burn;
}

// ─── misc ──────────────────────────────────────────────────────────────────

export function calcBugPenalty(bugs: number): number {
  return Math.max(UPTIME.minOutputFraction, 1 / (1 + bugs * UPTIME.bugPenaltyRate));
}
