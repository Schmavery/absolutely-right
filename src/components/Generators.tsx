import type { GameState } from '../types';
import { action, GENS } from '../game/data';
import { genCost } from '../game/rates';
import { fmt, fmtRate } from '../lib/format';
import { deriveGame } from '../game/derive';
import { Button } from './Button';

interface Props {
  state: GameState;
  onBuyGen: (id: string) => void;
  onNewFreeAccount: () => void;
}

export function Generators({ state, onBuyGen, onNewFreeAccount }: Props) {
  const { thresholds } = deriveGame(state);
  const newAccount = action('new_free_account');
  const visibleGens = GENS.filter(
    (g) => state.totalLoc >= g.unlockAt * thresholds.generatorVisibleFraction,
  );
  const showNewFreeAccount =
    (state.totalTokensSpent ?? 0) >= thresholds.showNewFreeAccountTokens ||
    state.freeAccounts > 1;
  const freeAccountCDElapsed = Date.now() - (state.actionCooldowns['free_account'] ?? 0);
  const freeAccountOnCD = freeAccountCDElapsed < (newAccount.cooldownMs ?? 0);
  const freeAccountProgress = Math.min(
    1,
    freeAccountCDElapsed / (newAccount.cooldownMs ?? 1),
  );

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
            title={`+${newAccount.maxTokensPerExtra} max tokens, +${newAccount.tokenRegenPerExtra}/s regen · ${state.freeAccounts} account${
              state.freeAccounts !== 1 ? 's' : ''
            } active`}
            progress={freeAccountOnCD ? freeAccountProgress : 1}
            progressClassName="bg-green/10"
          >
            create
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
            <Button
              off={!canAfford}
              onClick={() => onBuyGen(g.id)}
              title={g.desc}
              progress={Math.max(0, Math.min(1, state.loc / cost))}
            >
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
