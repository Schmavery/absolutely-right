import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry, LogEntryType } from '../types';
import { STREAMING } from '../game/constants';
import { aiStreamPhases, effectiveStreamMs } from '../game/streamSchedule';

/** Chat reply after a `>` line — not milestones/news (those use AI-only pacing). */
const PROMPT_REPLY_TYPES: ReadonlySet<LogEntryType> = new Set(['info', 'bad', 'event']);

/** True when `displayLog` has finished streaming an entry from `stateLog`. */
export function isLogEntryFullyDisplayed(
  entryId: number,
  stateLog: LogEntry[],
  displayLog: LogEntry[],
): boolean {
  const src = stateLog.find((e) => e.id === entryId);
  const d = displayLog.find((e) => e.id === entryId);
  return !!src && !!d && d.text === src.text;
}

/**
 * Subscribes to `state.log`-style append-only log and streams new entries
 * into a `displayLog` array word-by-word, with a brief pause before each
 * entry. User-authored lines appear after a short delay without streaming.
 *
 * Playback uses each entry's enqueue-time `streamMs` (see `streamSchedule.ts`).
 */
export function useStreamingLog(
  stateLog: LogEntry[],
  stateLogId: number,
  paused = false,
) {
  const [displayLog, setDisplayLog] = useState<LogEntry[]>(stateLog);
  const lastSeenIdRef = useRef(stateLog.reduce((m, e) => Math.max(m, e.id), 0));
  const pendingRef = useRef<LogEntry[]>([]);
  const isProcessingRef = useRef(false);
  const processRef = useRef<() => void>(null!);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when a user line already scheduled the post-prompt thinking pause. */
  const spinnerPrimedRef = useRef(false);
  const prevEntryWasUserRef = useRef(false);
  const [showThinking, setShowThinking] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinTick, setSpinTick] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  /** Bumped on `reset` so in-flight stream timeouts cannot append after a reload. */
  const generationRef = useRef(0);

  const defer = useCallback((fn: () => void, ms = 0) => {
    const gen = generationRef.current;
    setTimeout(() => {
      if (gen !== generationRef.current) return;
      fn();
    }, ms);
  }, []);

  const appendDisplayed = useCallback(
    (append: (prev: LogEntry[]) => LogEntry[]) => {
      setDisplayLog((prev) => {
        const next = append(prev);
        if (next.length <= prev.length) return next;
        const added = next[next.length - 1]!;
        if (prev.some((e) => e.id === added.id)) return prev;
        return next;
      });
    },
    [],
  );

  const clearThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current !== null) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  }, []);

  const scheduleThinking = useCallback(
    (delayMs: number) => {
      clearThinkingTimer();
      const gen = generationRef.current;
      thinkingTimerRef.current = setTimeout(() => {
        thinkingTimerRef.current = null;
        if (gen !== generationRef.current) return;
        setShowThinking(true);
      }, delayMs);
    },
    [clearThinkingTimer],
  );

  const finishQueue = useCallback(() => {
    clearThinkingTimer();
    isProcessingRef.current = false;
    setIsAnimating(false);
    setShowThinking(false);
    prevEntryWasUserRef.current = false;
  }, [clearThinkingTimer]);

  const kickProcess = useCallback(() => {
    if (pausedRef.current) return;
    if (pendingRef.current.length === 0) return;
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsAnimating(true);
    processRef.current();
  }, []);

  const processEntry = useCallback(() => {
    if (pausedRef.current) {
      isProcessingRef.current = false;
      return;
    }
    if (pendingRef.current.length === 0) {
      finishQueue();
      return;
    }
    const entry = pendingRef.current.shift()!;
    const prevWasUser = prevEntryWasUserRef.current;
    const streamMs = effectiveStreamMs(entry, prevWasUser);
    const afterUserReply = prevWasUser && entry.type !== 'user';

    if (entry.instant) {
      clearThinkingTimer();
      setShowThinking(false);
      appendDisplayed((prev) => [...prev, entry]);
      prevEntryWasUserRef.current = false;
      defer(() => processRef.current());
      return;
    }

    if (entry.type === 'user') {
      clearThinkingTimer();
      setShowThinking(false);
      const afterShowMs = Math.max(0, streamMs - STREAMING.userLeadInMs);
      defer(() => {
        appendDisplayed((prev) => [...prev, entry]);
        const next = pendingRef.current[0];
        if (next && PROMPT_REPLY_TYPES.has(next.type)) {
          spinnerPrimedRef.current = true;
          scheduleThinking(STREAMING.thinkingDelayMs);
        }
        prevEntryWasUserRef.current = true;
        defer(() => processRef.current(), afterShowMs);
      }, STREAMING.userLeadInMs);
      return;
    }

    const phases = aiStreamPhases(afterUserReply);
    const chunks = entry.text.split(/(\s+)/);
    let i = 0;

    const startAiStream = () => {
      clearThinkingTimer();
      setShowThinking(false);
      appendDisplayed((prev) => [...prev, { ...entry, text: '' }]);
      const tick = () => {
        if (i >= chunks.length) {
          setDisplayLog((prev) => {
            const next = [...prev];
            const idx = next.findIndex((e) => e.id === entry.id);
            if (idx >= 0) next[idx] = { ...entry, text: entry.text };
            else if (next.length > 0) next[next.length - 1] = { ...entry, text: entry.text };
            return next;
          });
          prevEntryWasUserRef.current = false;
          defer(() => processRef.current(), phases.afterMs);
          return;
        }
        i++;
        const partial = chunks.slice(0, i).join('') + '|';
        setDisplayLog((prev) => {
          const next = [...prev];
          const idx = next.findIndex((e) => e.id === entry.id);
          if (idx >= 0) next[idx] = { ...entry, text: partial };
          else if (next.length > 0) next[next.length - 1] = { ...entry, text: partial };
          return next;
        });
        const isSpace = chunks[i - 1].trim() === '';
        defer(tick, isSpace ? 0 : phases.tokenDelayMs);
      };
      defer(tick, phases.leadInMs);
    };

    prevEntryWasUserRef.current = false;

    if (spinnerPrimedRef.current) {
      spinnerPrimedRef.current = false;
      startAiStream();
    } else {
      setShowThinking(true);
      defer(startAiStream, phases.spinnerHoldMs);
    }
  }, [appendDisplayed, clearThinkingTimer, defer, finishQueue, scheduleThinking]);

  processRef.current = processEntry;

  useEffect(() => {
    const newEntries = stateLog.filter((e) => e.id > lastSeenIdRef.current);
    if (newEntries.length === 0) return;
    lastSeenIdRef.current = stateLog[stateLog.length - 1]?.id ?? lastSeenIdRef.current;
    pendingRef.current.push(...newEntries);
    if (!isProcessingRef.current) {
      const firstId = newEntries[0]!.id;
      const prior = stateLog.filter((e) => e.id < firstId).at(-1);
      prevEntryWasUserRef.current = prior?.type === 'user';
    }
    kickProcess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateLogId]);

  useEffect(() => {
    if (paused) {
      clearThinkingTimer();
      return;
    }
    kickProcess();
  }, [paused, clearThinkingTimer, kickProcess]);

  useEffect(() => {
    if (!showThinking || paused) return;
    const id = setInterval(() => setSpinTick((t) => t + 1), STREAMING.spinnerMs);
    return () => clearInterval(id);
  }, [showThinking, paused]);

  /** Pass `syncLog` after a disk reload so backlog entries are not re-streamed. */
  const reset = useCallback(
    (syncLog?: LogEntry[]) => {
      generationRef.current += 1;
      clearThinkingTimer();
      if (syncLog) {
        setDisplayLog(syncLog);
        lastSeenIdRef.current = syncLog.reduce((m, e) => Math.max(m, e.id), 0);
      } else {
        setDisplayLog([]);
        lastSeenIdRef.current = 0;
      }
      setShowThinking(false);
      setIsAnimating(false);
      pendingRef.current = [];
      isProcessingRef.current = false;
      spinnerPrimedRef.current = false;
      prevEntryWasUserRef.current = false;
    },
    [clearThinkingTimer],
  );

  return { displayLog, showThinking, isAnimating, spinTick, reset };
}
