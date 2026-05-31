/// <reference lib="webworker" />
import { runOneBotChunked } from './runOneSeed';
import type { TraceWorkerBotIn, TraceWorkerBotOut } from './traceTypes';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<TraceWorkerBotIn>) => {
  const msg = event.data;
  if (msg.type !== 'runBot') return;
  try {
    runOneBotChunked(
      {
        botId: msg.botId,
        seed: msg.seed,
        budgetMs: msg.budgetMs,
        chunkMs: msg.chunkMs,
        firstChunkMs: msg.firstChunkMs,
      },
      (run, virtualHours, done) => {
        ctx.postMessage({
          type: 'botChunk',
          requestId: msg.requestId,
          run,
          virtualHours,
          done,
        } satisfies TraceWorkerBotOut);
      },
    );
  } catch (e) {
    ctx.postMessage({
      type: 'error',
      requestId: msg.requestId,
      botId: msg.botId,
      message: e instanceof Error ? e.message : String(e),
    } satisfies TraceWorkerBotOut);
  }
};

export {};
