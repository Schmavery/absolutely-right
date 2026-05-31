import { useCallback, useMemo, useState, useEffect } from 'react';
import { getStoredSaveRevision } from '../game/saveSync';
import { useSaveDiskWatch } from '../debug/useSaveDiskWatch';
import { useSaveEditorPulse } from '../debug/useSaveEditorPulse';
import { LAUNCH_LOC, SAVE_KEY } from '../game/constants';
import { UPGRADES, UI } from '../game/data';
import { deriveGame } from '../game/derive';
import { getPhase } from '../game/phases';
import { clearSave } from '../game/state';
import { fmtLoc } from '../debug/traceAnalyze';
import {
  SAVE_PRESETS,
  applyPreset,
  finalizeSaveState,
  loadEditableSave,
  parseSaveJson,
  persistSave,
  serializeSaveJson,
  revealAllEligibleUpgrades,
  sanitizeUpgrades,
  saveSummary,
} from '../debug/saveTools';
import type { GameState } from '../types';
import { DebugSection, DebugShell } from './DebugShell';

const NUM_FIELDS: {
  key: keyof GameState;
  label: string;
  step?: number;
  min?: number;
}[] = [
  { key: 'loc', label: 'LOC (spendable)' },
  { key: 'totalLoc', label: 'totalLoc (lifetime)' },
  { key: 'tokens', label: 'tokens' },
  { key: 'bugs', label: 'bugs' },
  { key: 'lifetimeBugs', label: 'lifetimeBugs' },
  { key: 'tests', label: 'tests' },
  { key: 'hype', label: 'hype' },
  { key: 'money', label: 'money' },
  { key: 'nines', label: 'nines', step: 0.01 },
  { key: 'totalClicks', label: 'prompts (totalClicks)' },
  { key: 'freeAccounts', label: 'free accounts', min: 1 },
];

function inputClass() {
  return 'debug-input rounded px-2 py-1.5 bg-[var(--debug-surface-2)] border border-[var(--debug-border)] tabular-nums w-full max-w-[200px]';
}

function btnClass(primary = false) {
  return primary
    ? 'rounded px-3 py-1.5 border border-[var(--blue)] bg-[color-mix(in_srgb,var(--blue)_18%,var(--debug-surface))] text-[var(--blue)] hover:opacity-90'
    : 'rounded px-3 py-1.5 border border-[var(--debug-border)] text-[var(--debug-body)] hover:border-[var(--blue)]';
}

