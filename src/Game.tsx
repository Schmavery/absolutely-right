import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from './types';
import { SAVE_INTERVAL_MS, TICK_MS } from './game/constants';
import { MILESTONES, UI } from './game/data';
import { deriveGame } from './game/derive';
import { getPhase } from './game/phases';
import { clearSave, defaultState, initState, saveState } from './game/state';
import {
  getStoredSaveRevision,
  isSaveEditorTabOpen,
  isSaveStorageKey,
} from './game/saveSync';
import { tickReducer } from './game/tick';
import { appendLog } from './game/log';
import { getMove, rechargeProgress } from './game/availability';
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
  writeTestAction,
} from './game/actions';
import { mcpAllowAction, mcpDenyAction } from './game/mcpApproval';
import { computeQueuedUserEntries } from './lib/queuedUserLog';
import { isLogEntryFullyDisplayed, useStreamingLog } from './lib/useStreamingLog';
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
const FIRST_MILESTONE_LOC = MILESTONES[0]?.loc ?? 10;

export function Game() {
  const isMobile = useIsMobile();

  const [state, setState] = useState<GameState>(initState);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const persistedRevRef = useRef(getStoredSaveRevision());

  const { displayLog, showThinking, isAnimating, spinTick, reset: resetStream } =
    useStreamingLog(state.log, state.logId);

  // Game tick.
  useEffect(() => {
    const id = setInterval(() => setState(tickReducer), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Auto-save (paused while /debug/save tab is open — see saveSync).
  useEffect(() => {
    const id = setInterval(() => {
      if (isSaveEditorTabOpen()) return;
      persistedRevRef.current = saveState(stateRef.current);
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Another tab wrote the save (e.g. save editor Apply) — reload without refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!isSaveStorageKey(e.key)) return;
      const rev = getStoredSaveRevision();
      if (rev <= persistedRevRef.current) return;
      persistedRevRef.current = rev;
      setState(initState());
      resetStream();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [resetStream]);

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
      runTests: dispatch(runTestsAction),
      runBugBounty: dispatch(bugBountyAction),
      launch: dispatch(launchAction),
      mcpAllow: dispatch(mcpAllowAction),
      mcpDeny: dispatch(mcpDenyAction),
      newFreeAccount: dispatch(newFreeAccountAction),
      writeTest: dispatch(writeTestAction),
      buyGen: dispatch(buyGenAction),
      buyUpgrade: dispatch(buyUpgradeAction),
    }),
    [dispatch],
  );

  const handleResetConfirm = useCallback(() => {
    clearSave();
    persistedRevRef.current = 0;
    setState(defaultState());
    resetStream();
  }, [resetStream]);

  // ── derived ──
  const derived = deriveGame(state);
  const phase = getPhase(state);
  const showLog = state.log.length >= 1;
  const { showGenSection, showUpgSection } = derived.ui;

  const queuedUserEntries = useMemo(
    () => computeQueuedUserEntries(state.log, displayLog, isAnimating),
    [displayLog, state.log, isAnimating],
  );

  const postStartupUi = useMemo(() => {
    if (!state.milestonesSeen.includes(FIRST_MILESTONE_LOC)) return false;
    const entry = state.log.find((e) => e.type === 'milestone');
    if (!entry) return false;
    return isLogEntryFullyDisplayed(entry.id, state.log, displayLog);
  }, [state.log, state.milestonesSeen, displayLog]);

  const promptLabel = !postStartupUi
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

          {(() => {
            const t = Date.now();
            const promptMove = getMove(state, 'prompt', t)!;
            const waiting = isAnimating || !promptMove.legal;
            const onCooldown = !promptMove.legal && !isAnimating;
            return (
              <Button
                variant="primary"
                off={waiting}
                onClick={waiting ? undefined : handlers.prompt}
                progress={onCooldown ? rechargeProgress(promptMove) : undefined}
                progressEaseMs={TICK_MS}
                progressClassName="bg-green/10"
              >
                {promptLabel}
              </Button>
            );
          })()}

          <ActionBar
            state={state}
            onPasteError={handlers.pasteError}
            onWriteTest={handlers.writeTest}
            onKickAgent={handlers.kickAgent}
            onRunTests={handlers.runTests}
            onClearContext={handlers.clearContext}
            onLaunch={handlers.launch}
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
            mcpApprovalMessage={state.mcpApprovalPending}
            onMcpAllow={handlers.mcpAllow}
            onMcpDeny={handlers.mcpDeny}
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
