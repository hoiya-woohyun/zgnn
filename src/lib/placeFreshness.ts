/**
 * "이 정보가 언제 것인가" — 상세의 확인 날짜 한 줄(docs/todo/10 F3 · 07 P1 「데이터 신선도」 · ADR-021 R5). 순수.
 *
 * 노령견 보호자(은서)의 말이 출발점이다 — "정보는 바뀔 수 있어요" 는 경고가 아니라 부담이고, **올해 것인지만 알려 주면 전화를 한 번 덜 한다.**
 *
 * 그리지 않는 경우가 셋이다:
 *  - 확인 기록이 없다(`verifiedAt` 없음). 지어낸 날짜는 없는 날짜보다 나쁘다.
 *  - 열린 폐업 제보가 있다(`openReportKinds`). 확인됐다고 말하는 순간 제보가 거짓이 된다.
 *  - 원문에 동반 조건이 없다(`policy.noInfo` — "정보 없음. 문의해 보세요" · `unread` — 적혀는 있는데 읽을 조건이 없다, 14 W261007.17).
 *    이 줄은 반려동물 이용 카드 맨 아래라 "확인했어요" 가 **조건을 확인했다** 로 읽힌다 — 확인할 조건이 없는데 그렇게 말하면 거짓이다.
 *    판정 레벨(강아지마다 다르다)이 아니라 원문의 플래그로 가른다. 일반 허용 문장뿐(`genericOnly`)은 그린다 — "동반 가능" 은 확인한 사실이다.
 * "누가·무엇으로"(후기·전화·현장)는 적지 않는다 — 날짜를 찍는 길 셋(시드 버튼·승인·사실 칸 수정)이 방법을 남기지 않는다.
 * 날짜만 보인다 — 건수·제보 내용은 보이지 않는다(후기 서비스가 아니다).
 */

/** 1년이 넘으면 톤을 낮춘다 — 날짜는 그대로 말하되 "오래됐을 수 있다" 를 붙인다. */
export const STALE_AFTER_DAYS = 365;

export type TFreshness = {
  /** "2026년 10월에 확인했어요" */
  text: string;
  stale: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` → "2026년 10월". 날은 안 쓴다 — 날까지 쓰면 정밀해 보여서 오히려 그날만 맞는 말로 읽힌다. */
export function monthLabel(day: string): string | null {
  const matched = /^(\d{4})-(\d{2})-\d{2}$/.exec(day);
  if (!matched) return null;
  return `${matched[1]}년 ${Number(matched[2])}월`;
}

/**
 * 장소 → 확인 날짜 한 줄. `now` 가 null 이면(정적 HTML 을 그리는 순간 — 지금이 언제인지 모른다) 오래됐는지는 묻지 않는다.
 */
type TFreshnessInput = {
  verifiedAt?: string;
  openReportKinds?: string[];
  policy?: { noInfo: boolean; unread: boolean };
};

export function freshnessOf(place: TFreshnessInput, now: number | null): TFreshness | null {
  if (!place.verifiedAt || (place.openReportKinds?.length ?? 0) > 0) return null;
  if (place.policy?.noInfo || place.policy?.unread) return null;
  const label = monthLabel(place.verifiedAt);
  if (!label) return null;
  const verified = new Date(`${place.verifiedAt}T00:00:00+09:00`).getTime();
  const stale = now !== null && now - verified > STALE_AFTER_DAYS * DAY_MS;
  return stale
    ? { text: `${label}에 마지막으로 확인했어요. 1년이 넘어 지금은 다를 수 있어요`, stale }
    : { text: `${label}에 확인했어요`, stale };
}

/**
 * 목록 카드·지도 시트의 짧은 꼬리표 — "9월 확인"(경쟁 비교 C2610.3: 신뢰가 차별점인데 상세에 들어가야 보였다).
 * 올해 것이면 달만, 아니면 해까지 붙인다 — 해가 바뀌었는데 "9월 확인" 이면 작년 9월이 올해 것으로 읽힌다.
 * 지금을 모르면(정적 HTML) 해까지 붙인 쪽이 안전하다. 그리지 않는 경우는 `freshnessOf` 와 같다.
 */
export function freshnessShortLabel(place: TFreshnessInput, now: number | null): string | null {
  if (!freshnessOf(place, now) || !place.verifiedAt) return null;
  const [year, month] = place.verifiedAt.split('-').map(Number);
  const thisYear = now === null ? null : new Date(now + 9 * 60 * 60 * 1000).getUTCFullYear();
  return year === thisYear ? `${month}월 확인` : `${year}년 ${month}월 확인`;
}
