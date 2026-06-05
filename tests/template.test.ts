import { describe, expect, it } from 'vitest';
import { render } from '../src/lib/template';
import { setRandom } from '../src/game/runtime';

describe('template helpers', () => {
  it('pick chooses by random index', () => {
    setRandom(() => 0);
    expect(render('{{pick "alpha" "beta" "gamma"}}')).toBe('alpha');
    setRandom(() => 0.99);
    expect(render('{{pick "alpha" "beta" "gamma"}}')).toBe('gamma');
  });

  it('hex emits requested length', () => {
    setRandom(() => 0);
    expect(render('{{hex 4}}')).toMatch(/^[0-9a-f]{4}$/);
    expect(render('id-{{hex 8}}')).toMatch(/^id-[0-9a-f]{8}$/);
  });
});
