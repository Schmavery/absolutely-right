import type { GameState } from '../types';
import { fmt, fmtRate } from '../lib/format';
import {
  calcBugPenalty,
  calcInfraBurnPerSec,
  calcMcMiniCodeLocRate,
  calcNinesRate,
  calcRates,
  calcTokenConfig,
  calcUptime,
  formatNinesPct,
  snapRate,
} from '../game/rates';
import { AGENT_BUFF, INVESTOR, THRESHOLDS, TOKENS } from '../game/constants';
import { deriveGame } from '../game/derive';
import { normalizeMcMiniLanes } from '../game/investor';
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
  const netBugRate = snapRate(bugRate - fixRate);
  const bugPenalty = calcBugPenalty(state.bugs);
  const uptime = calcUptime(state.bugs);
  const { maxTokens, tokenRegen } = calcTokenConfig(state.upgrades, state.freeAccounts);
  const ninesRate = calcNinesRate(state.upgrades, state.bugs);
  const currentNines = ui.ninesTracking
    ? Math.max(state.nines || 0, AGENT_BUFF.ninesFloorFallback)
    : 0;
  const ninesInt = Math.floor(currentNines);
  const showAsCounter = ninesInt >= 8;

  const lanes = normalizeMcMiniLanes(state.mcMinis ?? 0, state.mcMiniLanes);
  const mcMiniLoc = calcMcMiniCodeLocRate(lanes.code, state.upgrades) * bugPenalty;
  const displayLocRate = snapRate(locRate * bugPenalty + mcMiniLoc);
  const burnRate = calcInfraBurnPerSec(state.upgrades);
  const buzz = state.buzzMeter ?? 0;

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
      {ui.showTokens && (
        <Row label="tokens">
          <span className={state.tokens < TOKENS.lowWarnThreshold ? 'text-red' : 'text-fg'}>
            {Math.floor(state.tokens)}
          </span>
          <span className="text-dimmer text-[12px]">/ {maxTokens}</span>
          {state.tokens < maxTokens && tokenRegen !== 0 && (
            <span className="text-dimmer text-[12px]">(+{tokenRegen}/s)</span>
          )}
        </Row>
      )}

      {/* loc */}
      <Row label="loc">
        <span className="text-green">{fmt(state.loc)}</span>
        {displayLocRate !== 0 && (
          <span className="text-green-dim text-[12px]">({fmtRate(displayLocRate)})</span>
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
            {(() => {
              const ciFix = snapRate(
                state.tests * (UPGRADES.find((u) => u.id === 'cicd')?.testFixRate ?? 0),
              );
              return ciFix !== 0 ? ` · CI +${ciFix.toFixed(1)}/s fix` : '';
            })()}
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

      {/* investor overlay */}
      {ui.showInvestor && (
        <>
          <Row label="burn rate">
            <span className="text-green">${burnRate}/s</span>
          </Row>
          <Row label="buzz">
            <span className={buzz >= INVESTOR.buzzMax ? 'text-purple' : 'text-dim'}>
              {Math.floor(buzz)}%
            </span>
            <span className="text-dimmer text-[12px] w-[72px] inline-block h-[6px] bg-border align-middle ml-1">
              <span
                className="block h-full bg-purple/60"
                style={{ width: `${Math.min(100, buzz)}%` }}
              />
            </span>
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
