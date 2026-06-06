import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, LogEntry } from './types';
import { SAVE_INTERVAL_MS, STREAMING, TICK_MS } from './game/constants';
import { mcpExecuting } from './game/mcpApproval';
import { MILESTONES, UI, mcpToolIsSafe } from './game/data';
import { deriveGame } from './game/derive';
import { getPhase } from './game/phases';
import { advanceTick } from './game/foregroundTick';
import { loadStateWithCatchup } from './game/snapshotPlay';
import { clearSave, defaultState, saveState } from './game/state';
import {
  isSaveEditorTabOpen,
  isSaveStorageKey,
  readSaveDiskSnapshot,
  shouldFollowDiskSnapshot,
  type SaveDiskSnapshot,
} from './game/saveSync';
import {
  getOrCreateHmrWriterSessionId,
  isHmrEnabled,
  loadGameBootState,
  registerHmrGameFlush,
  stashHmrState,
} from './lib/hmrGameSession';
import { appendLog } from './game/log';
import { getMove, rechargeProgress } from './game/availability';
import {
  buyGenAction,
  buyUpgradeAction,
  clearContextAction,
  kickAgentAction,
  launchAction,
  lobstagramPostAction,
  raiseRoundAction,
  newFreeAccountAction,
  pasteErrorAction,
  promptAction,
  runTestsAction,
  bugBountyAction,
  writeTestAction,
} from './game/actions';
import { mcpAllowAction, mcpAlwaysAllowAction, mcpDenyAction } from './game/mcpApproval';
import {
  computeQueuedUserEntries,
  queuedUserEntries as getQueuedUserEntries,
  syncQueuedUserFlags,
} from './lib/queuedUserLog';
import { isLogEntryFullyDisplayed, useStreamingLog } from './lib/useStreamingLog';
import { useForegroundGame } from './lib/useForegroundGame';
import { useGameActive } from './lib/useGameActive';
import { useRevealScrollbar } from './lib/useRevealScrollbar';
import { useIsMobile } from './lib/useWindowWidth';
import { Button } from './components/Button';
import { FooterBarrel } from './components/FooterBarrel';
import { McMinis } from './components/McMinis';
import { ResourcePanel } from './components/ResourcePanel';
import { nextFundingRound, shiftMcMiniLane } from './game/investor';
import type { McMiniLane } from './game/investor';
import { ActionBar } from './components/ActionBar';
import { Generators } from './components/Generators';
import { Upgrades, InstalledList } from './components/Upgrades';
import { ConversationLog } from './components/ConversationLog';
import { Settings } from './components/Settings';
import { DebugToast } from './components/DebugToast';
import { PauseOverlay } from './components/PauseOverlay';
import { debugToast } from './lib/debugToast';
import { ResetConfirmModal } from './components/ResetConfirmModal';
import { GameTitle } from './components/GameTitle';

const PHASES = UI.phases;
const FIRST_MILESTONE_LOC = MILESTONES[0]?.loc ?? 10;
/** After claiming writer, ignore foreign re-block for this long (ms). */
const CLAIM_GRACE_MS = 1_000;

