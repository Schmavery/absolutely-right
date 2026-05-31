import { useEffect, useState } from 'react';
import { fmtTime } from './traceAnalyze';
import { clearTraceCache, getTraceCache, setTraceCache } from './traceCache';
import { heatmapFromRuns, heatmapFromSerialized, heatmapToSerialized } from './runBotSim';
import type { DebugBotId } from '../sim/bots';
import type { SerializedRun, TraceRunConfig, TraceWorkerBotIn, TraceWorkerBotOut } from './traceTypes';

export type TraceSimStatus = 'loading' | 'streaming' | 'ready' | 'error';

export interface TraceSimState {
  status: TraceSimStatus;
  /** Short summary for the initial loading panel only. */
  progress: string;
  /** Stable per-bot stream line (does not swap as other bots update). */
  botProgress: Partial<Record<DebugBotId, string>>;
  fromCache: boolean;
  runs: SerializedRun[];
  heatmap: Map<string, { botId: DebugBotId; t: number; loc: number }[]> | null;
  error: string | null;
}

const WORKER_POOL = 4;

let workerPool: Worker[] | null = null;
let workerEpoch = 0;

function acquireWorkers(): Worker[] {
  if (!workerPool) {
    workerPool = Array.from({ length: WORKER_POOL }, () =>
      new Worker(new URL('./traceWorker.ts', import.meta.url), { type: 'module' }),
    );
  }
  return workerPool;
}

function terminateWorkerPool(): void {
  workerPool?.forEach((w) => w.terminate());
  workerPool = null;
  workerEpoch += 1;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    terminateWorkerPool();
    clearTraceCache();
  });
}

const initial: TraceSimState = {
  status: 'loading',
  progress: 'Starting…',
  botProgress: {},
  fromCache: false,
  runs: [],
  heatmap: null,
  error: null,
};

function initialBotProgress(botIds: DebugBotId[]): Partial<Record<DebugBotId, string>> {
  return Object.fromEntries(botIds.map((id) => [id, 'Queued…'])) as Partial<
    Record<DebugBotId, string>
  >;
}

const BOT_ORDER: DebugBotId[] = [
  'progress',
  'progress_rank',
  'loc',
  'loc_rank',
  'hygiene',
  'hygiene_rank',
  'greedy_rank',
  'instant_rank',
  'patient_rank',
  'lazy',
  'random',
  'spammer',
];

function runsFromMap(map: Map<DebugBotId, SerializedRun>): SerializedRun[] {
  return [...map.values()].sort(
    (a, b) => BOT_ORDER.indexOf(a.botId) - BOT_ORDER.indexOf(b.botId) || a.botId.localeCompare(b.botId),
  );
}

export function useTraceSim(config: TraceRunConfig): TraceSimState {
  const [state, setState] = useState<TraceSimState>(initial);

  const botsKey = config.botIds.join(',');

  useEffect(() => {
    const cached = getTraceCache(config.runKey);
    if (cached) {
      const runs = cached.runs;
      const botProgress = Object.fromEntries(
        runs.map((r) => [
          r.botId,
          `Complete (${(r.endT / 3_600_000).toFixed(2)}h)`,
        ]),
      ) as Partial<Record<DebugBotId, string>>;
      setState({
        status: 'ready',
        progress: 'Loaded from cache',
        botProgress,
        fromCache: true,
        runs,
        heatmap: heatmapFromSerialized(cached.heatmapByUpgrade),
        error: null,
      });
      return;
    }

    const epoch = workerEpoch;
    const requestId = Date.now();
    let cancelled = false;
    const botIds = [...config.botIds];
    const runsByBot = new Map<DebugBotId, SerializedRun>();
    const botsDone = new Set<DebugBotId>();
    const queue = [...botIds];
    let inFlight = 0;
    let failed: string | null = null;

    let botProgress = initialBotProgress(botIds);

    const publish = () => {
      const all = runsFromMap(runsByBot);
      const allDone = botsDone.size >= botIds.length;
      setState({
        status: allDone ? 'ready' : all.length > 0 ? 'streaming' : 'loading',
        progress: `${botsDone.size}/${botIds.length} bots complete`,
        botProgress: { ...botProgress },
        fromCache: false,
        runs: all,
        heatmap: all.length > 0 ? heatmapFromRuns(all) : null,
        error: null,
      });
    };

    const finish = () => {
      if (cancelled || failed) return;
      const all = runsFromMap(runsByBot);
      setTraceCache(config.runKey, {
        runs: all,
        heatmapByUpgrade: heatmapToSerialized(heatmapFromRuns(all)),
      });
      publish();
    };

    const pump = (worker: Worker) => {
      if (cancelled || failed || queue.length === 0) return;
      const botId = queue.shift()!;
      inFlight += 1;
      const msg: TraceWorkerBotIn = {
        type: 'runBot',
        requestId,
        botId,
        seed: config.seed,
        budgetMs: config.budgetMs,
        chunkMs: config.chunkMs,
        firstChunkMs: config.firstChunkMs,
      };
      worker.postMessage(msg);
    };

    setState({
      ...initial,
      progress: `Starting ${botIds.length} bots @ seed ${config.seed}…`,
      botProgress: initialBotProgress(botIds),
    });

    const workers = acquireWorkers();
    const onMessage = (event: MessageEvent<TraceWorkerBotOut>) => {
      if (cancelled || epoch !== workerEpoch) return;
      const msg = event.data;
      if (msg.requestId !== requestId) return;

      if (msg.type === 'error') {
        failed = `${msg.botId}: ${msg.message}`;
        setState({
          status: 'error',
          progress: '',
          botProgress: {},
          fromCache: false,
          runs: [],
          heatmap: null,
          error: failed,
        });
        return;
      }

      if (msg.type === 'botChunk') {
        runsByBot.set(msg.run.botId, msg.run);
        const hrs = msg.virtualHours.toFixed(2);
        if (msg.done) {
          botsDone.add(msg.run.botId);
          inFlight -= 1;
          botProgress[msg.run.botId] = `Complete (${hrs}h)`;
          if (botsDone.size >= botIds.length && inFlight === 0) {
            finish();
          } else {
            publish();
            for (const w of workers) pump(w);
          }
        } else {
          botProgress[msg.run.botId] = `Through ${hrs}h…`;
          publish();
        }
      }
    };

    workers.forEach((w) => {
      w.addEventListener('message', onMessage);
      pump(w);
    });

    return () => {
      cancelled = true;
      workers.forEach((w) => w.removeEventListener('message', onMessage));
    };
  }, [config.runKey, config.seed, config.budgetMs, config.chunkMs, config.firstChunkMs, botsKey]);

  return state;
}
