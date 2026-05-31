import { useEffect, useRef } from 'react';
import type { LogEntry } from '../types';
import { UI } from '../game/data';
import { STREAMING } from '../game/constants';

const SPIN_FRAMES = UI.spinFrames;
const SPIN_VERBS = UI.spinVerbs;

interface Props {
  displayLog: LogEntry[];
  queuedUserEntries: LogEntry[];
  showThinking: boolean;
  spinTick: number;
  isMobile: boolean;
}

const TYPE_CLASSES: Record<LogEntry['type'], string> = {
  user: 'border-r-2 border-r-log-user-border text-log-user pr-[10px] text-right',
  bad: 'border-l-2 border-l-log-bad-border text-log-bad pl-[10px]',
  event: 'border-l-2 border-l-log-event-border text-log-event pl-[10px]',
  news: 'border-l-2 border-l-log-news-border text-log-news pl-[10px]',
  milestone: 'border-l-2 border-l-log-milestone-border text-log-milestone pl-[10px]',
  system: 'border-l-2 border-l-log-system-border text-log-system pl-[10px]',
  info: 'border-l-2 border-l-log-info-border text-log-info pl-[10px]',
};

export function ConversationLog({
  displayLog,
  queuedUserEntries,
  showThinking,
  spinTick,
  isMobile,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayLog.length, displayLog[displayLog.length - 1]?.id]);

  const spinnerChar = SPIN_FRAMES[spinTick % SPIN_FRAMES.length];
  const spinnerVerb =
    SPIN_VERBS[Math.floor(spinTick / STREAMING.spinnerVerbEvery) % SPIN_VERBS.length];

  return (
    <div
      className={[
        'flex flex-col min-h-0 overflow-hidden min-w-0',
        isMobile
          ? 'h-[33vh] flex-shrink-0 -order-1 border-b border-border mb-3'
          : 'h-full',
      ].join(' ')}
    >
      <div className="text-dim text-[11px] tracking-[0.12em] uppercase mb-[10px] pb-[5px] border-b border-border flex-shrink-0">
        conversation
      </div>
      <div
        className={[
          'flex-1 overflow-y-auto min-h-0',
          isMobile ? 'pb-12' : 'pb-24',
        ].join(' ')}
      >
        {displayLog.map((entry) => (
          <div
            key={entry.id}
            className={'mb-[11px] text-[12px] leading-[1.55] ' + TYPE_CLASSES[entry.type]}
          >
            {entry.text}
          </div>
        ))}
        {showThinking && (
          <div className="px-[10px] py-[7px] text-[11px] text-dimmer border-l-2 border-l-log-info-border mb-[11px]">
            {spinnerChar} {spinnerVerb}...
          </div>
        )}
        <div ref={endRef} />
      </div>
      {queuedUserEntries.length > 0 && (
        <div className="flex-shrink-0 mt-2 border border-card-border bg-card-bg px-[10px] pt-2 pb-[6px]">
          <div className="text-dimmer text-[10px] tracking-[0.12em] uppercase mb-[7px]">queued</div>
          {queuedUserEntries.map((entry) => (
            <div
              key={`q-${entry.id}`}
              className="text-[12px] leading-[1.55] mb-[5px] pr-[10px] border-r-2 border-r-log-user-border text-right text-dim"
            >
              {entry.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
