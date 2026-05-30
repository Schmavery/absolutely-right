import type { GameState } from '../types';
import { fmt, fmtRate } from '../lib/format';
import {
  calcAgentLocMult,
  calcBugPenalty,
  calcClickPower,
  calcMoneyRate,
  calcNinesRate,
  calcRates,
  calcTokenConfig,
  calcUptime,
  formatNinesPct,
} from '../game/rates';
import {
  AGENT_BUFF,
  HYPE,
  LOC_PER_CLICK_POWER,
  THRESHOLDS,
  TOKENS,
} from '../game/constants';
import { deriveGame } from '../game/derive';
import { action, UPGRADES } from '../game/data';

interface RowProps {
  label: string;
  children: React.ReactNode;
}
function Row({ label, children }: RowProps) {
  return (
    <div className="flex gap-[10px] items-baseline mb-[3px]">
      <span className="text-dim w-[80px]">{label}</span>
      {children}
    </div>
  );
}

interface Props {
  state: GameState;
}

export function ResourcePanel({ state }: Props) {
  const derived = deriveGame(state);
  const { ui, thresholds, hasFlag } = derived;
  const { locRate, bugRate, fixRate } = calcRates(state.genCounts, state.upgrades, state.tests ?? 0);
  const netBugRate = bugRate - fixRate;
  const bugPenalty = calcBugPenalty(state.bugs);
  const uptime = calcUptime(state.bugs);
  const { maxTokens, tokenRegen } = calcTokenConfig(state.upgrades, state.freeAccounts);
  const moneyRate = calcMoneyRate(state.upgrades, locRate, uptime.fraction, state.launched);
  const ninesRate = calcNinesRate(state.upgrades, state.bugs);
  const currentNines = ui.ninesTracking
    ? Math.max(state.nines || 0, AGENT_BUFF.ninesFloorFallback)
    : 0;
  const ninesInt = Math.floor(currentNines);
  const showAsCounter = ninesInt >= 8;
  const agentBuffRemaining = Math.max(0, state.agentBuffExpires - Date.now());

  const uptimeColorClass =
    uptime.nines >= 4
      ? 'text-green'
      : uptime.nines >= 3
        ? 'text-green-dim'
        : uptime.nines >= 2
          ? 'text-yellow'
          : 'text-red';

  return (
    <div className="mt-[18px]">
      {/* tokens */}
      <Row label="tokens">
        <span className={state.tokens < TOKENS.lowWarnThreshold ? 'text-red' : 'text-fg'}>
          {Math.floor(state.tokens)}
        </span>
        <span className="text-dimmer text-[12px]">/ {maxTokens}</span>
        {state.tokens < maxTokens && (
          <span className="text-dimmer text-[12px]">(+{tokenRegen}/s)</span>
        )}
      </Row>

      {/* loc */}
      <Row label="loc">
        <span className="text-green">{fmt(state.loc)}</span>
        {(locRate > 0 || agentBuffRemaining > 0) && (
          <span className={(agentBuffRemaining > 0 ? 'text-green' : 'text-green-dim') + ' text-[12px]'}>
            (
            {fmtRate(
              (locRate +
                (agentBuffRemaining > 0
                  ? calcClickPower(state.upgrades) *
                    LOC_PER_CLICK_POWER *
                    calcAgentLocMult(state.upgrades)
                  : 0)) *
                bugPenalty,
            )}
            )
          </span>
        )}
      </Row>

      {/* bugs */}
      {ui.showBugs && (
        <Row label="bugs">
          <span className={state.bugs > 0 ? 'text-red' : 'text-green'}>{fmt(state.bugs)}</span>
          {netBugRate !== 0 && (
            <span className={(netBugRate > 0 ? 'text-red-dim' : 'text-green-dim') + ' text-[12px]'}>
              ({netBugRate > 0 ? '+' : ''}
              {fmtRate(netBugRate)})
            </span>
          )}
        </Row>
      )}

      {/* tests */}
      {(state.tests ?? 0) > 0 && !hasFlag('ai_review') && (
        <Row label="tests">
          <span className="text-dim">{state.tests}</span>
          <span className="text-dimmer text-[12px]">
            (−{Math.round(100 * (1 - 1 / (1 + state.tests * (action('write_test').bugDamping ?? 0))))}% bugs
            {state.upgrades.includes('cicd')
              ? ` · CI +${(state.tests * (UPGRADES.find((u) => u.id === 'cicd')?.testFixRate ?? 0)).toFixed(1)}/s fix`
              : ''}
            )
          </span>
        </Row>
      )}

      {/* uptime / nines */}
      {ui.showUptime && !ui.ninesTracking && (
        <Row label="uptime">
          <span className={uptimeColorClass}>{uptime.pct}</span>
          <span className={uptimeColorClass + ' text-[12px]'}>({uptime.label})</span>
        </Row>
      )}
      {ui.ninesTracking && !showAsCounter && (
        <Row label="uptime">
          <span className="text-green">{formatNinesPct(ninesInt)}</span>
          <span className="text-green-dim text-[12px]">({ninesInt} nines)</span>
        </Row>
      )}
      {showAsCounter && (
        <Row label="nines">
          <span className="text-green">{ninesInt}</span>
          {ninesRate > 0 && <span className="text-green-dim text-[12px]">(+{ninesRate.toFixed(4)}/s)</span>}
        </Row>
      )}

      {/* hype */}
      {ui.showHype && (
        <Row label="hype">
          <span className="text-purple">{fmt(state.hype)}</span>
          {state.hype >= HYPE.goingViral && (
            <span className="text-purple text-[12px]">(going viral)</span>
          )}
          {state.hype >= HYPE.buildingMomentum && state.hype < HYPE.goingViral && (
            <span className="text-purple text-[12px]">(building momentum)</span>
          )}
        </Row>
      )}

      {/* money */}
      {ui.showMoney && (
        <Row label="money">
          <span className={state.money < 0 ? 'text-red' : 'text-green'}>
            ${Math.floor(Math.abs(state.money))}
            {state.money < 0 ? ' (debt)' : ''}
          </span>
          {moneyRate !== 0 && (
            <span className={(moneyRate < 0 ? 'text-red-dim' : 'text-green-dim') + ' text-[12px]'}>
              ({moneyRate > 0 ? '+' : ''}${moneyRate.toFixed(1)}/s)
            </span>
          )}
        </Row>
      )}

      {/* stats */}
      {ui.showStats && (
        <>
          <Row label="total loc">
            <span className="text-dim">{fmt(state.totalLoc)}</span>
          </Row>
          <Row label="prompts">
            <span className="text-dim">{fmt(state.totalClicks)}</span>
          </Row>
        </>
      )}

      {/* warnings */}
      {state.bugs > thresholds.warnBugsElevated && (
        <div className="mt-2 text-red-dim text-[12px]">
          ⚠ {state.bugs > thresholds.warnBugsCritical ? 'critical' : 'elevated'} bug load
          {state.bugs > thresholds.warnBugsPenaltyShown
            ? ` — output at ${Math.round(bugPenalty * 100)}%`
            : ''}
          {ui.showUptime && !ui.ninesTracking && uptime.nines < THRESHOLDS.warnUptimeDegradedNines
            ? ' — uptime degraded'
            : ''}
        </div>
      )}
      {ui.showUptime && !ui.ninesTracking && uptime.nines < THRESHOLDS.warnUptimeFireNines && (
        <div className="mt-1 text-red text-[12px]">⚠ production is on fire</div>
      )}
    </div>
  );
}
