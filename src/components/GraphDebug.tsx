import { debugHref } from '../debug/routes';
import { UPGRADES } from '../game/data';
import { DebugSection, DebugShell } from './DebugShell';

function fmtLoc(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function GraphDebug() {
  const upgrades = [...UPGRADES].sort((a, b) => a.unlockAt - b.unlockAt);
  const byId = new Map(upgrades.map((u) => [u.id, u]));
  const roots = upgrades.filter((u) => !u.requires?.length);

  return (
    <DebugShell active="graph">
      <p className="debug-prose mb-6 text-[12px]">
        Static <code className="debug-code">requires:</code> edges from{' '}
        <code className="debug-code">upgrades.yaml</code>. Unlock LOC is shop visibility, not
        purchase order — compare with{' '}
        <a href={debugHref('trace')} className="text-blue underline">
          bot trace
        </a>{' '}
        for real purchase timing.
      </p>

      <DebugSection title="Trees">
        <ul className="space-y-4">
          {roots.map((root) => (
            <li key={root.id}>
              <UpgradeNode id={root.id} byId={byId} depth={0} seen={new Set()} />
            </li>
          ))}
        </ul>
      </DebugSection>

      <DebugSection title="All edges">
        <div className="debug-table-wrap min-w-[480px]">
          <table className="debug-table text-[12px]">
            <thead>
              <tr>
                <th>from</th>
                <th>→</th>
                <th>unlockAt</th>
              </tr>
            </thead>
            <tbody>
              {upgrades.flatMap((u) =>
                (u.requires ?? []).map((req) => (
                  <tr key={`${req}-${u.id}`}>
                    <td className="text-purple">{req}</td>
                    <td className="cell-id">{u.id}</td>
                    <td className="cell-loc">{fmtLoc(u.unlockAt)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </DebugSection>
    </DebugShell>
  );
}

function UpgradeNode({
  id,
  byId,
  depth,
  seen,
}: {
  id: string;
  byId: Map<string, (typeof UPGRADES)[number]>;
  depth: number;
  seen: Set<string>;
}) {
  const u = byId.get(id);
  if (!u) return <span className="text-log-bad">{id}?</span>;
  if (seen.has(id)) {
    return <span className="text-yellow">{id} (cycle)</span>;
  }
  seen.add(id);
  const children = [...byId.values()].filter((x) => x.requires?.includes(id));
  const notes: string[] = [];
  if (u.requiresLaunch) notes.push('launch');
  if (u.flags?.length) notes.push(u.flags.join(','));

  return (
    <div style={{ marginLeft: depth * 14 }}>
      <div>
        <span className="debug-tree-id">{id}</span>
        <span className="cell-loc ml-2">@ {fmtLoc(u.unlockAt)} LOC</span>
        {notes.length > 0 && <span className="text-dim ml-2">({notes.join(' · ')})</span>}
      </div>
      {children.length > 0 && (
        <ul className="debug-tree-edge mt-1 pl-2">
          {children.map((c) => (
            <li key={c.id} className="mt-0.5">
              <UpgradeNode id={c.id} byId={byId} depth={depth + 1} seen={seen} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
