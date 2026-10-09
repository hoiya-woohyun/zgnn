import { describe, expect, it } from 'vitest';
import { nextStepText, type TNextStep } from './adminNextStep';

const STEPS: TNextStep[] = ['reread', 'backlog', 'collectQueued'];

describe('nextStepText', () => {
  it('서버 워커를 깨우는 빌드에서는 터미널 명령을 말하지 않는다', () => {
    for (const step of STEPS) {
      expect(nextStepText(step, true)).not.toMatch(/pnpm|터미널/);
      expect(nextStepText(step, true)).toContain('서버 워커');
    }
  });

  it('깨울 주소가 없는 빌드(로컬 dev)에서는 터미널 명령을 말한다', () => {
    for (const step of STEPS) expect(nextStepText(step, false)).toContain('pnpm data');
  });

  it('기본값은 빌드의 깨우기 주소를 따른다 — 테스트 환경엔 주소가 없다', () => {
    expect(nextStepText('reread')).toBe(nextStepText('reread', false));
  });
});
