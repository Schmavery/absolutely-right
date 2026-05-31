import { useMemo } from 'react';
import { DEBUG_BOTS, type DebugBotId } from '../sim/bots';
import { binPurchaseTimes, fmtLoc, fmtTime, heatmapBinCount } from '../debug/traceAnalyze';
import {
  CHAPTER_STYLES,
  SORTED_UPGRADES,
  chapterStyle,
  flavorSubtitle,
  upgradeChapter,
  upgradeHoverTitle,
} from '../debug/upgradeMeta';
import { heatmapFill } from './debugUi';

export function UpgradeHeatmap({
  heatmap,
  budgetMs,
  botIds,
}: {
  heatmap: Map<string, { botId: DebugBotId; t: number; loc: number }[]>;
  budgetMs: number;
  botIds: DebugBotId[];
}) {
  const bins = heatmapBinCount(budgetMs);
  const timeBins = useMemo(() => binPurchaseTimes([], budgetMs, bins), [budgetMs, bins]);

  type HeatmapRow = { type: 'header'; chapter: number } | { type: 'upgrade'; id: string };

  const rows = useMemo(() => {
    const byChapter = new Map<number, string[]>();
    for (const u of SORTED_UPGRADES) {
      if ((heatmap.get(u.id) ?? []).length === 0) continue;
      const ch = upgradeChapter(u);
      const ids = byChapter.get(ch) ?? [];
      ids.push(u.id);
      byChapter.set(ch, ids);
    }
    const out: HeatmapRow[] = [];
    for (const ch of CHAPTER_STYLES) {
      const ids = byChapter.get(ch.index);
      if (!ids?.length) continue;
      out.push({ type: 'header', chapter: ch.index });
      for (const id of ids) out.push({ type: 'upgrade', id });
    }
    return out;
  }, [heatmap]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-[10px]">
        {CHAPTER_STYLES.map((ch) => (
          <span key={ch.index} className={`px-1.5 py-0.5 rounded border ${ch.chip}`}>
            {ch.index}: {ch.label}
          </span>
        ))}
      </div>
      <p className="debug-prose text-[11px]">
        Rows grouped by mechanical chapter (see{' '}
        <code className="debug-code">data/PHASES.md</code>). Hover cells for which bot bought and when.
        Shop unlock LOC is when the upgrade appears; purchase can be later.
      </p>
      <div className="debug-table-wrap min-w-[720px]">
        <table className="debug-table text-[11px]">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-[2] min-w-[140px]"
                style={{ background: 'var(--debug-surface-2)' }}
              >
                upgrade
              </th>
              {timeBins.map((b, i) => (
                <th key={i} className="p-1 font-normal whitespace-nowrap text-center">
                  {b.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.type === 'header') {
                const style = chapterStyle(row.chapter);
                return (
                  <tr key={`ch-${row.chapter}`}>
                    <td
                      colSpan={timeBins.length + 1}
                      className={`py-1.5 px-2 text-[10px] uppercase tracking-wider border-l-4 ${style.rowBorder} ${style.chip}`}
                    >
                      {style.label} · mood: “{flavorSubtitle(row.chapter)}”
                    </td>
                  </tr>
                );
              }

              const u = SORTED_UPGRADES.find((x) => x.id === row.id)!;
              const chapter = upgradeChapter(u);
              const style = chapterStyle(chapter);
              const purchases = heatmap.get(u.id) ?? [];
              const rowTitle = upgradeHoverTitle(u);
              const rowBins = binPurchaseTimes(
                purchases.map((p) => p.t),
                budgetMs,
                bins,
              );
              const max = Math.max(1, ...rowBins.map((b) => b.count));

              return (
                <tr key={u.id} className={`border-l-4 ${style.rowBorder}`}>
                  <td
                    className="sticky left-0 z-[1] align-middle py-1 pr-2"
                    style={{ background: 'var(--debug-surface)' }}
                    title={rowTitle}
                  >
                    <div className="font-medium text-green leading-tight">{u.name}</div>
                    <div className="text-dim text-[10px] leading-tight">{u.id}</div>
                  </td>
                  {rowBins.map((b, i) => {
                    const inBin = purchases.filter(
                      (p) => p.t >= b.startMs && p.t < b.endMs,
                    );
                    const tooltip =
                      inBin.length > 0
                        ? inBin
                            .map(
                              (p) =>
                                `${DEBUG_BOTS[p.botId]?.label ?? p.botId} @ ${fmtTime(p.t)} (${fmtLoc(p.loc)} LOC)`,
                            )
                            .join('\n')
                        : undefined;
                    return (
                      <td
                        key={i}
                        className={`p-1 text-center tabular-nums align-middle ${inBin.length > 0 ? 'text-blue font-medium' : 'text-dim'}`}
                        style={{ backgroundColor: heatmapFill(inBin.length, max) }}
                        title={tooltip}
                      >
                        {inBin.length > 0 ? inBin.length : '·'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="debug-prose text-[10px]">
        Compared bots: {botIds.map((id) => DEBUG_BOTS[id]?.label ?? id).join(', ')}. Cell count = purchases
        in that hour bin (same sim seed).
      </p>
    </div>
  );
}
