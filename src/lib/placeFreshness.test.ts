import { describe, expect, it } from 'vitest';
import { freshnessOf, freshnessShortLabel, monthLabel } from './placeFreshness';

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

describe('freshnessShortLabel', () => {
  it('올해 것이면 달만', () => {
    expect(freshnessShortLabel({ verifiedAt: '2026-09-28' }, now)).toBe('9월 확인');
  });

  it('해가 다르거나 지금을 모르면 해까지', () => {
    expect(freshnessShortLabel({ verifiedAt: '2025-12-20' }, now)).toBe('2025년 12월 확인');
    expect(freshnessShortLabel({ verifiedAt: '2026-09-28' }, null)).toBe('2026년 9월 확인');
  });

  it('해는 KST 로 센다 — UTC 로는 아직 작년인 1월 1일 새벽', () => {
    const newYearMorning = new Date('2027-01-01T02:00:00+09:00').getTime();
    expect(freshnessShortLabel({ verifiedAt: '2027-01-01' }, newYearMorning)).toBe('1월 확인');
  });

  it('상세가 날짜를 안 그리는 곳은 여기서도 안 그린다', () => {
    expect(freshnessShortLabel({}, now)).toBeNull();
    expect(freshnessShortLabel({ verifiedAt: '2026-09-28', openReportKinds: ['closed'] }, now)).toBeNull();
  });
});
