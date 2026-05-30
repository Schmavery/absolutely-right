import type { GameState } from '../types';
import { action } from '../game/data';
import { deriveGame } from '../game/derive';
import { calcTokenConfig } from '../game/rates';
import { runTestsCost, writeTestCost } from '../game/actions';
import { fmt } from '../lib/format';
import { Button } from './Button';

/** Min ratio across one or more (have/need) requirements, clamped to [0, 1]. */
function resourceProgress(...ratios: number[]): number {
  return Math.max(0, Math.min(1, ...ratios));
}

interface Props {
  state: GameState;
  onPasteError: () => void;
  onWriteTest: () => void;
  onKickAgent: () => void;
  onRunTests: () => void;
  onClearContext: () => void;
  onLaunch: () => void;
  onYoloMerge: () => void;
  onRunBugBounty: () => void;
}

export function ActionBar({
  state,
  onPasteError,
  onWriteTest,
  onKickAgent,
  onRunTests,
  onClearContext,
  onLaunch,
  onYoloMerge,
  onRunBugBounty,
}: Props) {
  const now = Date.now();
  const { ui } = deriveGame(state);
  const { maxTokens } = calcTokenConfig(state.upgrades, state.freeAccounts);
  const agentBuffRemaining = Math.max(0, state.agentBuffExpires - Date.now());

  const A = {
    pasteError: action('paste_error'),
    writeTest: action('write_test'),
    runTests: action('run_tests'),
    kickAgent: action('kick_agent'),
    clearContext: action('clear_context'),
    yoloMerge: action('yolo_merge'),
    bugBounty: action('bug_bounty'),
  };

  const wTestCost = writeTestCost(state.tests ?? 0);
  const tCost = runTestsCost(state.totalLoc);
  const canWriteTest = state.loc >= wTestCost && state.tokens >= A.writeTest.tokenCost!;
  const canRunTests = state.loc >= tCost && state.tokens >= A.runTests.tokenCost!;

  return (
    <div className="mt-[10px] mb-1 flex flex-col items-start gap-1">
      {ui.showPasteError && (() => {
        // paste_error's 4s cooldown is just rate-limiting (vs. the deliberate
        // 20–30s "system busy" cooldowns on yolo/bounty/clear_context), so
        // show a single combined dim bar that fills as either gate clears.
        const cdElapsed = now - (state.actionCooldowns['paste_error'] ?? 0);
        const onCD = cdElapsed < A.pasteError.cooldownMs!;
        const cantAfford = state.tokens < A.pasteError.tokenCost!;
        const off = onCD || cantAfford;
        const progress = resourceProgress(
          cdElapsed / A.pasteError.cooldownMs!,
          state.tokens / A.pasteError.tokenCost!,
        );
        return (
          <Button
            off={off}
            onClick={off ? undefined : onPasteError}
            title="paste the error back in"
            progress={progress}
          >
            paste the error [{A.pasteError.tokenCost}t]
          </Button>
        );
      })()}

      {ui.showWriteTests && (
        <Button
          off={!canWriteTest}
          onClick={canWriteTest ? onWriteTest : undefined}
          title="adds a test, reduces bug generation rate"
          progress={resourceProgress(
            state.loc / wTestCost,
            state.tokens / A.writeTest.tokenCost!,
          )}
        >
          write a test [−{fmt(wTestCost)} loc · {A.writeTest.tokenCost}t]
        </Button>
      )}

      {ui.showKickAgent && (() => {
        const cantAfford = state.tokens < A.kickAgent.tokenCost!;
        const buffActive = agentBuffRemaining > 0;
        const off = cantAfford || buffActive;
        // While the buff is active, fill bar over the buff duration (button is
        // "off" but for a time-based reason, so use the cooldown color).
        const progress = buffActive
          ? 1 - agentBuffRemaining / A.kickAgent.buffMs!
          : resourceProgress(state.tokens / A.kickAgent.tokenCost!);
        return (
          <div className="flex items-baseline gap-2">
            <Button
              off={off}
              onClick={off ? undefined : onKickAgent}
              title="kick off an agent"
              progress={progress}
              progressClassName={buffActive ? 'bg-green/10' : undefined}
            >
              kick off an agent [{A.kickAgent.tokenCost}t]
            </Button>
            {buffActive && (
              <span className="text-dimmer text-[11px]">
                ⚡ active ({Math.ceil(agentBuffRemaining / 1000)}s)
              </span>
            )}
          </div>
        );
      })()}

      {ui.showRunTests && (
        <Button
          off={!canRunTests}
          onClick={canRunTests ? onRunTests : undefined}
          title={`costs ${fmt(tCost)} loc, fixes ~${Math.round(A.runTests.bugFixFraction! * 100)}% of bugs`}
          progress={resourceProgress(
            state.loc / tCost,
            state.tokens / A.runTests.tokenCost!,
          )}
        >
          run tests [−{fmt(tCost)} loc · {A.runTests.tokenCost}t]
        </Button>
      )}

      {ui.showClearContext && (() => {
        const cdElapsed = now - (state.actionCooldowns['clear_context'] ?? 0);
        const onCD = cdElapsed < A.clearContext.cooldownMs!;
        const progress = onCD ? cdElapsed / A.clearContext.cooldownMs! : 1;
        const tokensToRefill = maxTokens - Math.floor(state.tokens);
        return (
          <Button
            off={onCD}
            onClick={onCD ? undefined : onClearContext}
            title="starts a new conversation — refills tokens to max"
            progress={progress}
            progressClassName="bg-green/10"
          >
            clear the context{!onCD ? ` [+${tokensToRefill}t]` : ''}
          </Button>
        );
      })()}

      {ui.showLaunchBtn && (
        <Button variant="launch" onClick={onLaunch}>
          ship to production
        </Button>
      )}

      {ui.showYoloMerge && (() => {
        const cdElapsed = now - (state.actionCooldowns['yolo_merge'] ?? 0);
        const onCD = cdElapsed < A.yoloMerge.cooldownMs!;
        const cantAfford = state.tokens < A.yoloMerge.tokenCost!;
        const off = onCD || cantAfford;
        const progress = onCD
          ? cdElapsed / A.yoloMerge.cooldownMs!
          : resourceProgress(state.tokens / A.yoloMerge.tokenCost!);
        return (
          <Button
            variant={off ? 'default' : 'yolo'}
            off={off}
            onClick={off ? undefined : onYoloMerge}
            title="merge without review. what could go wrong."
            progress={progress}
            progressClassName={onCD ? 'bg-purple/10' : undefined}
          >
            yolo merge [{A.yoloMerge.tokenCost}t]
          </Button>
        );
      })()}

      {ui.showBugBounty && (() => {
        const cdElapsed = now - (state.actionCooldowns['bug_bounty'] ?? 0);
        const onCD = cdElapsed < A.bugBounty.cooldownMs!;
        const cantAfford = state.tokens < A.bugBounty.tokenCost!;
        const off = onCD || cantAfford;
        const progress = onCD
          ? cdElapsed / A.bugBounty.cooldownMs!
          : resourceProgress(state.tokens / A.bugBounty.tokenCost!);
        return (
          <Button
            variant={off ? 'default' : 'bounty'}
            off={off}
            onClick={off ? undefined : onRunBugBounty}
            title="convert bugs into nines"
            progress={progress}
            progressClassName={onCD ? 'bg-blue/10' : undefined}
          >
            run bug bounty [{A.bugBounty.tokenCost}t]
          </Button>
        );
      })()}
    </div>
  );
}
