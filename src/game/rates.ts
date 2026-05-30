/**
 * Pure rate / cost calculations. None of these touch React or persistence —
 * they take game state (or relevant slices of it) and return derived values.
 *
 * Most calcs iterate over `UPGRADES` and apply effect fields with a
 * combination strategy documented inline (multiplicative, additive,
 * last-wins, max-wins). See `src/types.ts` for the full effect vocabulary.
 */

import { GENS, UPGRADES } from './data';
import type { GenDef, UpgDef } from '../types';
import {
  AGENT_BUFF,
  FREE_ACCOUNT,
  MONEY,
  PHASE_THRESHOLDS,
  TOKENS,
  UPTIME,
  WRITE_TEST,
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

export function calcAgentLocMult(upgrades: string[]): number {
  // Last-owned-wins (later upgrades replace earlier).
  let mult = 1;
  for (const u of ownedDefs(upgrades)) if (u.agentLocMult !== undefined) mult = u.agentLocMult;
  return mult;
}

// ─── rates ─────────────────────────────────────────────────────────────────

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
  let testFixRate = 0;

  for (const u of ownedDefs(upgrades)) {
    if (u.globalMult) globalMult *= u.globalMult;
    if (u.bugMult) bugMult *= u.bugMult;
    if (u.reviewLocMult !== undefined) reviewLocMult = u.reviewLocMult; // last-wins
    if (u.reviewBugMult !== undefined) reviewBugMult = u.reviewBugMult; // last-wins
    if (u.testFixRate) testFixRate += u.testFixRate;
  }

  // Each test reduces bug generation rate.
  if (tests > 0) bugMult *= 1 / (1 + tests * WRITE_TEST.bugDamping);

  for (const g of GENS) {
    const count = genCounts[g.id] ?? 0;
    if (count > 0) {
      locRate += g.locPerSec * count * globalMult * reviewLocMult;
      bugRate += g.bugsPerSec * count * bugMult * reviewBugMult;
      fixRate += g.fixPerSec * count;
    }
  }

  // CI runs the test suite continuously, fixing bugs proportional to coverage.
  if (testFixRate > 0 && tests > 0) fixRate += tests * testFixRate;

  return { locRate, bugRate, fixRate };
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
  maxTokens += extraAccounts * FREE_ACCOUNT.maxTokensPerExtra;
  tokenRegen += extraAccounts * FREE_ACCOUNT.tokenRegenPerExtra;

  for (const u of ownedDefs(upgrades)) {
    if (u.maxTokensBonus) maxTokens += u.maxTokensBonus;
    if (u.tokenRegenBonus) tokenRegen += u.tokenRegenBonus;
  }
  return { maxTokens, tokenRegen };
}

// ─── nines / bug bounty drain ──────────────────────────────────────────────

export function calcNinesRate(upgrades: string[], bugs: number): number {
  let rate = 0;
  for (const u of ownedDefs(upgrades)) {
    if (u.ninesPerSec) rate += u.ninesPerSec;
    if (u.ninesPerBugSec) rate += bugs * u.ninesPerBugSec;
  }
  return rate;
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
  return rate;
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

export function getPhase(totalLoc: number): number {
  for (let i = 0; i < PHASE_THRESHOLDS.length; i++) {
    if (totalLoc < PHASE_THRESHOLDS[i]) return i;
  }
  return PHASE_THRESHOLDS.length;
}

export function formatNinesPct(n: number): string {
  if (n <= 2) return '99%';
  return '99.' + '9'.repeat(n - 2) + '%';
}

// ─── money ─────────────────────────────────────────────────────────────────

/** Returns the largest `moneyCostPerSec` among owned upgrades (max-wins). */
function calcMoneyCost(upgrades: string[]): number {
  let cost = 0;
  for (const u of ownedDefs(upgrades)) {
    if (u.moneyCostPerSec && u.moneyCostPerSec > cost) cost = u.moneyCostPerSec;
  }
  return cost;
}

function moneyEnabled(upgrades: string[]): boolean {
  return ownedDefs(upgrades).some((u) => u.enablesMoney);
}

export function calcMoneyRate(
  upgrades: string[],
  locRate: number,
  uptimeFraction: number,
  launched: boolean,
): number {
  if (!moneyEnabled(upgrades)) return 0;
  const revenue = launched ? locRate * uptimeFraction * MONEY.revenuePerLocPerSec : 0;
  return revenue - calcMoneyCost(upgrades);
}

// ─── misc ──────────────────────────────────────────────────────────────────

export function calcBugPenalty(bugs: number): number {
  return Math.max(UPTIME.minOutputFraction, 1 / (1 + bugs * UPTIME.bugPenaltyRate));
}
