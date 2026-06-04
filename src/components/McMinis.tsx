import type { GameState } from '../types';
import { normalizeMcMiniLanes } from '../game/investor';
import type { McMiniLane } from '../game/investor';
import { INVESTOR } from '../game/constants';

interface Props {
  state: GameState;
  onShiftLane: (from: McMiniLane, to: McMiniLane) => void;
}

function donorLane(to: McMiniLane, lanes: ReturnType<typeof normalizeMcMiniLanes>): McMiniLane | null {
  const order: McMiniLane[] =
    to === 'code' ? ['tests', 'growth'] : to === 'growth' ? ['code', 'tests'] : ['growth', 'code'];
  for (const d of order) if (lanes[d] > 0) return d;
  return null;
}

const LANES: { id: McMiniLane; label: string; hint: string }[] = [
  { id: 'code', label: 'code', hint: 'LOC/s · burns tokens' },
  { id: 'growth', label: 'growth', hint: 'Lobstagram · buzz/s' },
  { id: 'tests', label: 'tests', hint: 'burns tokens' },
];

export function McMinis({ state, onShiftLane }: Props) {
  const mcMinis = state.mcMinis ?? 0;
  if (mcMinis <= 0) return null;

  const lanes = normalizeMcMiniLanes(mcMinis, state.mcMiniLanes);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="text-dim text-[12px] mb-2">
        McMinis <span className="text-fg">{mcMinis}</span>
        <span className="text-dimmer"> — assign each box</span>
      </div>
      {LANES.map(({ id, label, hint }) => {
        const donor = donorLane(id, lanes);
        return (
          <div key={id} className="flex gap-[10px] items-baseline mb-[4px] text-[13px]">
            <span className="text-dim w-[80px]">{label}</span>
            <span className="text-fg w-[20px] text-right">{lanes[id]}</span>
            <button
              type="button"
              className="text-dimmer hover:text-fg px-1 disabled:opacity-30"
              disabled={lanes[id] <= 0}
              onClick={() =>
                onShiftLane(
                  id,
                  id === 'code' ? 'growth' : id === 'growth' ? 'tests' : 'code',
                )
              }
              title={`move one McMini off ${label}`}
            >
              −
            </button>
            <button
              type="button"
              className="text-dimmer hover:text-fg px-1 disabled:opacity-30"
              disabled={!donor}
              onClick={() => donor && onShiftLane(donor, id)}
              title={`move one McMini onto ${label}`}
            >
              +
            </button>
            <span className="text-dimmer text-[11px]">{hint}</span>
          </div>
        );
      })}
      <div className="text-dimmer text-[11px] mt-1">
        Growth: +{INVESTOR.buzzPerSecPerGrowthMini} buzz/s per McMini · code: +$
        {INVESTOR.tokenDrainPerCodeMini}/s tokens per McMini
      </div>
    </div>
  );
}
