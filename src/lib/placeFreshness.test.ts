import { describe, expect, it } from 'vitest';
import { freshnessOf, freshnessShortLabel, monthLabel } from './placeFreshness';
import { PLACES } from './places';

const now = new Date('2026-10-01T12:00:00+09:00').getTime();

describe('freshnessOf', () => {
  it('확인한 달을 말한다', () => {
    expect(freshnessOf({ verifiedAt: '2026-09-28' }, now)).toEqual({ text: '2026년 9월에 확인했어요', stale: false });
  });

  it('방법을 알면 날짜 앞에 붙이고, 모르면 날짜만 말한다(14 W261007.17)', () => {
    expect(freshnessOf({ verifiedAt: '2026-09-28', verifiedMethod: 'review' }, now)?.text).toBe('2026년 9월에 후기를 보고 확인했어요');
    expect(freshnessOf({ verifiedAt: '2026-09-28', verifiedMethod: 'phone' }, now)?.text).toBe('2026년 9월에 전화로 확인했어요');
    expect(freshnessOf({ verifiedAt: '2025-09-01', verifiedMethod: 'visit' }, now)?.text).toBe(
      '2025년 9월에 직접 가서 마지막으로 확인했어요. 1년이 넘어 지금은 다를 수 있어요',
    );
    // 날짜 없이 방법만으로는 그리지 않는다. 타입 밖 값은 날짜만.
    expect(freshnessOf({ verifiedMethod: 'report' }, now)).toBeNull();
    expect(freshnessOf({ verifiedAt: '2026-09-28', verifiedMethod: 'x' as never }, now)?.text).toBe('2026년 9월에 확인했어요');
    // 카드·시트의 짧은 꼬리표는 방법을 말하지 않는다(메타 줄이 말줄임에 먼저 걸린다).
    expect(freshnessShortLabel({ verifiedAt: '2026-09-28', verifiedMethod: 'phone' }, now)).toBe('9월 확인');
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

  it('원문에 동반 조건이 없으면(정보 없음 · 못 읽음) "확인했어요" 를 안 쓴다 — 확인할 조건이 없다(14 W261007.17)', () => {
    expect(freshnessOf({ verifiedAt: '2026-09-20', policy: { noInfo: true, unread: false } }, now)).toBeNull();
    expect(freshnessOf({ verifiedAt: '2026-09-20', policy: { noInfo: false, unread: true } }, now)).toBeNull();
    expect(freshnessOf({ verifiedAt: '2026-09-20', policy: { noInfo: false, unread: false } }, now)?.text).toBe('2026년 9월에 확인했어요');
  });

  it('실제 데이터 — 서쪽에서 귤이네("정보 없음.")는 상세·꼬리표 둘 다 안 그린다', () => {
    const place = PLACES.find((entry) => entry.name === '서쪽에서 귤이네');
    expect(place?.verifiedAt).toBeDefined();
    expect(freshnessOf(place!, now)).toBeNull();
    expect(freshnessShortLabel(place!, now)).toBeNull();
  });
});

describe('monthLabel', () => {
  it('날은 쓰지 않는다', () => {
    expect(monthLabel('2026-01-05')).toBe('2026년 1월');
  });
});

describe('freshnessShortLabel', () => {
  it('올해 것은 달만, 해가 다르면 해를 붙인다', () => {
    expect(freshnessShortLabel({ verifiedAt: '2026-09-28' }, now)).toBe('9월 확인');
    expect(freshnessShortLabel({ verifiedAt: '2025-12-20' }, now)).toBe('2025년 12월 확인');
  });

  it('지금을 모르면(정적 첫 프레임) 해를 붙인다', () => {
    expect(freshnessShortLabel({ verifiedAt: '2026-09-28' }, null)).toBe('2026년 9월 확인');
    expect(freshnessShortLabel({ verifiedAt: '2026-09-28' })).toBe('2026년 9월 확인');
  });

  it('해는 한국 날짜로 센다 — UTC 12/31 은 이미 KST 1/1', () => {
    const newYearKst = new Date('2027-01-01T00:30:00+09:00').getTime();
    expect(freshnessShortLabel({ verifiedAt: '2026-12-20' }, newYearKst)).toBe('2026년 12월 확인');
    expect(freshnessShortLabel({ verifiedAt: '2027-01-01' }, newYearKst)).toBe('1월 확인');
  });

  it('상세가 날짜를 안 그리는 곳은 여기서도 안 그린다', () => {
    expect(freshnessShortLabel({}, now)).toBeNull();
    expect(freshnessShortLabel({ verifiedAt: '2026-09-28', openReportKinds: ['closed'] }, now)).toBeNull();
  });
});