export function Game() {
  const isMobile = useIsMobile();

  const sessionIdRef = useRef(getOrCreateHmrWriterSessionId());
  const [state, setState] = useState<GameState>(() => loadGameBootState(sessionIdRef.current));
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [blockedByOtherTab, setBlockedByOtherTab] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const persistedDiskRef = useRef<SaveDiskSnapshot>(readSaveDiskSnapshot());
  const pausedAtRef = useRef<number | null>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  useRevealScrollbar(leftScrollRef);

  const resetStreamRef = useRef<(syncLog?: LogEntry[]) => void>(() => {});

  const sessionLabel = useCallback(
    () => sessionIdRef.current.slice(0, 8),
    [],
  );

  const snapshotToDisk = useCallback((reason: string, snapshotState?: GameState) => {
    if (isSaveEditorTabOpen()) {
      debugToast(`save skipped · ${reason} · editor open`);
      return;
    }
    const toSave = snapshotState ?? stateRef.current;
    saveState(toSave, 'game', sessionIdRef.current);
    const disk = readSaveDiskSnapshot();
    persistedDiskRef.current = disk;
    setBlockedByOtherTab(false);
    debugToast(
      `save · ${reason} · rev=${disk.rev} · session=${disk.writerSessionId?.slice(0, 8) ?? '?'}`,
    );
  }, []);

  const snapshotToDiskRef = useRef(snapshotToDisk);
  snapshotToDiskRef.current = snapshotToDisk;

  const claimGraceUntilRef = useRef(0);

  const reloadFromDisk = useCallback(
    (reason: string, opts?: { blockOtherTab?: boolean }): GameState => {
      pausedAtRef.current = null;
      const disk = readSaveDiskSnapshot();
      persistedDiskRef.current = disk;
      const next = loadStateWithCatchup();
      stateRef.current = next;
      setState(next);
      resetStreamRef.current(next.log);
      const foreign =
        disk.writerSessionId != null && disk.writerSessionId !== sessionIdRef.current;
      if (
        opts?.blockOtherTab &&
        foreign &&
        Date.now() >= claimGraceUntilRef.current
      ) {
        setBlockedByOtherTab(true);
        debugToast('blocked · running in another tab');
      }
      debugToast(
        `reload · ${reason} · rev=${disk.rev} · ${foreign ? 'foreign' : 'own'} session · queued=${getQueuedUserEntries(next).length}`,
      );
      return next;
    },
    [],
  );

  const { isActive, isForeground } = useGameActive();
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const skipNextActivateRef = useRef(false);
  const blockedRef = useRef(blockedByOtherTab);
  blockedRef.current = blockedByOtherTab;

  const claimWriter = useCallback(() => {
    if (!blockedRef.current) return;
    setBlockedByOtherTab(false);
    const adopted = reloadFromDisk('claim writer', { blockOtherTab: false });
    skipNextActivateRef.current = true;
    snapshotToDisk('focus claim', adopted);
    claimGraceUntilRef.current = Date.now() + CLAIM_GRACE_MS;
    debugToast(`claim writer · adopted disk · session=${sessionLabel()}`);
  }, [reloadFromDisk, sessionLabel, snapshotToDisk]);

  const claimWriterRef = useRef(claimWriter);
  claimWriterRef.current = claimWriter;

  /** Another tab or the save editor wrote localStorage — adopt only via storage events. */
  const syncFromDisk = useCallback(
    (reason: string) => {
      const disk = readSaveDiskSnapshot();
      if (!shouldFollowDiskSnapshot(persistedDiskRef.current, disk, sessionIdRef.current)) {
        return;
      }
      const foreign =
        disk.writerSessionId != null && disk.writerSessionId !== sessionIdRef.current;

      if (foreign && (isActiveRef.current || Date.now() < claimGraceUntilRef.current)) {
        setBlockedByOtherTab(false);
        const adopted = reloadFromDisk(`${reason} · steal`, { blockOtherTab: false });
        snapshotToDisk(`${reason} steal`, adopted);
        claimGraceUntilRef.current = Date.now() + CLAIM_GRACE_MS;
        return;
      }

      reloadFromDisk(reason, { blockOtherTab: foreign });
    },
    [reloadFromDisk, snapshotToDisk],
  );

  const syncFromDiskRef = useRef(syncFromDisk);
  syncFromDiskRef.current = syncFromDisk;

  /** Tab refocused — catch up in memory only; never reload disk in the same tab. */
  const resumeGameplay = useCallback(() => {
    if (skipNextActivateRef.current) {
      skipNextActivateRef.current = false;
      debugToast(`resume · after claim · session=${sessionLabel()}`);
      return;
    }

    setBlockedByOtherTab(false);
    if (pausedAtRef.current == null) return;

    const elapsed = Date.now() - pausedAtRef.current;
    pausedAtRef.current = null;
    setState((prev) => {
      const next = elapsed > 0 ? advanceTick(prev, elapsed) : prev;
      requestAnimationFrame(() => snapshotToDisk('focus catchup', next));
      return next;
    });
    debugToast(`focus · catchup ${elapsed}ms · session=${sessionLabel()}`);
  }, [sessionLabel, snapshotToDisk]);

  const isGameplayActive = isActive && !blockedByOtherTab;

  // Blocked while still window-active: focus/click must claim — isGameplayActive won't flip.
  useEffect(() => {
    const tryClaim = () => {
      if (!blockedRef.current || !isActiveRef.current) return;
      claimWriterRef.current();
    };

    window.addEventListener('focus', tryClaim);
    window.addEventListener('pointerdown', tryClaim, true);
    const onVisibility = () => {
      if (!document.hidden) tryClaim();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', tryClaim);
      window.removeEventListener('pointerdown', tryClaim, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    return registerHmrGameFlush(() => {
      if (isSaveEditorTabOpen()) return undefined;
      const toSave = stateRef.current;
      saveState(toSave, 'game', sessionIdRef.current);
      stashHmrState(toSave, sessionIdRef.current);
      const disk = readSaveDiskSnapshot();
      persistedDiskRef.current = disk;
      return disk;
    });
  }, []);

  useEffect(() => {
    const disk = readSaveDiskSnapshot();
    debugToast(
      `mount · ${isHmrEnabled() ? 'hmr' : 'load'}+catchup · rev=${disk.rev} · session=${sessionLabel()} · writer=${disk.writerSessionId?.slice(0, 8) ?? '?'}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wasActiveDebugRef = useRef(isActive);
  useEffect(() => {
    if (wasActiveDebugRef.current === isActive) return;
    wasActiveDebugRef.current = isActive;
    debugToast(
      `active → ${isActive ? 'yes' : 'no'} · tab ${isForeground ? 'visible' : 'hidden'}`,
    );
  }, [isActive, isForeground]);

  // Snapshot on blur / tab hide. Pause time is recorded immediately; disk write
  // is deferred one frame so the last React commit is included.
  useEffect(() => {
    const snapshot = (reason: string) => {
      if (pausedAtRef.current == null) pausedAtRef.current = Date.now();
      requestAnimationFrame(() => snapshotToDisk(reason));
    };
    const onBlur = () => snapshot('blur');
    const onVisibility = () => {
      if (document.hidden) snapshot('tab hide');
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [snapshotToDisk]);

  useEffect(() => {
    const onUnload = () => snapshotToDisk('unload');
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [snapshotToDisk]);

  useForegroundGame({
    isActive: isGameplayActive,
    setState,
    onActivate: resumeGameplay,
  });

  const { displayLog, showThinking, isAnimating, spinTick, reset: resetStream } =
    useStreamingLog(state.log, state.logId, !isGameplayActive);
  resetStreamRef.current = resetStream;

  useEffect(() => {
    setState((prev) => syncQueuedUserFlags(prev, displayLog, isAnimating));
  }, [displayLog, isAnimating]);

  const [mcpSpinTick, setMcpSpinTick] = useState(0);
  const mcpRunning = mcpExecuting(state);
  useEffect(() => {
    if (!isGameplayActive || !mcpRunning) return;
    const id = setInterval(() => setMcpSpinTick((t) => t + 1), STREAMING.spinnerMs);
    return () => clearInterval(id);
  }, [isGameplayActive, mcpRunning, state.mcpExecutingUntil]);

  // Periodic backup while active. Memory is authoritative — never reload here.
  useEffect(() => {
    const id = setInterval(() => {
      if (!isGameplayActive) return;
      if (isSaveEditorTabOpen()) return;
      snapshotToDisk('autosave');
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isGameplayActive, snapshotToDisk]);

  // Another tab wrote or reset the save — reload without refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!isSaveStorageKey(e.key)) return;
      syncFromDiskRef.current('storage event');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Wrap each pure action in a setState. The argument signature ensures
  // accidentally calling an action with stale state is impossible.
  const dispatch = useCallback(
    <Args extends unknown[]>(fn: (s: GameState, ...args: Args) => GameState) =>
      (...args: Args) =>
        setState((prev) => {
          const next = fn(prev, ...args);
          requestAnimationFrame(() => snapshotToDiskRef.current('action', next));
          return next;
        }),
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
      lobstagramPost: dispatch(lobstagramPostAction),
      raiseRound: dispatch(raiseRoundAction),
      shiftMcMiniLane: (from: McMiniLane, to: McMiniLane) =>
        setState((prev) => shiftMcMiniLane(prev, from, to)),
      mcpAllow: dispatch(mcpAllowAction),
      mcpAlwaysAllow: dispatch(mcpAlwaysAllowAction),
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
    const fresh = defaultState();
    saveState(fresh, 'game', sessionIdRef.current);
    persistedDiskRef.current = readSaveDiskSnapshot();
    setState(fresh);
    resetStream();
  }, [resetStream]);

  // ── derived ──
  const derived = deriveGame(state);
  const mcpPendingUnsafe =
    state.mcpActiveToolId != null && !mcpToolIsSafe(state.mcpActiveToolId);
  const mcpUnsafePolicyBlocked =
    state.mcpApprovalPending != null &&
    state.mcpAutoApproveAt == null &&
    mcpPendingUnsafe &&
    derived.hasFlag('mcp_auto_approve');
  const phase = getPhase(state);
  const showLog = state.log.length >= 1;
  const { showGenSection, showUpgSection, showInvestor } = derived.ui;
  const fundingRoundOpen = showInvestor && nextFundingRound(state) !== undefined;

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
      <DebugToast />

      {!isForeground && <PauseOverlay message="processing in background…" />}
      {isForeground && blockedByOtherTab && (
        <PauseOverlay message="running in another tab…" blockInput />
      )}

      {isMobile && (
        <div className="flex-shrink-0 mb-2">
          <GameTitle />
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
          ref={leftScrollRef}
          className={
            isMobile
              ? 'overflow-y-auto hairline-scrollbar flex-1 min-h-0 pb-6'
              : 'overflow-y-auto hairline-scrollbar min-w-0 h-full pb-6'
          }
        >
          {!isMobile && (
            <>
              <GameTitle />
              <div className="text-dimmer text-[12px] mb-6">{PHASES[phase]}</div>
            </>
          )}

          {(() => {
            const t = Date.now();
            const promptMove = getMove(state, 'prompt', t)!;
            const waiting = !promptMove.legal;
            const onCooldown = !promptMove.legal;
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
            onLobstagramPost={handlers.lobstagramPost}
            onRunBugBounty={handlers.runBugBounty}
          />

          {state.started && <ResourcePanel state={state} />}

          {derived.ui.showMcMinis && (
            <McMinis state={state} onShiftLane={handlers.shiftMcMiniLane} />
          )}

          {showGenSection && (
            <Generators
              state={state}
              onBuyGen={handlers.buyGen}
              onNewFreeAccount={handlers.newFreeAccount}
            />
          )}

          {(showUpgSection || fundingRoundOpen) && (
            <Upgrades
              state={state}
              onBuyUpgrade={handlers.buyUpgrade}
              onRaiseRound={handlers.raiseRound}
            />
          )}

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
            isMobile={isMobile}
            mcpApprovalMessage={state.mcpApprovalPending}
            mcpShowAlwaysAllow={derived.hasFlag('mcp_auto_approve')}
            mcpUnsafePolicyBlocked={mcpUnsafePolicyBlocked}
            mcpPendingUnsafe={mcpPendingUnsafe}
            mcpExecutingMessage={mcpRunning ? state.mcpExecutingLine : null}
            showThinking={showThinking || mcpRunning}
            phase={phase}
            spinTick={mcpRunning ? mcpSpinTick : spinTick}
            onMcpAllow={handlers.mcpAllow}
            onMcpAlwaysAllow={handlers.mcpAlwaysAllow}
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
