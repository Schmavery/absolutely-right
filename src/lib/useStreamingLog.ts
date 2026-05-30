import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../types';
import { STREAMING } from '../game/constants';

/**
 * Subscribes to `state.log`-style append-only log and streams new entries
 * into a `displayLog` array word-by-word, with a brief pause before each
 * entry. User-authored lines (prefixed `>`) appear after a short delay
 * without streaming, mimicking a chat input.
 *
 * Returns the display log, a streaming flag, a tick counter you can mod
 * to drive a spinner, and a `reset()` function that flushes everything
 * (used by the "rewrite from scratch" button).
 */
export function useStreamingLog(stateLog: LogEntry[], stateLogId: number) {
  const [displayLog, setDisplayLog] = useState<LogEntry[]>(stateLog);
  const lastSeenIdRef = useRef(stateLog.reduce((m, e) => Math.max(m, e.id), 0));
  const pendingRef = useRef<LogEntry[]>([]);
  const isProcessingRef = useRef(false);
  const processRef = useRef<() => void>(null!);
  const [isStreaming, setIsStreaming] = useState(false);
  const [spinTick, setSpinTick] = useState(0);

  const processEntry = useCallback(() => {
    if (pendingRef.current.length === 0) {
      isProcessingRef.current = false;
      setIsStreaming(false);
      return;
    }
    setIsStreaming(true);
    const entry = pendingRef.current.shift()!;

    if (entry.type === 'user') {
      setTimeout(() => {
        setDisplayLog((prev) => [...prev, entry]);
        setTimeout(() => processRef.current(), STREAMING.afterUserMs);
      }, STREAMING.userLeadInMs);
      return;
    }

    // Stream AI / event / news / milestone messages word-by-word.
    const chunks = entry.text.split(/(\s+)/); // preserves whitespace tokens
    let i = 0;
    setDisplayLog((prev) => [...prev, { ...entry, text: '' }]);

    const tick = () => {
      if (i >= chunks.length) {
        // Finalise without cursor.
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
      setTimeout(tick, isSpace ? 0 : STREAMING.charBaseMs + Math.random() * STREAMING.charJitterMs);
    };

    setTimeout(tick, STREAMING.aiLeadInMs);
  }, []);

  processRef.current = processEntry;

  // Watch for new log entries and push them into the display queue.
  useEffect(() => {
    const newEntries = stateLog.filter((e) => e.id > lastSeenIdRef.current);
    if (newEntries.length === 0) return;
    lastSeenIdRef.current = stateLog[stateLog.length - 1]?.id ?? lastSeenIdRef.current;
    pendingRef.current.push(...newEntries);
    if (!isProcessingRef.current) {
      isProcessingRef.current = true;
      setIsStreaming(true);
      processRef.current();
    }
    // intentionally only depend on logId — `stateLog` reference is stable per change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateLogId]);

  // Spinner tick — only runs while streaming.
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setSpinTick((t) => t + 1), STREAMING.spinnerMs);
    return () => clearInterval(id);
  }, [isStreaming]);

  const reset = useCallback(() => {
    setDisplayLog([]);
    setIsStreaming(false);
    lastSeenIdRef.current = 0;
    pendingRef.current = [];
    isProcessingRef.current = false;
  }, []);

  return { displayLog, isStreaming, spinTick, reset };
}
