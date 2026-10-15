import { describe, expect, it } from 'vitest';
import { mapFailureCopy } from './mapFailureCopy';

describe('mapFailureCopy', () => {
  it('오프라인과 그 밖을 다른 제목으로 가른다', () => {
    expect(mapFailureCopy(false).title).not.toBe(mapFailureCopy(true).title);
  });

  it('온라인 실패는 인터넷·연결을 탓하지 않는다 — 영구 고장이 오프라인 문제로 보고된다(ADR-008)', () => {
    const { title, description } = mapFailureCopy(true);
    expect(`${title} ${description}`).not.toMatch(/인터넷|연결/);
  });

  it('온라인 실패는 다시 시도하라고 약속하지 않는다 — 인증 거부는 새로고침 전까지 sticky 다', () => {
    const { title, description } = mapFailureCopy(true);
    expect(`${title} ${description}`).not.toMatch(/다시|잠시/);
  });
});
