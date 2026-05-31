import type { GameState } from '../types';
import { UPGRADES } from '../game/data';
import { fmt } from '../lib/format';
import { getMove, rechargeProgress } from '../game/availability';
import { Button } from './Button';

interface Props {
  state: GameState;
  onBuyUpgrade: (id: string) => void;
}

export function Upgrades({ state, onBuyUpgrade }: Props) {
  const now = Date.now();
  const visible = UPGRADES.map((u) => ({
    u,
    move: getMove(state, `buy_upgrade:${u.id}`, now)!,
  })).filter(({ move }) => move.visible);
  if (visible.length === 0) return null;

  return (
    <div>
      <div className="text-dim text-[11px] tracking-[0.12em] uppercase mb-[10px] mt-6 pb-[5px] border-b border-border">
        upgrades
      </div>
      {visible.map(({ u, move }) => (
        <div
          key={u.id}
          className="grid grid-cols-[180px_56px_1fr] gap-[6px] items-baseline mb-[7px]"
        >
          <div className="text-fg">{u.name}</div>
          <Button
            off={!move.legal}
            onClick={() => onBuyUpgrade(u.id)}
            title={u.desc}
            progress={rechargeProgress(move)}
          >
            buy
          </Button>
          <div className="text-[12px]">
            <span className={move.legal ? 'text-dim' : 'text-dimmer'}>{fmt(u.cost)} loc</span>
            <span className="text-dimmer ml-[10px]">{u.desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InstalledList({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="mt-[10px] text-dimmer text-[11px]">
      installed: {ids.map((id) => UPGRADES.find((u) => u.id === id)?.name).join(', ')}
    </div>
  );
}
