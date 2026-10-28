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
 * "무엇으로"(`verifiedMethod` — 후기·전화·현장·제보)는 **알 때만** 날짜 앞에 붙는다(14 W261007.17). 모르면(null · 방법 칸이 없던 때 찍힌 날짜) 날짜만 말한다 — 지어낸 방법은 없는 방법보다 나쁘다.
 * 날짜만 보인다 — 건수·제보 내용은 보이지 않는다(후기 서비스가 아니다).
 */

import type { TVerifiedMethod } from '../types';

/** "2026년 9월에 ___ 확인했어요" 의 빈칸. 후기는 "읽고" 라고 말한다 — 우리가 가 본 것이 아니라 글을 읽은 것이다(가장 흔한 길이라 정직이 중요하다). */
export const VERIFIED_METHOD_PHRASE: Record<TVerifiedMethod, string> = {
  review: '후기를 보고',
  phone: '전화로',
  visit: '직접 가서',
  report: '제보로',
};

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
  verifiedMethod?: TVerifiedMethod;
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
  // 모르는 값(타입 밖)은 날짜만 — `?.` 가 undefined 를 돌려준다.
  const how = place.verifiedMethod ? VERIFIED_METHOD_PHRASE[place.verifiedMethod] : undefined;
  const by = how ? `${how} ` : '';
  return stale
    ? { text: `${label}에 ${by}마지막으로 확인했어요. 1년이 넘어 지금은 다를 수 있어요`, stale }
    : { text: `${label}에 ${by}확인했어요`, stale };
}

/** 지금(`now`)의 해 — 한국 날짜 기준(`verifiedAt` 도 KST 날짜라 UTC 로 보면 연말·연초에 하루가 어긋난다). */
function yearOf(now: number): number {
  return new Date(now + 9 * 60 * 60 * 1000).getUTCFullYear();
}

/**
 * 목록 카드·지도 시트의 짧은 꼬리표 — "9월 확인"(경쟁 비교 C2610.3: 신뢰가 차별점인데 상세에 들어가야 보였다).
 * **올해 것이면 달만, 해가 다르면 해를 붙인다**("2025년 12월 확인"). 지금(`now`)을 모르면(정적 첫 프레임) 해를 붙인다 — 올해인지 모르는데 해를 빼면 거짓이 될 수 있다.
 * 해를 항상 붙이던 때가 있었다(14 W261019.18a — "9월에 가라는 건지" 로 읽혔다). 22 G3.0a 가 메타 한 줄이 말줄임에 먼저 걸리는 것(A-16)을 이유로 되돌렸다:
 * 올해 것은 해가 군더더기이고, 연도 없는 달이 "가라는 달" 로 읽히는지는 다음 /ux-eval 에서 본다. 상세의 "2026년 9월에 확인했어요" 는 그대로다.
 * 그리지 않는 경우는 `freshnessOf` 와 같다.
 */
export function freshnessShortLabel(place: TFreshnessInput, now?: number | null): string | null {
  if (!freshnessOf(place, now ?? null) || !place.verifiedAt) return null;
  const label = monthLabel(place.verifiedAt);
  if (!label) return null;
  const sameYear = now != null && Number(place.verifiedAt.slice(0, 4)) === yearOf(now);
  return `${sameYear ? label.replace(/^\d{4}년 /, '') : label} 확인`;
}
