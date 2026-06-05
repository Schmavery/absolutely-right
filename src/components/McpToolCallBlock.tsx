import type { ReactNode } from 'react';

interface Props {
  tool: string;
  ack?: string;
  footer?: ReactNode;
  /** Persistent log entry after approval — minimal chrome. */
  approved?: boolean;
}

/** Shared card for pending MCP approval, execute spinner, and approved `tool` log lines. */
export function McpToolCallBlock({ tool, ack, footer, approved = false }: Props) {
  if (approved) {
    return (
      <div className="mb-[9px] border border-border/80 rounded-sm px-2 py-[6px]">
        <div className="text-dimmer text-[10px] tracking-[0.1em] uppercase mb-[5px]">tool call</div>
        <div className="text-[11px] leading-[1.45] text-dim whitespace-pre-wrap">{tool}</div>
        {ack && (
          <div className="text-[11px] text-dim mt-2 pt-2 border-t border-border/60 whitespace-pre-wrap">
            {ack}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-[11px] border border-card-border bg-card-bg px-[10px] pt-2 pb-2">
      <div className="text-dimmer text-[10px] tracking-[0.12em] uppercase mb-[7px]">tool call</div>
      <div className="text-[12px] leading-[1.55] mb-3 pl-[10px] border-l-2 border-l-log-event-border text-log-event whitespace-pre-wrap">
        {tool}
      </div>
      {ack && (
        <div className="text-[11px] text-dim border-l-2 border-l-log-info-border pl-[10px] mb-3">
          {ack}
        </div>
      )}
      {footer}
    </div>
  );
}
