import type { GameState } from '../types';
import { GENS } from '../game/data';
import { genCost } from '../game/rates';
import { fmt, fmtRate } from '../lib/format';
import { COOLDOWNS, FREE_ACCOUNT, THRESHOLDS } from '../game/constants';
import { Button } from './Button';

interface Props {
  state: GameState;
  onBuyGen: (id: string) => void;
  onNewFreeAccount: () => void;
}

export function Generators({ state, onBuyGen, onNewFreeAccount }: Props) {
  const visibleGens = GENS.filter(
    (g) => state.totalLoc >= g.unlockAt * THRESHOLDS.generatorVisibleFraction,
  );
  const showNewFreeAccount =
    (state.totalTokensSpent ?? 0) >= THRESHOLDS.showNewFreeAccountTokens ||
    state.freeAccounts > 1;
  const freeAccountCDElapsed = Date.now() - (state.actionCooldowns['free_account'] ?? 0);
  const freeAccountOnCD = freeAccountCDElapsed < COOLDOWNS.freeAccount;
  const freeAccountProgress = Math.min(1, freeAccountCDElapsed / COOLDOWNS.freeAccount);

  return (
    <div>
      <SectionHeader>generators</SectionHeader>

      {showNewFreeAccount && (
        <Row>
          <Name>
            Free Account
            {state.freeAccounts > 1 && <span className="text-blue"> [{state.freeAccounts}]</span>}
          </Name>
          <Button
            off={freeAccountOnCD}
            onClick={freeAccountOnCD ? undefined : onNewFreeAccount}
            title={`+${FREE_ACCOUNT.maxTokensPerExtra} max tokens, +${FREE_ACCOUNT.tokenRegenPerExtra}/s regen · ${state.freeAccounts} account${
              state.freeAccounts !== 1 ? 's' : ''
            } active`}
            className="relative overflow-hidden"
          >
            {freeAccountOnCD && (
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 bg-green/10 pointer-events-none"
                style={{ width: `${freeAccountProgress * 100}%` }}
              />
            )}
            <span className="relative">create</span>
          </Button>
          <Desc>a different email. still free. just this once.</Desc>
        </Row>
      )}

      {visibleGens.map((g) => {
        const owned = state.genCounts[g.id] ?? 0;
        const cost = genCost(g, owned);
        const canAfford = state.loc >= cost;
        return (
          <Row key={g.id}>
            <Name>
              {g.name}
              {owned > 0 && <span className="text-green"> [{owned}]</span>}
            </Name>
            <Button off={!canAfford} onClick={() => onBuyGen(g.id)} title={g.desc}>
              buy
            </Button>
            <div className="text-[12px]">
              <span className={canAfford ? 'text-dim' : 'text-dimmer'}>{fmt(cost)} loc</span>
              {owned > 0 ? (
                <span className="text-green-dim ml-[10px]">{fmtRate(g.locPerSec * owned)}</span>
              ) : (
                <span className="text-dimmer ml-[10px]">{g.desc}</span>
              )}
            </div>
          </Row>
        );
      })}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-dim text-[11px] tracking-[0.12em] uppercase mb-[10px] mt-6 pb-[5px] border-b border-border">
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_80px_1fr] gap-[6px] items-baseline mb-[7px]">
      {children}
    </div>
  );
}

function Name({ children }: { children: React.ReactNode }) {
  return <div className="text-fg">{children}</div>;
}

function Desc({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-dimmer">{children}</div>;
}
