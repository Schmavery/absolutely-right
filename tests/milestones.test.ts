import { describe, expect, it } from 'vitest';
import {
  milestoneLocsReached,
  prepareSaveProgressMarkers,
  syncMilestonesSeen,
} from '../src/game/milestones';
import { defaultState } from '../src/game/state';

describe('milestones', () => {
  it('milestoneLocsReached lists thresholds at or below totalLoc', () => {
    expect(milestoneLocsReached(0)).toEqual([]);
    expect(milestoneLocsReached(1000)).toContain(10);
    expect(milestoneLocsReached(1000)).toContain(1000);
    expect(milestoneLocsReached(1000)).not.toContain(2000);
  });

  it('syncMilestonesSeen marks passed thresholds and adds hype once', () => {
    const once = syncMilestonesSeen({ ...defaultState(), totalLoc: 500 });
    expect(once.milestonesSeen).toContain(500);
    expect(once.hype).toBeGreaterThan(0);

    const again = syncMilestonesSeen({ ...once, totalLoc: 500 });
    expect(again.milestonesSeen).toEqual(once.milestonesSeen);
    expect(again.hype).toBe(once.hype);
  });

  it('prepareSaveProgressMarkers adds startup milestone log when log empty', () => {
    const s = prepareSaveProgressMarkers({
      ...defaultState(),
      started: true,
      totalLoc: 12_000,
      milestonesSeen: milestoneLocsReached(12_000),
      log: [],
      logId: 0,
    });
    expect(s.log.some((e) => e.type === 'milestone')).toBe(true);
    expect(s.milestonesSeen).toContain(10);
  });
});