export function SaveDebug() {
  useSaveEditorPulse();

  const [baselineRev, setBaselineRev] = useState(() => getStoredSaveRevision());
  const { diskRev, diskSource, diskAhead } = useSaveDiskWatch(baselineRev);

  const [state, setState] = useState<GameState>(() => loadEditableSave());
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setStatus(
      'Editor works on an in-memory copy. While this tab is open, the game tab pauses auto-save. Apply pushes to disk; the game tab reloads the save automatically.',
    );
  }, []);

  const derived = useMemo(() => deriveGame(state), [state]);
  const summary = useMemo(() => saveSummary(state), [state]);
  const flavor = UI.phases[getPhase(state)] ?? '—';

  const setNum = useCallback((key: keyof GameState, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setState((s) => ({ ...s, [key]: n }));
  }, []);

  const toggleFlag = useCallback((key: 'started' | 'launched') => {
    setState((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  const toggleUpgrade = useCallback((id: string) => {
    setState((s) => {
      const owned = s.upgrades.includes(id);
      const upgrades = owned ? s.upgrades.filter((x) => x !== id) : [...s.upgrades, id];
      return revealAllEligibleUpgrades({ ...s, upgrades: sanitizeUpgrades(upgrades) });
    });
  }, []);

  const reloadFromDisk = useCallback(() => {
    setState(loadEditableSave());
    setBaselineRev(getStoredSaveRevision());
    setJsonText('');
    setJsonError(null);
    setStatus('Reloaded from localStorage into the editor (disk is now your baseline).');
  }, []);

  const writeToDisk = useCallback(() => {
    if (diskAhead) {
      const ok = window.confirm(
        `The game tab saved newer data (revision ${diskRev}, yours is ${baselineRev}). Overwrite with this editor state?`,
      );
      if (!ok) return;
    }
    const rev = persistSave(finalizeSaveState(state));
    setBaselineRev(rev);
    setStatus(
      `Applied to localStorage (${SAVE_KEY}, rev ${rev}). A game tab on this origin should pick it up automatically.`,
    );
  }, [state, diskAhead, diskRev, baselineRev]);

  const runPreset = useCallback((presetId: string) => {
    const next = applyPreset(presetId, state);
    if (!next) return;
    setState(next);
    setStatus(`Applied preset “${SAVE_PRESETS.find((p) => p.id === presetId)?.label ?? presetId}”.`);
  }, [state]);

  const exportJson = useCallback(() => {
    setJsonText(serializeSaveJson(state));
    setJsonError(null);
    setStatus('Exported current editor state to JSON box.');
  }, [state]);

  const copyState = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(serializeSaveJson(state));
      setStatus('Copied editor state to clipboard (paste into an agent or Import JSON).');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Clipboard unavailable';
      setStatus(`Copy failed: ${msg}`);
    }
  }, [state]);

  const importJson = useCallback(() => {
    const result = parseSaveJson(jsonText);
    if (!result.ok) {
      setJsonError(result.error);
      return;
    }
    setState(revealAllEligibleUpgrades(result.state));
    setJsonError(null);
    setStatus('Imported JSON into editor (not written to disk until you Apply).');
  }, [jsonText]);

  const wipeSave = useCallback(() => {
    if (
      !window.confirm(
        'Clear the on-disk save? A running game tab will keep its in-memory state until you reset or reload from disk.',
      )
    ) {
      return;
    }
    clearSave();
    const rev = getStoredSaveRevision();
    setBaselineRev(rev);
    setState(loadEditableSave());
    setStatus('Cleared localStorage save; editor shows fresh default.');
  }, []);

  return (
    <DebugShell active="save">
      <p className="debug-prose mb-4 max-w-[720px]">
        Edit a copy of the save for this origin (
        <code className="debug-code">{SAVE_KEY}</code>
        ). With a game tab open, auto-save there is paused while this page is open. Use Apply to
        save to push changes; the game tab reloads from disk when you apply. Dev-only.
      </p>

      {diskAhead && (
        <div className="debug-error mb-4 text-[12px]" role="alert">
          <p className="mb-2">
            Disk is ahead of your editor baseline (disk rev {diskRev}, baseline {baselineRev}
            {diskSource === 'game' ? ', last write from game tab' : ''}). Reload from disk before
            editing, or confirm when applying to overwrite.
          </p>
          <button type="button" className={btnClass()} onClick={reloadFromDisk}>
            Reload from disk
          </button>
        </div>
      )}

      {status && (
        <p className="debug-stream mb-4 text-[12px]" role="status">
          {status}
        </p>
      )}

      <DebugSection title="Current snapshot">
        <div className="debug-panel p-4 grid gap-2 sm:grid-cols-2 text-[12px]">
          <div>
            <span className="text-[var(--debug-muted)]">Flavor phase </span>
            <span className="debug-value">
              {summary.phaseLabel} — {flavor}
            </span>
          </div>
          <div>
            <span className="text-[var(--debug-muted)]">LOC </span>
            <span className="debug-value">
              {fmtLoc(state.loc)} / launch ≥ {fmtLoc(LAUNCH_LOC)}
            </span>
          </div>
          <div>
            <span className="text-[var(--debug-muted)]">Upgrades </span>
            <span className="debug-value">
              {summary.upgradeCount} owned · {summary.unlockedCount} unlocked in shop
            </span>
          </div>
          <div>
            <span className="text-[var(--debug-muted)]">UI </span>
            <span className="debug-value">
              gens {derived.ui.showGenSection ? 'on' : 'off'} · upgs{' '}
              {derived.ui.showUpgSection ? 'on' : 'off'}
              {state.launched ? ' · launched' : ''}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            className={btnClass()}
            onClick={() => void copyState()}
            title="Copy full save JSON to clipboard"
          >
            Copy state
          </button>
          <button type="button" className={btnClass()} onClick={reloadFromDisk}>
            Reload from disk
          </button>
          <button
            type="button"
            className={btnClass(true)}
            onClick={writeToDisk}
            title={
              diskAhead
                ? 'Disk has newer data — you will be asked to confirm'
                : 'Write editor state to localStorage'
            }
          >
            Apply to save{diskAhead ? ' (overwrite?)' : ''}
          </button>
          <button type="button" className={btnClass()} onClick={wipeSave}>
            Clear save
          </button>
        </div>
      </DebugSection>

      <DebugSection title="Fast-forward presets">
        <p className="debug-prose text-[12px] mb-3 max-w-[640px]">
          Snap progression to a chapter band. Presets replace core progression fields (LOC,
          upgrades, launch) but keep your editor session until you Apply.
        </p>
        <div className="flex flex-wrap gap-2">
          {SAVE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={btnClass()}
              title={p.hint}
              onClick={() => runPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </DebugSection>

      <DebugSection title="Scalars">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NUM_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-[12px]">
              <span className="text-[var(--debug-muted)]">{f.label}</span>
              <input
                type="number"
                className={inputClass()}
                step={f.step ?? 1}
                min={f.min}
                value={Number(state[f.key] ?? 0)}
                onChange={(e) => setNum(f.key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-[12px]">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.started}
              onChange={() => toggleFlag('started')}
            />
            started
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.launched}
              onChange={() => toggleFlag('launched')}
            />
            launched
          </label>
          <button
            type="button"
            className={btnClass()}
            onClick={() => setState((s) => revealAllEligibleUpgrades(s))}
          >
            Reveal eligible upgrades
          </button>
          <button
            type="button"
            className={btnClass()}
            onClick={() => setState((s) => finalizeSaveState(s))}
            title="Set milestonesSeen from totalLoc; add first milestone log if log is empty"
          >
            Sync milestones
          </button>
        </div>
      </DebugSection>

      <DebugSection title="Owned upgrades">
        <div className="debug-table-wrap max-h-[360px] overflow-y-auto">
          <table className="debug-table text-[12px]">
            <thead>
              <tr>
                <th>Own</th>
                <th>id</th>
                <th>name</th>
                <th>unlockAt</th>
              </tr>
            </thead>
            <tbody>
              {[...UPGRADES]
                .sort((a, b) => a.unlockAt - b.unlockAt)
                .map((u) => (
                  <tr key={u.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={state.upgrades.includes(u.id)}
                        onChange={() => toggleUpgrade(u.id)}
                      />
                    </td>
                    <td className="cell-id">{u.id}</td>
                    <td>{u.name}</td>
                    <td className="cell-loc">{fmtLoc(u.unlockAt)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </DebugSection>

      <DebugSection title="Raw JSON">
        <div className="flex flex-wrap gap-2 mb-2">
          <button type="button" className={btnClass()} onClick={() => void copyState()}>
            Copy state
          </button>
          <button type="button" className={btnClass()} onClick={exportJson}>
            Export editor → JSON
          </button>
          <button type="button" className={btnClass()} onClick={importJson}>
            Import JSON → editor
          </button>
        </div>
        {jsonError && <p className="debug-error mb-2 text-[12px]">{jsonError}</p>}
        <textarea
          className="debug-input w-full min-h-[200px] rounded p-3 font-mono text-[11px] bg-[var(--debug-surface-2)] border border-[var(--debug-border)]"
          placeholder="Paste full save JSON…"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          spellCheck={false}
        />
      </DebugSection>
    </DebugShell>
  );
}
