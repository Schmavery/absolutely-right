import type { GameState } from '../types';
import { action } from '../game/data';
import { calcKickAgentTokenCost, calcTokenConfig } from '../game/rates';
import { runTestsCost, runTestsFixFraction, writeTestCost } from '../game/actions';
import { getMove, rechargeProgress } from '../game/availability';
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
  onLobstagramPost: () => void;
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
  onLobstagramPost,
  onRunBugBounty,
}: Props) {
  const now = Date.now();
  const { maxTokens } = calcTokenConfig(state.upgrades, state.freeAccounts);
  const kickTokenCost = calcKickAgentTokenCost(state.upgrades);
  const agentBuffRemaining = Math.max(0, state.agentBuffExpires - now);

  const A = {
    pasteError: action('paste_error'),
    writeTest: action('write_test'),
    runTests: action('run_tests'),
    kickAgent: action('kick_agent'),
    clearContext: action('clear_context'),
    bugBounty: action('bug_bounty'),
  };

  // All button predicates come from `availability.ts` so a bot driving the
  // game model sees the same legality the human player does.
  const m = {
    pasteError: getMove(state, 'paste_error', now)!,
    writeTest: getMove(state, 'write_test', now)!,
    kickAgent: getMove(state, 'kick_agent', now)!,
    runTests: getMove(state, 'run_tests', now)!,
    clearContext: getMove(state, 'clear_context', now)!,
    launch: getMove(state, 'launch', now)!,
    lobstagramPost: getMove(state, 'lobstagram_post', now)!,
    bugBounty: getMove(state, 'bug_bounty', now)!,
  };

  const wTestCost = writeTestCost(state.tests ?? 0);
  const tCost = runTestsCost(state.totalLoc);

  return (
    <div className="mt-[10px] mb-1 flex flex-col items-start gap-1">
      {m.pasteError.visible && (
        // paste_error's 4s cooldown is just rate-limiting; show one combined
        // bar that fills as either gate (cooldown or token affordability)
        // clears.
        <Button
          off={!m.pasteError.legal}
          onClick={m.pasteError.legal ? onPasteError : undefined}
          title="paste the error back in"
          progress={rechargeProgress(m.pasteError)}
        >
          paste the error [{A.pasteError.tokenCost}t]
        </Button>
      )}

      {m.writeTest.visible && (
        <Button
          off={!m.writeTest.legal}
          onClick={m.writeTest.legal ? onWriteTest : undefined}
          title="adds a test, reduces bug generation rate"
          progress={rechargeProgress(m.writeTest)}
        >
          write a test [−{fmt(wTestCost)} loc · {A.writeTest.tokenCost}t]
        </Button>
      )}

      {m.kickAgent.visible && (() => {
        const buffActive = agentBuffRemaining > 0;
        const kickProgress = rechargeProgress(m.kickAgent);
        return (
          <div className="flex items-baseline gap-2">
            <Button
              off={!m.kickAgent.legal}
              onClick={m.kickAgent.legal ? onKickAgent : undefined}
              title="kick off an agent"
              progress={
                kickProgress === undefined
                  ? undefined
                  : buffActive
                    ? m.kickAgent.cooldownProgress
                    : m.kickAgent.affordProgress
              }
              progressClassName={buffActive ? 'bg-green/10' : undefined}
            >
              kick off an agent [{kickTokenCost}t]
            </Button>
            {buffActive && (
              <span className="text-dimmer text-[11px]">
                ⚡ active ({Math.ceil(agentBuffRemaining / 1000)}s)
              </span>
            )}
          </div>
        );
      })()}

      {m.runTests.visible && (() => {
        const fixPct = Math.round(runTestsFixFraction(state.tests ?? 0) * 100);
        return (
          <Button
            off={!m.runTests.legal}
            onClick={m.runTests.legal ? onRunTests : undefined}
            title={`costs ${fmt(tCost)} loc, fixes ~${fixPct}% of bugs (${state.tests ?? 0} ${(state.tests ?? 0) === 1 ? 'test' : 'tests'})`}
            progress={rechargeProgress(m.runTests)}
          >
            run tests [−{fmt(tCost)} loc · {A.runTests.tokenCost}t]
          </Button>
        );
      })()}

      {m.clearContext.visible && (() => {
        const tokensToRefill = maxTokens - Math.floor(state.tokens);
        return (
          <Button
            off={!m.clearContext.legal}
            onClick={m.clearContext.legal ? onClearContext : undefined}
            title="starts a new conversation — refills tokens to max"
            progress={rechargeProgress(m.clearContext)}
            progressClassName="bg-green/10"
          >
            clear the context{tokensToRefill > 0 ? ` [+${tokensToRefill}t]` : ''}
          </Button>
        );
      })()}

      {m.launch.visible && (
        <Button variant="launch" onClick={onLaunch}>
          ship to production
        </Button>
      )}

      {m.lobstagramPost.visible && (
        <Button
          off={!m.lobstagramPost.legal}
          onClick={m.lobstagramPost.legal ? onLobstagramPost : undefined}
          title="Lobstagram post — fills buzz meter"
          progress={rechargeProgress(m.lobstagramPost)}
        >
          post on Lobstagram [{action('lobstagram_post').tokenCost}t]
        </Button>
      )}

      {m.bugBounty.visible && (() => {
        const onCD = m.bugBounty.cooldownProgress < 1;
        const bountyProgress = rechargeProgress(m.bugBounty);
        return (
          <Button
            variant={m.bugBounty.legal ? 'bounty' : 'default'}
            off={!m.bugBounty.legal}
            onClick={m.bugBounty.legal ? onRunBugBounty : undefined}
            title="convert bugs into nines"
            progress={
              bountyProgress === undefined
                ? undefined
                : onCD
                  ? m.bugBounty.cooldownProgress
                  : m.bugBounty.affordProgress
            }
            progressClassName={onCD ? 'bg-blue/10' : undefined}
          >
            run bug bounty [{A.bugBounty.tokenCost}t]
          </Button>
        );
      })()}
    </div>
  );
}
