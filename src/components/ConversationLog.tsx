import { useEffect, useRef, type ReactNode } from 'react';
import type { LogEntry } from '../types';
import { UI } from '../game/data';
import { STREAMING } from '../game/constants';
import { Button } from './Button';
import { McpToolCallBlock } from './McpToolCallBlock';

const SPIN_FRAMES = UI.spinFrames;
const SPIN_VERBS = UI.spinVerbs;

interface Props {
  displayLog: LogEntry[];
  queuedUserEntries: LogEntry[];
  showThinking: boolean;
  spinTick: number;
  isMobile: boolean;
  /** MCP tool-call card (pending Allow/Deny). */
  mcpApprovalMessage: string | null;
  /** `always_allow` upgrade — third button on the approval card. */
  mcpShowAlwaysAllow?: boolean;
  /** Unsafe tool while always_allow owned — Always allow is one-time only. */
  mcpUnsafePolicyBlocked?: boolean;
  /** Post-allow execute spinner (tool text in `mcpExecutingMessage`). */
  mcpExecutingMessage: string | null;
  onMcpAllow: () => void;
  onMcpDeny: () => void;
}

const TYPE_CLASSES: Record<Exclude<LogEntry['type'], 'tool'>, string> = {
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
  mcpApprovalMessage,
  mcpShowAlwaysAllow,
  mcpUnsafePolicyBlocked,
  mcpExecutingMessage,
  onMcpAllow,
  onMcpAlwaysAllow,
  onMcpDeny,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const initialScrollRef = useRef(true);
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: initialScrollRef.current ? 'instant' : 'smooth',
    });
    initialScrollRef.current = false;
  }, [
    displayLog.length,
    displayLog[displayLog.length - 1]?.id,
    mcpApprovalMessage,
    mcpExecutingMessage,
  ]);

  const spinnerChar = SPIN_FRAMES[spinTick % SPIN_FRAMES.length];
  const spinnerVerb =
    SPIN_VERBS[Math.floor(spinTick / STREAMING.spinnerVerbEvery) % SPIN_VERBS.length];

  let mcpFooter: ReactNode = null;
  if (mcpExecutingMessage) {
    mcpFooter = (
      <div className="text-[11px] text-dimmer border-l-2 border-l-log-info-border pl-[10px]">
        {spinnerChar} {spinnerVerb}...
      </div>
    );
  } else if (mcpApprovalMessage) {
    mcpFooter = (
      <div className="flex flex-col items-end gap-1">
        {mcpUnsafePolicyBlocked && (
          <div className="text-[11px] text-dimmer text-right">
            always allow won&apos;t stick on risky tools
          </div>
        )}
        <div className="flex justify-end items-center gap-2">
          <Button className="mb-0 mr-0" onClick={onMcpDeny} title="deny MCP tool call">
            deny
          </Button>
          <Button className="mb-0 mr-0" onClick={onMcpAllow} title="allow once">
            allow
          </Button>
          {mcpShowAlwaysAllow && (
            <Button
              className="mb-0 mr-0"
              onClick={onMcpAlwaysAllow}
              title={
                mcpUnsafePolicyBlocked
                  ? 'always allow (one-time on risky tools)'
                  : 'always allow'
              }
            >
              always allow
            </Button>
          )}
        </div>
      </div>
    );
  }

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
        {displayLog.map((entry) =>
          entry.type === 'tool' ? (
            <McpToolCallBlock
              key={entry.id}
              tool={entry.text}
              ack={entry.toolAck}
              approved
            />
          ) : (
            <div
              key={entry.id}
              className={'mb-[11px] text-[12px] leading-[1.55] ' + TYPE_CLASSES[entry.type]}
            >
              {entry.text}
            </div>
          ),
        )}
        {showThinking && (
          <div className="px-[10px] py-[7px] text-[11px] text-dimmer border-l-2 border-l-log-info-border mb-[11px]">
            {spinnerChar} {spinnerVerb}...
          </div>
        )}
        {(mcpApprovalMessage || mcpExecutingMessage) && (
          <McpToolCallBlock
            tool={mcpExecutingMessage ?? mcpApprovalMessage!}
            footer={mcpFooter}
          />
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
