import { isOutdoorSeatOnly, type TEligibility } from './eligibility';
import { withJosa } from './korean';

/*
 * 지도 원 마커가 판정을 말하는 방법(14 W261019.14f) — **원의 색은 종류 몫**이라(ADR-008 「마커」, 지도가 답하는 단 하나)
 * 판정은 두 번째 표시로 얹는다. 저장 하트 배지(오른쪽 위)가 선례다.
 *
 * - 'ok'(야외 자리만 되는 곳 포함) — 아무것도 없다(기본 모양).
 * - 'cond'(확인이 필요해요) · 'unknown'(정보 없음) — **원 오른쪽 아래에 점**.
 * - 'hard' — 흐림(`MARKER_HARD_OPACITY`, 그대로). 점은 달지 않는다.
 *
 * 흐림만 있던 동안 '확인 필요'(4kg 기준 122곳 중 47곳 · 가능 60)가 '갈 수 있어요' 와 같은 원이었다(haeun-24a).
 * **야외 자리만은 점이 없다**(22 G3.0) — 목록이 그곳을 '갈 수 있어요 · 야외 자리만'(판정은 갈 수 있음, 야외는 조건)으로 말하고,
 * 셈(`isReachable`)도 갈 수 있는 곳에 넣는다. 예전엔 목록 배지가 야외만을 확인 필요와 같은 주황으로 묶어 점도 그랬다.
 * 무엇인지는 누르면 시트가, 스크린리더엔 마커 이름이 말한다.
 */

/** 원 오른쪽 아래의 점. 'ok'·'hard'·판정 없음(강아지 미등록)이면 없다. */
export type TMapPageMarkerDot = 'cond' | 'unknown';

export const mapPageMarkerDot = (eligibility: TEligibility | undefined): TMapPageMarkerDot | null => {
  if (eligibility?.level === 'unknown') return 'unknown';
  if (eligibility?.level === 'cond' && !isOutdoorSeatOnly(eligibility)) return 'cond';
  return null;
};

/**
 * 점 색 — 목록 판정 글자색과 같은 값이다(`VERDICT_TEXT_CLASS`): cond = `--color-text-warning-primary`, unknown =
 * `--color-text-tertiary`. 마커는 data URI 라 CSS 변수를 못 읽어 hex 를 한 번 더 적는다(`SAVED_MARKER_COLOR` 와 같은 사정) —
 * 테스트가 theme.css 의 토큰 사슬을 따라가 대 본다.
 */
export const MARKER_DOT_COLOR: Record<TMapPageMarkerDot, string> = {
  cond: '#8a5a11',
  unknown: '#605953',
};

/**
 * 다시 셀 때마다 캔버스가 알리는 **지금 그려진** 판정 표시. 범례는 목록이 아니라 이것을 따른다 — 목록으로 세던 동안 어려운 곳이
 * 모두 섞인 묶음 속이면 흐린 것이 하나도 없는데 범례만 떴다(ADR-008 v32, 6kg · 줌 10 실측).
 */
export type TMapPageMarkerShown = {
  /** 흐린 것 — 혼자 선 '어려움' 원 · 모두 어려운 묶음. */
  dim: boolean;
  /** 점이 붙은 원. 고른 핀은 점을 달지 않으므로 세지 않는다. */
  dot: boolean;
  /** 묶음 원 안에 흐림·점이 될 곳이 숨어 있다 — 섬 전체(기본 줌)는 대부분 묶음이라 판정이 하나도 안 보인다. */
  hidden: boolean;
};

export const MAP_PAGE_MARKER_NOTHING_SHOWN: TMapPageMarkerShown = { dim: false, dot: false, hidden: false };

export const sameMapPageMarkerShown = (a: TMapPageMarkerShown, b: TMapPageMarkerShown): boolean =>
  a.dim === b.dim && a.dot === b.dot && a.hidden === b.hidden;

export type TMapPageMarkerLegendLine = { kind: 'dim' | 'dot' | 'zoom'; text: string };

/**
 * 범례 줄 — **그려진 표시만** 말한다(종류를 바꿔 다 사라졌는데 범례만 남으면 찾게 만든다, ADR-008 v26).
 * 표시가 전부 묶음 속이면 그 대신 확대하라는 한 줄: 섬 전체 화면은 묶음 원뿐이라 강아지를 등록해도 등록 전과 똑같아 보였다(haeun-28a).
 * 강아지가 없으면(`dogNames` 빈 값) 판정이 없어 아무 줄도 없다.
 *
 * 점 줄에 '확인' 을 쓰지 않는 이유: 점은 '확인이 필요해요' 와 '확인된 정보가 없어요' 둘에 붙는다 — 정보 없음은 확인할 조건이 아니라 조건이 없는 곳이다.
 */
export function mapPageMarkerLegendLines(shown: TMapPageMarkerShown, dogNames: string): TMapPageMarkerLegendLine[] {
  if (!dogNames) return [];
  const lines: TMapPageMarkerLegendLine[] = [];
  if (shown.dim) lines.push({ kind: 'dim', text: `흐린 곳은 ${dogNames}에게 어려워요` });
  if (shown.dot) lines.push({ kind: 'dot', text: '점이 붙은 곳은 조건을 봐야 해요' });
  if (lines.length === 0 && shown.hidden) {
    lines.push({ kind: 'zoom', text: `확대하면 ${withJosa(dogNames, '이/가')} 갈 수 있는지 보여요` });
  }
  return lines;
}
