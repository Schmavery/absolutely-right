import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from './types';
import { LOC_PER_CLICK_POWER, SAVE_INTERVAL_MS, TICK_MS } from './game/constants';
import { action, UI } from './game/data';
import { deriveGame } from './game/derive';
import { calcClickBonus, calcClickPower } from './game/rates';
import { getPhase } from './game/phases';
import { clearSave, defaultState, initState, saveState } from './game/state';
import { tickReducer } from './game/tick';
import { appendLog } from './game/log';
import { isChatBusy } from './game/availability';
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
import { FooterBarrel } from './components/FooterBarrel';
import { ResourcePanel } from './components/ResourcePanel';
import { ActionBar } from './components/ActionBar';
import { Generators } from './components/Generators';
import { Upgrades, InstalledList } from './components/Upgrades';
import { ConversationLog } from './components/ConversationLog';
import { Settings } from './components/Settings';
import { ResetConfirmModal } from './components/ResetConfirmModal';

const PHASES = UI.phases;

export function Game() {
  const isMobile = useIsMobile();

  const [state, setState] = useState<GameState>(initState);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { displayLog, showThinking, isAnimating, spinTick, reset: resetStream } =
    useStreamingLog(state.log, state.logId);

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

  const handleResetConfirm = useCallback(() => {
    clearSave();
    setState(defaultState());
    resetStream();
  }, [resetStream]);

  // ── derived ──
  const derived = deriveGame(state);
  const phase = getPhase(state);
  const showLog = state.log.length >= 1;
  const { showGenSection, showUpgSection } = derived.ui;

  // Queue panel: next user line only when a prior entry is still streaming
  // (multi-turn `> user / AI / > user`). Idle log and user lead-in never
  // use the queue — avoids a one-frame flash when state.log leads displayLog.
  const queuedUserEntries = useMemo(() => {
    if (!isAnimating) return [];
    const srcById = new Map(state.log.map((e) => [e.id, e]));
    const isComplete = (id: number) => {
      const src = srcById.get(id);
      const d = displayLog.find((e) => e.id === id);
      return !!src && !!d && d.text === src.text;
    };
    const nextIdx = state.log.findIndex((e) => !isComplete(e.id));
    if (nextIdx < 0) return [];
    const next = state.log[nextIdx];
    if (next.type !== 'user') return [];
    // Only queue a user line when something before it is still streaming.
    const blocked = state.log.slice(0, nextIdx).some((e) => !isComplete(e.id));
    return blocked ? [next] : [];
  }, [displayLog, state.log, isAnimating]);

  const promptLabel =
    state.totalClicks === 0
      ? 'build me a startup'
      : state.totalClicks < 20
        ? 'prompt the AI'
        : 'keep going';

  return (
    <div
      className={[
        'h-screen bg-bg text-fg font-mono text-[14px] leading-[1.65] flex flex-col relative overflow-x-hidden overflow-y-visible',
        isMobile ? 'px-[14px] pt-[14px] pb-2' : 'px-6 pt-7 pb-2',
      ].join(' ')}
    >
      <Settings />

      {isMobile && (
        <div className="flex-shrink-0 mb-2">
          <div className="text-title mb-[2px] tracking-[0.04em]">&gt; extra thinking</div>
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
              <div className="text-title mb-[2px] tracking-[0.04em]">&gt; extra thinking</div>
              <div className="text-dimmer text-[12px] mb-6">{PHASES[phase]}</div>
            </>
          )}

          {/* Chat-busy gate: while the AI is mid-stream from a recent prompt
              or event, "keep going" is disabled so the player can't talk
              over it. The streaming animation itself is the progress
              indicator, so no extra bar is needed. */}
          {(() => {
            const chatBusy = isChatBusy(state, Date.now()) || isAnimating;
            return (
              <Button
                variant="primary"
                off={chatBusy}
                onClick={chatBusy ? undefined : handlers.prompt}
              >
                {promptLabel}
              </Button>
            );
          })()}
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
              <Button variant="subtle" onClick={() => setResetConfirmOpen(true)}>
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
            showThinking={showThinking}
            spinTick={spinTick}
            isMobile={isMobile}
          />
        )}
      </div>

      <FooterBarrel />

      {resetConfirmOpen && (
        <ResetConfirmModal
          onConfirm={handleResetConfirm}
          onClose={() => setResetConfirmOpen(false)}
        />
      )}
    </div>
  );
}

// Keep `appendLog` exported via the module so test suites / consoles can reach it.
export { appendLog };
