import { describe, expect, it } from 'vitest';
import {
  calcKickAgentTokenCost,
  calcPasteErrorFixChance,
  calcPasteErrorTokenCost,
  calcPromptTokenCost,
  formatPasteErrorLog,
  pasteErrorButtonLabel,
} from '../src/game/rates';

describe('action token costs', () => {
  it('prompt starts at 7 tokens', () => {
    expect(calcPromptTokenCost([])).toBe(7);
  });

  it('Faster Inference bumps prompt to 10 tokens', () => {
    expect(calcPromptTokenCost(['model_update_1'])).toBe(10);
  });

  it('Prompt Engineering adds 2 tokens per prompt', () => {
    expect(calcPromptTokenCost(['better_prompts'])).toBe(9);
  });

  it('prompt token bonuses stack', () => {
    expect(calcPromptTokenCost(['model_update_1', 'better_prompts'])).toBe(12);
  });

  it('paste_error starts at 10 tokens', () => {
    expect(calcPasteErrorTokenCost([])).toBe(10);
  });

  it('/fix-bug Skill bumps paste_error to 15 tokens', () => {
    expect(calcPasteErrorTokenCost(['fix_bug_skill'])).toBe(15);
  });

  it('kick_agent stays at 60 without harness', () => {
    expect(calcKickAgentTokenCost([])).toBe(60);
  });

  it('Subagent Harness bumps kick_agent to 90 tokens', () => {
    expect(calcKickAgentTokenCost(['subagent_harness'])).toBe(90);
  });
});

describe('paste_error fix chance', () => {
  it('starts at 50%', () => {
    expect(calcPasteErrorFixChance([])).toBe(0.5);
  });

  it('/fix-bug Skill raises fix chance to 75%', () => {
    expect(calcPasteErrorFixChance(['fix_bug_skill'])).toBe(0.75);
  });
});

describe('paste_error button label', () => {
  it('says paste the error before the skill', () => {
    expect(pasteErrorButtonLabel([])).toBe('paste the error');
  });

  it('says /fix-bug after the skill is installed', () => {
    expect(pasteErrorButtonLabel(['fix_bug_skill'])).toBe('/fix-bug');
  });
});

describe('paste_error log format', () => {
  const sample = "> here's the error\nI see the issue — fixed.";
  const meta = '[Pasted text #2 · 5 lines]';

  it('appends pasted-text meta only before the skill', () => {
    expect(formatPasteErrorLog(sample, [], meta)).toBe(
      "> here's the error [Pasted text #2 · 5 lines]\nI see the issue — fixed.",
    );
  });

  it('prepends /fix-bug on the user line after the skill', () => {
    expect(formatPasteErrorLog(sample, ['fix_bug_skill'], meta)).toBe(
      "> /fix-bug here's the error [Pasted text #2 · 5 lines]\nI see the issue — fixed.",
    );
  });
});
