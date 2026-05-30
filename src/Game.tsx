import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from './types';
import { LOC_PER_CLICK_POWER, SAVE_INTERVAL_MS, TICK_MS } from './game/constants';
import { action, UI } from './game/data';
import { deriveGame } from './game/derive';
import { calcClickBonus, calcClickPower, getPhase } from './game/rates';
import { clearSave, defaultState, initState, saveState } from './game/state';
import { tickReducer } from './game/tick';
import { appendLog } from './game/log';
import {
  buyGenAction,
  buyUpgradeAction,
  clearContextAction,
  kickAgentAction,
  launchAction,
  newFreeAccountAction,
  pasteErrorAction,
  promptAction,
  runTestsAction,
  bugBountyAction,
  yoloMergeAction,
  writeTestAction,
} from './game/actions';
import { useStreamingLog } from './lib/useStreamingLog';
import { useIsMobile } from './lib/useWindowWidth';
import { Button } from './components/Button';
import { ResourcePanel } from './components/ResourcePanel';
import { ActionBar } from './components/ActionBar';
import { Generators } from './components/Generators';
import { Upgrades, InstalledList } from './components/Upgrades';
import { ConversationLog } from './components/ConversationLog';
import { Settings } from './components/Settings';

const PHASES = UI.phases;

export function Game() {
  const isMobile = useIsMobile();

  const [state, setState] = useState<GameState>(initState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { displayLog, isStreaming, spinTick, reset: resetStream } = useStreamingLog(
    state.log,
    state.logId,
  );

  // Game tick.
  useEffect(() => {
    const id = setInterval(() => setState(tickReducer), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Auto-save.
  useEffect(() => {
    const id = setInterval(() => saveState(stateRef.current), SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Wrap each pure action in a setState. The argument signature ensures
  // accidentally calling an action with stale state is impossible.
  const dispatch = useCallback(
    <Args extends unknown[]>(fn: (s: GameState, ...args: Args) => GameState) =>
      (...args: Args) =>
        setState((prev) => fn(prev, ...args)),
    [],
  );

  const handlers = useMemo(
    () => ({
      prompt: dispatch(promptAction),
      kickAgent: dispatch(kickAgentAction),
      pasteError: dispatch(pasteErrorAction),
      clearContext: dispatch(clearContextAction),
      yoloMerge: dispatch(yoloMergeAction),
      runTests: dispatch(runTestsAction),
      runBugBounty: dispatch(bugBountyAction),
      launch: dispatch(launchAction),
      newFreeAccount: dispatch(newFreeAccountAction),
      writeTest: dispatch(writeTestAction),
      buyGen: dispatch(buyGenAction),
      buyUpgrade: dispatch(buyUpgradeAction),
    }),
    [dispatch],
  );

  const handleReset = useCallback(() => {
    if (window.confirm('rewrite from scratch?\n\n(resets all progress)')) {
      clearSave();
      setState(defaultState());
      resetStream();
    }
  }, [resetStream]);

  // ── derived ──
  const derived = deriveGame(state);
  const phase = getPhase(state.totalLoc);
  const showLog = state.log.length >= 1;
  const { showGenSection, showUpgSection } = derived.ui;

  // The queue panel only shows the *very next* pending entry, and only if
  // it's a user line. Multi-turn events (e.g. `> X / AI / > Y / AI`) drop
  // several user entries into the log at once, but the back-and-forth is
  // inherently sequential — follow-up `>` lines should appear inline as
  // the conversation unfolds, not stack up in the queue as if the player
  // typed them ahead.
  //
  // An entry is "displayed" only once its streamed text matches the source
  // text, so an AI line that's mid-stream still blocks the queue (rather
  // than letting the next user line pop in behind it).
  const queuedUserEntries = useMemo(() => {
    const srcById = new Map(state.log.map((e) => [e.id, e]));
    const completedIds = new Set<number>();
    for (const d of displayLog) {
      const src = srcById.get(d.id);
      if (src && d.text === src.text) completedIds.add(d.id);
    }
    const next = state.log.find((e) => !completedIds.has(e.id));
    return next?.type === 'user' ? [next] : [];
  }, [displayLog, state.log]);

  const promptLabel =
    state.totalClicks === 0
      ? 'build me a startup'
      : state.totalClicks < 20
        ? 'prompt the AI'
        : 'keep going';

  return (
    <div
      className={[
        'h-screen overflow-hidden bg-bg text-fg font-mono text-[14px] leading-[1.65] flex flex-col relative',
        isMobile ? 'px-[14px] pt-[14px] pb-0' : 'px-6 pt-7 pb-0',
      ].join(' ')}
    >
      <Settings />

      {isMobile && (
        <div className="flex-shrink-0 mb-2">
          <div className="text-title mb-[2px] tracking-[0.04em]">&gt; absolutely right</div>
          <div className="text-dimmer text-[12px]">{PHASES[phase]}</div>
        </div>
      )}

      <div
        className={
          isMobile
            ? 'w-full flex-1 min-h-0 flex flex-col overflow-hidden'
            : 'max-w-[940px] w-full mx-auto flex-1 min-h-0 grid grid-rows-[1fr] gap-10 overflow-hidden ' +
              (showLog ? 'grid-cols-[420px_1fr]' : 'grid-cols-[420px]')
        }
      >
        {/* ── Left ── */}
        <div
          className={
            isMobile
              ? 'overflow-y-auto flex-1 min-h-0 pb-6'
              : 'overflow-y-auto min-w-0 h-full pb-6'
          }
        >
          {!isMobile && (
            <>
              <div className="text-title mb-[2px] tracking-[0.04em]">&gt; absolutely right</div>
              <div className="text-dimmer text-[12px] mb-6">{PHASES[phase]}</div>
            </>
          )}

          <Button variant="primary" onClick={handlers.prompt}>
            {promptLabel}
          </Button>
          {state.totalClicks > 0 && (
            <span className="text-dimmer text-[11px]">
              +
              {(
                calcClickPower(state.upgrades) * LOC_PER_CLICK_POWER +
                calcClickBonus(state.upgrades)
              ).toFixed(0)}{' '}
              loc · {action('prompt').tokenCost}t
            </span>
          )}

          <ActionBar
            state={state}
            onPasteError={handlers.pasteError}
            onWriteTest={handlers.writeTest}
            onKickAgent={handlers.kickAgent}
            onRunTests={handlers.runTests}
            onClearContext={handlers.clearContext}
            onLaunch={handlers.launch}
            onYoloMerge={handlers.yoloMerge}
            onRunBugBounty={handlers.runBugBounty}
          />

          {state.started && <ResourcePanel state={state} />}

          {showGenSection && (
            <Generators
              state={state}
              onBuyGen={handlers.buyGen}
              onNewFreeAccount={handlers.newFreeAccount}
            />
          )}

          {showUpgSection && <Upgrades state={state} onBuyUpgrade={handlers.buyUpgrade} />}

          <InstalledList ids={state.upgrades} />

          {state.totalLoc > 0 && (
            <div className="mt-11 pt-[14px] border-t border-border">
              <Button variant="subtle" onClick={handleReset}>
                rewrite from scratch
              </Button>
            </div>
          )}
        </div>

        {/* ── Right (or top, on mobile) ── */}
        {showLog && (
          <ConversationLog
            displayLog={displayLog}
            queuedUserEntries={queuedUserEntries}
            isStreaming={isStreaming}
            spinTick={spinTick}
            isMobile={isMobile}
          />
        )}
      </div>

      <div className="py-3 text-center text-footer text-[11px] italic flex-shrink-0">
        built with irony using cursor
      </div>
    </div>
  );
}

// Keep `appendLog` exported via the module so test suites / consoles can reach it.
export { appendLog };
