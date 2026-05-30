import type { GameState } from '../types';
import {
  COOLDOWNS,
  LAUNCH_LOC,
  RUN_TESTS,
  THRESHOLDS,
  TOKEN_COSTS,
} from '../game/constants';
import { calcTokenConfig } from '../game/rates';
import { runTestsCost, writeTestCost } from '../game/actions';
import { fmt } from '../lib/format';
import { Button } from './Button';

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
  const cd = (id: string, ms: number) => now - (state.actionCooldowns[id] ?? 0) < ms;
  const { maxTokens } = calcTokenConfig(state.upgrades, state.freeAccounts);
  const hasAiReview = state.upgrades.includes('ai_review');
  const statusRevamped = state.upgrades.includes('revamp_status_page');
  const agentBuffRemaining = Math.max(0, state.agentBuffExpires - Date.now());

  const showPasteError = state.bugs >= THRESHOLDS.showPasteErrorBugs;
  const showKickAgent = state.totalClicks >= THRESHOLDS.showKickAgentClicks;
  const showWriteTests =
    (state.bugs >= THRESHOLDS.showWriteTestsBugs || (state.tests ?? 0) > 0) && !hasAiReview;
  const showTests =
    (state.totalClicks >= THRESHOLDS.showBugsClicks || state.bugs > 0) &&
    state.bugs > THRESHOLDS.showRunTestsBugs &&
    !hasAiReview;
  const showClearContext =
    (state.minTokensSeen ?? 9999) < THRESHOLDS.showClearContextMinTokens ||
    state.totalLoc >= THRESHOLDS.showClearContextLoc;
  const showLaunchBtn = state.totalLoc >= LAUNCH_LOC && !state.launched;
  const showYoloMerge = state.launched && state.totalLoc >= THRESHOLDS.showYoloMergeLoc;
  const showBugBounty =
    statusRevamped &&
    state.bugs > THRESHOLDS.showBugBountyBugs &&
    !state.upgrades.includes('auto_bug_bounty');

  const wTestCost = writeTestCost(state.tests ?? 0);
  const tCost = runTestsCost(state.totalLoc);
  const canWriteTest = state.loc >= wTestCost && state.tokens >= TOKEN_COSTS.writeTest;
  const canRunTests = state.loc >= tCost && state.tokens >= TOKEN_COSTS.tests;

  return (
    <div className="mt-[10px] mb-1 flex flex-col items-start gap-1">
      {showPasteError && (() => {
        const onCD = cd('paste_error', COOLDOWNS.pasteError);
        const cantAfford = state.tokens < TOKEN_COSTS.pasteError;
        const off = onCD || cantAfford;
        return (
          <Button off={off} onClick={off ? undefined : onPasteError} title="paste the error back in">
            paste the error [{TOKEN_COSTS.pasteError}t]
          </Button>
        );
      })()}

      {showWriteTests && (
        <Button
          off={!canWriteTest}
          onClick={canWriteTest ? onWriteTest : undefined}
          title="adds a test, reduces bug generation rate"
        >
          write a test [−{fmt(wTestCost)} loc · {TOKEN_COSTS.writeTest}t]
        </Button>
      )}

      {showKickAgent && (() => {
        const cantAfford = state.tokens < TOKEN_COSTS.agent;
        const buffActive = agentBuffRemaining > 0;
        const off = cantAfford || buffActive;
        return (
          <div className="flex items-baseline gap-2">
            <Button off={off} onClick={off ? undefined : onKickAgent} title="kick off an agent">
              kick off an agent [{TOKEN_COSTS.agent}t]
            </Button>
            {buffActive && (
              <span className="text-dimmer text-[11px]">
                ⚡ active ({Math.ceil(agentBuffRemaining / 1000)}s)
              </span>
            )}
          </div>
        );
      })()}

      {showTests && (
        <Button
          off={!canRunTests}
          onClick={canRunTests ? onRunTests : undefined}
          title={`costs ${fmt(tCost)} loc, fixes ~${Math.round(RUN_TESTS.bugFixFraction * 100)}% of bugs`}
        >
          run tests [−{fmt(tCost)} loc · {TOKEN_COSTS.tests}t]
        </Button>
      )}

      {showClearContext && (() => {
        const cdElapsed = Date.now() - (state.actionCooldowns['clear_context'] ?? 0);
        const onCD = cdElapsed < COOLDOWNS.clearContext;
        const progress = Math.min(1, cdElapsed / COOLDOWNS.clearContext);
        const tokensToRefill = maxTokens - Math.floor(state.tokens);
        return (
          <Button
            off={onCD}
            onClick={onCD ? undefined : onClearContext}
            title="starts a new conversation — refills tokens to max"
            className="relative overflow-hidden"
          >
            {onCD && (
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 bg-green/10 pointer-events-none"
                style={{ width: `${progress * 100}%` }}
              />
            )}
            <span className="relative">
              clear the context{!onCD ? ` [+${tokensToRefill}t]` : ''}
            </span>
          </Button>
        );
      })()}

      {showLaunchBtn && (
        <Button variant="launch" onClick={onLaunch}>
          ship to production
        </Button>
      )}

      {showYoloMerge && (() => {
        const onCD = cd('yolo_merge', COOLDOWNS.yoloMerge);
        const cantAfford = state.tokens < TOKEN_COSTS.yoloMerge;
        const off = onCD || cantAfford;
        return (
          <Button
            variant={off ? 'default' : 'yolo'}
            off={off}
            onClick={off ? undefined : onYoloMerge}
            title="merge without review. what could go wrong."
          >
            yolo merge [{TOKEN_COSTS.yoloMerge}t]
          </Button>
        );
      })()}

      {showBugBounty && (() => {
        const onCD = cd('bug_bounty', COOLDOWNS.bugBounty);
        const cantAfford = state.tokens < TOKEN_COSTS.bugBounty;
        const off = onCD || cantAfford;
        const cdElapsed = Date.now() - (state.actionCooldowns['bug_bounty'] ?? 0);
        const progress = Math.min(1, cdElapsed / COOLDOWNS.bugBounty);
        return (
          <Button
            variant={off ? 'default' : 'bounty'}
            off={off}
            onClick={off ? undefined : onRunBugBounty}
            title="convert bugs into nines"
            className="relative overflow-hidden"
          >
            {onCD && (
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 bg-blue/10 pointer-events-none"
                style={{ width: `${progress * 100}%` }}
              />
            )}
            <span className="relative">run bug bounty [{TOKEN_COSTS.bugBounty}t]</span>
          </Button>
        );
      })()}
    </div>
  );
}
