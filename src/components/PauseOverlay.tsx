type PauseOverlayProps = {
  message: string;
  /** Block clicks when another tab owns the game (this tab is visible). */
  blockInput?: boolean;
};

export function PauseOverlay({ message, blockInput = false }: PauseOverlayProps) {
  return (
    <div
      className={[
        'fixed inset-0 z-40 flex items-center justify-center bg-bg/85 backdrop-blur-[2px]',
        blockInput ? 'pointer-events-auto' : 'pointer-events-none',
      ].join(' ')}
      aria-hidden={!blockInput}
    >
      <p className="text-dimmer text-[12px]">{message}</p>
    </div>
  );
}
