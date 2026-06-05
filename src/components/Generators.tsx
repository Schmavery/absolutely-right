import type { GameState } from '../types';
import { action, GENS } from '../game/data';
import { genCost } from '../game/rates';
import { fmt, fmtRate } from '../lib/format';
import { snapRate } from '../game/rates';
import { getMove, rechargeProgress } from '../game/availability';
import { Button } from './Button';

interface Props {
  state: GameState;
  onBuyGen: (id: string) => void;
  onNewFreeAccount: () => void;
}

export function Generators({ state, onBuyGen, onNewFreeAccount }: Props) {
  const now = Date.now();
  const newAccount = getMove(state, 'new_free_account', now)!;
  const newAccountData = action('new_free_account');

  return (
    <div>
      <SectionHeader>generators</SectionHeader>

      {newAccount.visible && (
        <Row>
          <Name>
            Free Account
            {state.freeAccounts > 1 && <span className="text-blue"> [{state.freeAccounts}]</span>}
          </Name>
          <Button
            off={!newAccount.legal}
            onClick={newAccount.legal ? onNewFreeAccount : undefined}
            title={`+${newAccountData.maxTokensPerExtra} max tokens, +${newAccountData.tokenRegenPerExtra}/s regen · ${state.freeAccounts} account${
              state.freeAccounts !== 1 ? 's' : ''
            } active`}
            progress={rechargeProgress(newAccount)}
            progressClassName="bg-green/10"
          >
            create
          </Button>
          <Desc>a different email. still free. just this once.</Desc>
        </Row>
      )}

      {GENS.map((g) => {
        const move = getMove(state, `buy_gen:${g.id}`, now)!;
        if (!move.visible) return null;
        const owned = state.genCounts[g.id] ?? 0;
        const cost = genCost(g, owned);
        const genLocRate = snapRate(g.locPerSec * owned);
        return (
          <Row key={g.id}>
            <Name>
              {g.name}
              {owned > 0 && <span className="text-green"> [{owned}]</span>}
            </Name>
            <Button
              off={!move.legal}
              onClick={() => onBuyGen(g.id)}
              title={g.desc}
              progress={rechargeProgress(move)}
            >
              buy
            </Button>
            <div className="text-[12px]">
              <span className={move.legal ? 'text-dim' : 'text-dimmer'}>{fmt(cost)} loc</span>
              {genLocRate !== 0 ? (
                <span className="text-green-dim ml-[10px]">{fmtRate(genLocRate)}</span>
              ) : owned === 0 ? (
                <span className="text-dimmer ml-[10px]">{g.desc}</span>
              ) : null}
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
