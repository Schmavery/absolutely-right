import { describe, expect, it } from 'vitest';
import {
  buildSeedColumnRows,
  collapseRoutineActions,
  collapseSeedColumnRows,
  collapseTimelineRows,
  formatBasicActionCounts,
  formatRoutineActionBreakdown,
  routineActionLabel,
  formatTestActionCounts,
  moveRedundantWithMilestone,
  milestonePurchaseKeys,
  type SeedColumnRow,
  type TraceMilestone,
} from '../src/debug/traceAnalyze';
import type { MoveKind } from '../src/game/availability';

function moveRow(
  moveId: string,
  opts: { count?: number; t?: number; key?: string } = {},
): Extract<SeedColumnRow, { kind: 'move' }> {
  const t = opts.t ?? 0;
  return {
    key: opts.key ?? `col-mv-${moveId}-${t}`,
    kind: 'move',
    moveId,
    moveKind: 'action' as MoveKind,
    t,
    loc: 100,
    count: opts.count ?? 1,
    endT: t + (opts.count ?? 1) * 1000,
    endLoc: 200,
  };
}

describe('collapseRoutineActions', () => {
  it('merges consecutive basic actions with separate basicCounts', () => {
    const raw = [
      moveRow('prompt', { t: 0 }),
      moveRow('prompt', { t: 1500 }),
      moveRow('paste_error', { t: 3000 }),
      moveRow('clear_context', { t: 4500 }),
      moveRow('kick_agent', { t: 6000 }),
    ];
    const out = collapseTimelineRows(raw);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('routine-actions');
    if (out[0]?.kind !== 'routine-actions') return;
    expect(out[0].count).toBe(5);
    expect(out[0].basicCounts).toEqual({
      prompt: 2,
      paste_error: 1,
      clear_context: 1,
      kick_agent: 1,
    });
    expect(out[0].testCounts).toEqual({});
  });

  it('merges basic and test into one routine row', () => {
    const out = collapseTimelineRows([
      moveRow('prompt', { t: 0 }),
      moveRow('run_tests', { t: 1500 }),
      moveRow('write_test', { t: 3000 }),
      moveRow('paste_error', { t: 4500 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('routine-actions');
    if (out[0]?.kind !== 'routine-actions') return;
    expect(out[0].count).toBe(4);
    expect(out[0].basicCounts).toEqual({ prompt: 1, paste_error: 1 });
    expect(out[0].testCounts).toEqual({ run_tests: 1, write_test: 1 });
  });

  it('does not merge across non-routine moves', () => {
    const rows = [
      moveRow('prompt', { t: 0 }),
      moveRow('bug_bounty', { t: 2000 }),
      moveRow('prompt', { t: 4000 }),
    ];
    const out = collapseRoutineActions(collapseSeedColumnRows(rows));
    expect(out.map((r) => r.kind)).toEqual(['routine-actions', 'move', 'routine-actions']);
  });

  it('leaves non-routine actions unchanged', () => {
    const rows = [moveRow('bug_bounty'), moveRow('new_free_account', { t: 1000 })];
    expect(collapseRoutineActions(rows)).toEqual(rows);
  });
});

describe('collapseTimelineRows', () => {
  it('applies identical collapse then routine grouping', () => {
    const raw: SeedColumnRow[] = [
      moveRow('prompt', { t: 0 }),
      moveRow('prompt', { t: 1500 }),
      moveRow('prompt', { t: 3000 }),
    ];
    const out = collapseTimelineRows(raw);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('routine-actions');
    if (out[0]?.kind !== 'routine-actions') return;
    expect(out[0].count).toBe(3);
    expect(out[0].basicCounts.prompt).toBe(3);
  });
});

describe('formatRoutineActionBreakdown', () => {
  it('shows per-action detail without bucket prefixes', () => {
    expect(
      formatRoutineActionBreakdown({ prompt: 2 }, { write_test: 1, run_tests: 3 }),
    ).toBe('prompt 2 · write_test 1, run_tests 3');
  });
});

describe('routineActionLabel', () => {
  it('shows separate basic and test totals', () => {
    expect(routineActionLabel({ prompt: 40, paste_error: 2 }, { run_tests: 5 })).toBe(
      'basic 42 · tests 5',
    );
  });
});

describe('moveRedundantWithMilestone', () => {
  const keys = milestonePurchaseKeys([
    { kind: 'gen', id: 'autocomplete', t: 5000, totalLoc: 1000 },
    { kind: 'upgrade', id: 'ci', t: 9000, totalLoc: 2000 },
    { kind: 'launch', t: 12000, totalLoc: 10000 },
  ] as TraceMilestone[]);

  it('drops buy_gen when gen milestone exists at same t', () => {
    expect(
      moveRedundantWithMilestone(
        { t: 5000, id: 'buy_gen:autocomplete', kind: 'buy_gen', target: 'autocomplete' },
        keys,
      ),
    ).toBe(true);
  });

  it('keeps buy_gen when no matching milestone', () => {
    expect(
      moveRedundantWithMilestone(
        { t: 6000, id: 'buy_gen:autocomplete', kind: 'buy_gen', target: 'autocomplete' },
        keys,
      ),
    ).toBe(false);
  });
});

describe('buildSeedColumnRows', () => {
  it('omits purchase moves covered by milestones', () => {
    const rows = buildSeedColumnRows(
      {
        botId: 'greedy',
        seed: 1,
        milestones: [{ kind: 'gen', id: 'autocomplete', t: 100, totalLoc: 1000 }],
        moves: [
          {
            t: 100,
            id: 'buy_gen:autocomplete',
            kind: 'buy_gen',
            target: 'autocomplete',
            loc: 1000,
          },
          { t: 200, id: 'prompt', kind: 'action', loc: 1100 },
        ],
        endT: 1000,
        final: { totalLoc: 1100, upgrades: [], launched: false },
      },
      'col',
    );
    const kinds = rows.map((r) => (r.kind === 'move' ? r.moveId : r.kind));
    expect(kinds).toContain('gen');
    expect(kinds).not.toContain('buy_gen:autocomplete');
    expect(kinds).toContain('prompt');
  });
});

describe('formatBucketCounts', () => {
  it('orders basic ids consistently', () => {
    expect(formatBasicActionCounts({ kick_agent: 1, prompt: 10 })).toBe('prompt 10, kick_agent 1');
  });

  it('orders test ids consistently', () => {
    expect(formatTestActionCounts({ run_tests: 2, write_test: 1 })).toBe(
      'write_test 1, run_tests 2',
    );
  });
});
