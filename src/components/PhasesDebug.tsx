import { GENS, UI, UPGRADES, action } from '../game/data';
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
    bugStrategy: 'Tests, lint, CI (CI unlock late today)',
    status: 'Launch early; CI needs retune',
  },
  {
    id: 'mid',
    title: 'Mid — tools & approvals',
    bugStrategy: 'Approve/deny tool calls; then Always → YOLO upgrade',
    status: 'Not shipped (MCP); YOLO still a button',
  },
  {
    id: 'min-late',
    title: 'Min–late — review crises',
    bugStrategy: 'Human review slows; AI review speeds + bugs',
    status: 'Upgrades exist; unlocks early vs target',
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
  if (u.bugMult != null) bits.push(`bug×${u.bugMult}`);
  if (u.reviewBugMult != null) bits.push(`review bug×${u.reviewBugMult}`);
  if (u.reviewLocMult != null) bits.push(`review loc×${u.reviewLocMult}`);
  if (u.ninesFloor != null) bits.push(`nines floor ${u.ninesFloor}`);
  return bits;
}

/** UI gates that are not in YAML — shown for action visibility. */
const ACTION_GATES: Record<string, string> = {
  prompt: 'always (chat busy may block)',
  kick_agent: `≥ ${THRESHOLDS.showKickAgentClicks} prompts`,
  paste_error: `≥ ${THRESHOLDS.showPasteErrorBugs} bugs`,
  yolo_merge: `launched & ≥ ${fmtLoc(THRESHOLDS.showYoloMergeLoc)} LOC`,
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
    'yolo_merge',
    'bug_bounty',
  ] as const;

  return (
    <div className="min-h-screen bg-bg text-fg font-mono text-[13px] leading-relaxed p-6 max-w-[1100px] mx-auto">
      <h1 className="text-title text-[18px] mb-1 tracking-wide">&gt; phase map (debug)</h1>
      <p className="text-dimmer mb-6">
        Built from shipped YAML + constants. Target story:{' '}
        <code className="text-fg-dim">data/PHASES.md</code>. Remove{' '}
        <code className="text-fg-dim">?debug=phases</code> to play.
      </p>

      <section className="mb-8">
        <h2 className="text-dimmer text-[11px] uppercase tracking-widest mb-3">Target chapters</h2>
        <div className="border border-card-border rounded overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-card-bg text-dimmer text-[11px]">
                <th className="p-2 font-normal">Chapter</th>
                <th className="p-2 font-normal">Bug strategy</th>
                <th className="p-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {TARGET_CHAPTERS.map((c) => (
                <tr key={c.id} className="border-t border-card-border">
                  <td className="p-2">{c.title}</td>
                  <td className="p-2 text-dimmer">{c.bugStrategy}</td>
                  <td className="p-2 text-dimmer">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-dimmer text-[11px] uppercase tracking-widest mb-3">
          Flavor phases (ui.yaml)
        </h2>
        <ul className="space-y-2">
          {flavorRows.map((r) => (
            <li key={r.i}>
              <span className="text-dimmer">[{r.i}] when: {r.rule}</span>
              <br />
              {r.label}
              {r.activeOnFreshSave && (
                <span className="text-green-dim text-[12px]"> · current on new game</span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-dimmer mt-2 text-[12px]">
          Launch at {fmtLoc(LAUNCH_LOC)} LOC · upgrade shop ~{' '}
          {fmtLoc(THRESHOLDS.showUpgradesLoc)} · generators ~{' '}
          {fmtLoc(THRESHOLDS.showGeneratorsLoc)}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-dimmer text-[11px] uppercase tracking-widest mb-3">
          Generators (unlockAt)
        </h2>
        <div className="border border-card-border rounded overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[520px]">
            <thead>
              <tr className="bg-card-bg text-dimmer text-[11px]">
                <th className="p-2">LOC</th>
                <th className="p-2">id</th>
                <th className="p-2">name</th>
                <th className="p-2">bugs/s</th>
              </tr>
            </thead>
            <tbody>
              {gens.map((g) => (
                <tr key={g.id} className="border-t border-card-border">
                  <td className="p-2 text-dimmer whitespace-nowrap">{fmtLoc(g.unlockAt)}</td>
                  <td className="p-2">{g.id}</td>
                  <td className="p-2">{g.name}</td>
                  <td className="p-2 text-dimmer">{g.bugsPerSec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-dimmer text-[11px] uppercase tracking-widest mb-3">
          Upgrades (unlockAt)
        </h2>
        <div className="border border-card-border rounded overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-card-bg text-dimmer text-[11px]">
                <th className="p-2">LOC</th>
                <th className="p-2">id</th>
                <th className="p-2">notes</th>
              </tr>
            </thead>
            <tbody>
              {upgrades.map((u) => (
                <tr key={u.id} className="border-t border-card-border">
                  <td className="p-2 text-dimmer whitespace-nowrap">{fmtLoc(u.unlockAt)}</td>
                  <td className="p-2">{u.id}</td>
                  <td className="p-2 text-dimmer text-[12px]">
                    {upgradeNotes(u).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-dimmer text-[11px] uppercase tracking-widest mb-3">Actions</h2>
        <div className="border border-card-border rounded overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[520px]">
            <thead>
              <tr className="bg-card-bg text-dimmer text-[11px]">
                <th className="p-2">id</th>
                <th className="p-2">tokens</th>
                <th className="p-2">visibility</th>
              </tr>
            </thead>
            <tbody>
              {actionIds.map((id) => {
                const a = action(id);
                const gate = ACTION_GATES[id] ?? '—';
                return (
                  <tr key={id} className="border-t border-card-border">
                    <td className="p-2">{id}</td>
                    <td className="p-2 text-dimmer">{a.tokenCost ?? '—'}</td>
                    <td className="p-2 text-dimmer text-[12px]">{gate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-dimmer mt-2 text-[12px]">
          Derived UI at fresh save: money={String(baseUi.showMoney)}, uptime=
          {String(baseUi.showUptime)}, nines={String(baseUi.ninesTracking)}
        </p>
      </section>
    </div>
  );
}
