import { GENS, UI, UPGRADES, action } from '../game/data';
import { DebugSection, DebugShell } from './DebugShell';
import { LAUNCH_LOC, THRESHOLDS } from '../game/constants';
import { deriveGame } from '../game/derive';
import { PHASE_RULES, getPhase } from '../game/phases';
import { defaultState } from '../game/state';
import type { UpgDef } from '../types';

const TARGET_CHAPTERS: { id: string; title: string; bugStrategy: string; status: string }[] = [
  {
    id: 'early',
    title: 'Early — prompts & tests',
    bugStrategy: 'Paste / write / run tests',
    status: 'Mostly shipped',
  },
  {
    id: 'early-mid',
    title: 'Early mid — launch, CI, models',
    bugStrategy: 'Tests, lint, CI',
    status: 'CI post-launch; lint/TS gated on launch',
  },
  {
    id: 'mid',
    title: 'Mid — tools & approvals',
    bugStrategy: 'Approve/deny tool calls; then Always → YOLO upgrade',
    status: 'MCP approval card → tool log; yolo skips card; 5s execute spinner',
  },
  {
    id: 'min-late',
    title: 'Min–late — review crises',
    bugStrategy: 'Centaur policy → human review → review-of-review → AI review',
    status: 'Crisis shop chain in upgrades.yaml',
  },
  {
    id: 'late',
    title: 'Late — status page & nines',
    bugStrategy: 'Decouple metric; bug bounty → nines grind',
    status: 'Mostly shipped',
  },
];

