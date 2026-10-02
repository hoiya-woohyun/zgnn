import { describe, expect, it } from 'vitest';
import { freshnessOf, monthLabel } from './placeFreshness';

const now = new Date('2026-10-01T12:00:00+09:00').getTime();

describe('freshnessOf', () => {
  it('확인한 달을 말한다', () => {
    expect(freshnessOf({ verifiedAt: '2026-09-28' }, now)).toEqual({ text: '2026년 9월에 확인했어요', stale: false });
  });

  it('1년이 넘으면 톤을 낮춘다', () => {
    expect(freshnessOf({ verifiedAt: '2025-09-01' }, now)?.stale).toBe(true);
    expect(freshnessOf({ verifiedAt: '2025-09-01' }, now)?.text).toContain('다를 수 있어요');
  });

  it('지금을 모르면(정적 HTML) 오래됐는지 묻지 않는다', () => {
    expect(freshnessOf({ verifiedAt: '2020-01-01' }, null)?.stale).toBe(false);
  });

  it('확인 기록이 없거나 열린 폐업 제보가 있으면 그리지 않는다', () => {
    expect(freshnessOf({}, now)).toBeNull();
    expect(freshnessOf({ verifiedAt: '2026-09-28', openReportKinds: ['closed'] }, now)).toBeNull();
    expect(freshnessOf({ verifiedAt: 'bad' }, now)).toBeNull();
  });
});

describe('monthLabel', () => {
  it('날은 쓰지 않는다', () => {
    expect(monthLabel('2026-01-05')).toBe('2026년 1월');
  });
});
