import { describe, expect, it } from 'vitest';
import { nextStepText, type TNextStep } from './adminNextStep';

const STEPS: TNextStep[] = ['reread', 'backlog', 'collectQueued', 'stranded'];
/** 서버가 받아 가는 길이 없어 두 빌드가 같은 터미널 문장을 말하는 갈래 */
const TERMINAL_ONLY: TNextStep[] = ['applyFailed', 'collectStale'];

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

  it('서버 길이 없는 갈래는 두 빌드 다 터미널 문장이다', () => {
    for (const step of TERMINAL_ONLY) {
      expect(nextStepText(step, true)).toBe(nextStepText(step, false));
      expect(nextStepText(step, true)).toContain('터미널에서 pnpm data');
    }
  });

  it('실행 기록 문장 — 서버 빌드는 noRuns 에 pnpm 이 없고, rerun 은 서버 길이 없는 수집 때문에 터미널도 말한다', () => {
    expect(nextStepText('noRuns', true)).not.toMatch(/pnpm|터미널/);
    expect(nextStepText('noRuns', false)).toContain('pnpm data collect');
    expect(nextStepText('rerun', true)).toContain('「서버에서 반영」');
    expect(nextStepText('rerun', false)).toBe('다시 돌릴 일은 터미널에서 해요');
  });

  it('끊긴 반영의 서버 문장은 /admin 머리글의 버튼 이름을 그대로 적는다', () => {
    expect(nextStepText('stranded', true)).toContain('「서버에서 반영」');
    expect(nextStepText('stranded', false)).toContain('pnpm data apply');
  });

  it('기본값은 빌드의 깨우기 주소를 따른다 — 테스트 환경엔 주소가 없다', () => {
    expect(nextStepText('reread')).toBe(nextStepText('reread', false));
  });
});
