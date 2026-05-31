import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry, LogEntryType } from '../types';
import { STREAMING } from '../game/constants';

/** Chat reply after a `>` line — not milestones/news (those use AI-only pacing). */
const PROMPT_REPLY_TYPES: ReadonlySet<LogEntryType> = new Set(['info', 'bad', 'event']);

/**
 * Subscribes to `state.log`-style append-only log and streams new entries
 * into a `displayLog` array word-by-word, with a brief pause before each
 * entry. User-authored lines appear after a short delay without streaming.
 *
 * `showThinking` drives the spinner in the pause after a user line (or before
 * AI-only replies) — hidden once the AI entry starts typing (`|` stream).
 * `isAnimating` is true until the display queue is fully drained — use this
 * to gate the prompt button so it stays off until streaming actually finishes.
 */
export function useStreamingLog(stateLog: LogEntry[], stateLogId: number) {
  const [displayLog, setDisplayLog] = useState<LogEntry[]>(stateLog);
  const lastSeenIdRef = useRef(stateLog.reduce((m, e) => Math.max(m, e.id), 0));
  const pendingRef = useRef<LogEntry[]>([]);
  const isProcessingRef = useRef(false);
  const processRef = useRef<() => void>(null!);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when a user line already scheduled the post-prompt thinking pause. */
  const spinnerPrimedRef = useRef(false);
  const [showThinking, setShowThinking] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinTick, setSpinTick] = useState(0);

  const clearThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current !== null) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  }, []);

  const scheduleThinking = useCallback((delayMs: number) => {
    clearThinkingTimer();
    thinkingTimerRef.current = setTimeout(() => {
      thinkingTimerRef.current = null;
      setShowThinking(true);
    }, delayMs);
  }, [clearThinkingTimer]);

  const finishQueue = useCallback(() => {
    clearThinkingTimer();
    isProcessingRef.current = false;
    setIsAnimating(false);
    setShowThinking(false);
  }, [clearThinkingTimer]);

  const processEntry = useCallback(() => {
    if (pendingRef.current.length === 0) {
      finishQueue();
      return;
    }
    const entry = pendingRef.current.shift()!;

    if (entry.type === 'user') {
      clearThinkingTimer();
      setShowThinking(false);
      setTimeout(() => {
        setDisplayLog((prev) => [...prev, entry]);
        const next = pendingRef.current[0];
        if (next && PROMPT_REPLY_TYPES.has(next.type)) {
          spinnerPrimedRef.current = true;
          scheduleThinking(STREAMING.thinkingDelayMs);
        }
        setTimeout(() => processRef.current(), STREAMING.afterUserMs);
      }, STREAMING.userLeadInMs);
      return;
    }

    const chunks = entry.text.split(/(\s+)/);
    let i = 0;

    const startAiStream = () => {
      clearThinkingTimer();
      setShowThinking(false);
      setDisplayLog((prev) => [...prev, { ...entry, text: '' }]);
      const tick = () => {
        if (i >= chunks.length) {
          setDisplayLog((prev) => {
            const next = [...prev];
            if (next.length > 0) next[next.length - 1] = { ...entry, text: entry.text };
            return next;
          });
          setTimeout(() => processRef.current(), STREAMING.afterAiMs);
          return;
        }
        i++;
        const partial = chunks.slice(0, i).join('') + '|';
        setDisplayLog((prev) => {
          const next = [...prev];
          if (next.length > 0) next[next.length - 1] = { ...entry, text: partial };
          return next;
        });
        const isSpace = chunks[i - 1].trim() === '';
        setTimeout(tick, isSpace ? 0 : STREAMING.charBaseMs + STREAMING.charJitterMs);
      };
      setTimeout(tick, STREAMING.aiLeadInMs);
    };

    if (spinnerPrimedRef.current) {
      spinnerPrimedRef.current = false;
      startAiStream();
    } else {
      setShowThinking(true);
      setTimeout(startAiStream, STREAMING.aiOnlySpinnerHoldMs);
    }
  }, [clearThinkingTimer, finishQueue, scheduleThinking]);

  processRef.current = processEntry;

  useEffect(() => {
    const newEntries = stateLog.filter((e) => e.id > lastSeenIdRef.current);
    if (newEntries.length === 0) return;
    lastSeenIdRef.current = stateLog[stateLog.length - 1]?.id ?? lastSeenIdRef.current;
    pendingRef.current.push(...newEntries);
    if (!isProcessingRef.current) {
      isProcessingRef.current = true;
      setIsAnimating(true);
      processRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateLogId]);

  useEffect(() => {
    if (!showThinking) return;
    const id = setInterval(() => setSpinTick((t) => t + 1), STREAMING.spinnerMs);
    return () => clearInterval(id);
  }, [showThinking]);

  const reset = useCallback(() => {
    clearThinkingTimer();
    setDisplayLog([]);
    setShowThinking(false);
    setIsAnimating(false);
    lastSeenIdRef.current = 0;
    pendingRef.current = [];
    isProcessingRef.current = false;
    spinnerPrimedRef.current = false;
  }, [clearThinkingTimer]);

  return { displayLog, showThinking, isAnimating, spinTick, reset };
}