function fmtLoc(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function upgradeNotes(u: UpgDef): string[] {
  const bits: string[] = [];
  if (u.requiresLaunch) bits.push('needs launch');
  if (u.requires?.length) bits.push(`req: ${u.requires.join(', ')}`);
  if (u.flags?.length) bits.push(`flags: ${u.flags.join(', ')}`);
  if (u.enablesMoney) bits.push('enables $');
  if (u.unlockMinUptimeNines != null) bits.push(`uptime nines ≥ ${u.unlockMinUptimeNines}`);
  if (u.unlockMaxUptimeNines != null) bits.push(`uptime nines ≤ ${u.unlockMaxUptimeNines}`);
  if (u.bugMult != null) bits.push(`bug×${u.bugMult}`);
  if (u.reviewBugMult != null) bits.push(`review bug×${u.reviewBugMult}`);
  if (u.reviewLocMult != null) bits.push(`review loc×${u.reviewLocMult}`);
  if (u.ninesFloor != null) bits.push(`nines floor ${u.ninesFloor}`);
  return bits;
}

/** UI gates that are not in YAML — shown for action visibility. */
const ACTION_GATES: Record<string, string> = {
  prompt: 'cooldown only (see actions.yaml)',
  kick_agent: `≥ ${THRESHOLDS.showKickAgentClicks} prompts`,
  paste_error: `lifetime bugs ≥ ${THRESHOLDS.showPasteErrorBugs}`,
  launch: `≥ ${fmtLoc(LAUNCH_LOC)} LOC, not launched`,
  bug_bounty: 'nines_tracking & bugs (not auto bounty)',
};

export function PhasesDebug() {
  const baseUi = deriveGame(defaultState()).ui;

  const fresh = defaultState();
  const flavorRows = UI.phases.map((label, i) => ({
    i,
    label,
    rule: PHASE_RULES.find((r) => r.index === i)?.rule ?? '—',
    activeOnFreshSave: getPhase(fresh) === i,
  }));

  const gens = [...GENS].sort((a, b) => a.unlockAt - b.unlockAt);
  const upgrades = [...UPGRADES].sort((a, b) => a.unlockAt - b.unlockAt);

  const actionIds = [
    'prompt',
    'kick_agent',
    'paste_error',
    'write_test',
    'run_tests',
    'clear_context',
    'launch',
    'mcp_allow',
    'mcp_always_allow',
    'mcp_deny',
    'bug_bounty',
  ] as const;

  return (
    <DebugShell active="phases">
      <p className="debug-prose mb-6 text-[12px]">
        Built from shipped YAML + constants. Target story:{' '}
        <code className="debug-code">data/PHASES.md</code>.
      </p>

      <DebugSection title="Target chapters">
        <div className="debug-table-wrap">
          <table className="debug-table">
            <thead>
              <tr>
                <th>Chapter</th>
                <th>Bug strategy</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {TARGET_CHAPTERS.map((c) => (
                <tr key={c.id}>
                  <td className="text-yellow">{c.title}</td>
                  <td className="text-dim">{c.bugStrategy}</td>
                  <td className="text-purple">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DebugSection>

      <DebugSection title="Flavor phases (ui.yaml)">
        <ul className="space-y-2">
          {flavorRows.map((r) => (
            <li key={r.i}>
              <span className="text-dim">[{r.i}] when: <span className="text-blue">{r.rule}</span></span>
              <br />
              <span className="debug-value">{r.label}</span>
              {r.activeOnFreshSave && (
                <span className="debug-flavor-active text-[12px]"> · current on new game</span>
              )}
            </li>
          ))}
        </ul>
        <p className="debug-prose mt-2 text-[12px]">
          Launch at {fmtLoc(LAUNCH_LOC)} LOC · upgrade shop ~{' '}
          {fmtLoc(THRESHOLDS.showUpgradesLoc)} · generators ~{' '}
          {fmtLoc(THRESHOLDS.showGeneratorsLoc)}
        </p>
      </DebugSection>

      <DebugSection title="Generators (unlockAt)">
        <div className="debug-table-wrap min-w-[520px]">
          <table className="debug-table">
            <thead>
              <tr>
                <th>LOC</th>
                <th>id</th>
                <th>name</th>
                <th>bugs/s</th>
              </tr>
            </thead>
            <tbody>
              {gens.map((g) => (
                <tr key={g.id}>
                  <td className="cell-loc whitespace-nowrap">{fmtLoc(g.unlockAt)}</td>
                  <td className="cell-id">{g.id}</td>
                  <td>{g.name}</td>
                  <td className="text-log-bad">{g.bugsPerSec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DebugSection>

      <DebugSection title="Upgrades (unlockAt)">
        <div className="debug-table-wrap min-w-[640px]">
          <table className="debug-table">
            <thead>
              <tr>
                <th>LOC</th>
                <th>id</th>
                <th>notes</th>
              </tr>
            </thead>
            <tbody>
              {upgrades.map((u) => (
                <tr key={u.id}>
                  <td className="cell-loc whitespace-nowrap">{fmtLoc(u.unlockAt)}</td>
                  <td className="cell-id">{u.id}</td>
                  <td className="text-dim text-[12px]">
                    {upgradeNotes(u).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DebugSection>

      <DebugSection title="Actions">
        <div className="debug-table-wrap min-w-[520px]">
          <table className="debug-table">
            <thead>
              <tr>
                <th>id</th>
                <th>tokens</th>
                <th>visibility</th>
              </tr>
            </thead>
            <tbody>
              {actionIds.map((id) => {
                const a = action(id);
                const gate = ACTION_GATES[id] ?? '—';
                return (
                  <tr key={id}>
                    <td className="cell-id">{id}</td>
                    <td className="text-blue">{a.tokenCost ?? '—'}</td>
                    <td className="text-dim text-[12px]">{gate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="debug-prose mt-2 text-[12px]">
          Derived UI at fresh save: investor=<span className="text-green">{String(baseUi.showInvestor)}</span>, uptime=
          <span className="text-green">{String(baseUi.showUptime)}</span>, nines=
          <span className="text-green">{String(baseUi.ninesTracking)}</span>
        </p>
      </DebugSection>
    </DebugShell>
  );
}
