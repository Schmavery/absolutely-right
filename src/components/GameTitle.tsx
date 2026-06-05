import { ThinkingIcon } from './ThinkingIcon';

export function GameTitle() {
  return (
    <div className="text-title mb-[2px] tracking-[0.04em] flex items-center gap-[0.4em]">
      <ThinkingIcon className="h-[1.15em] w-[1.15em] flex-shrink-0" />
      <span>extra thinking</span>
    </div>
  );
}
