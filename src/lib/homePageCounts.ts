import { LEVEL_COUNT_LABEL, splitReachable, type TLevelCounts } from './eligibilityCounts';
import { PLACE_TYPES } from './places';
import type { TPetPolicy } from './petPolicy';
import type { TDogProfile, TPlaceType } from '../types';

/**
 * 홈 히어로 "갈 수 있는 곳 N곳" 의 그 곳들 — 종류별로 가능 · 야외를 갈라 둔 것과 두 수(14 W261013.2).
 *
 * `count` 는 W261007.5 의 결정 그대로 `ok + outdoor` 다(야외 자리만 되는 곳도 카드 머리글부터 "갈 수 있어요"). 다만 그 말이 없어
 * 히어로 67곳 · 종류 카드 '가능' 합 54 를 다른 수로 읽었다(haeun-27) — 그래서 `outdoor` 를 같이 내고 히어로가 "… 포함" 으로 말한다.
 * 수 · 시트의 줄 · '야외만' 표식이 전부 이 결과 하나에서 나온다(`splitReachable`).
 */
export type THomePageReach<T> = {
  byType: Record<TPlaceType, { ok: T[]; outdoor: T[] }>;
  count: number;
  outdoor: number;
};

export const homePageReach = <T extends { policy: TPetPolicy }>(
  placesOf: (type: TPlaceType) => readonly T[],
  dog: TDogProfile,
  opts: { needsIndoor?: boolean } = {},
): THomePageReach<T> => {
  const byType = {} as THomePageReach<T>['byType'];
  let count = 0;
  let outdoor = 0;
  for (const type of PLACE_TYPES) {
    const split = splitReachable(placesOf(type), dog, opts);
    byType[type] = split;
    count += split.ok.length + split.outdoor.length;
    outdoor += split.outdoor.length;
  }
  return { byType, count, outdoor };
};

/** 히어로·시트 머리의 덧말. 야외 곳이 없으면 null — "0곳 포함" 은 읽을 거리가 아니다(실내 자리 필요를 켜면 늘 0 이다 — 그때는 `homePageIndoorNote` 가 선다). */
export const homePageReachNote = (outdoor: number): string | null =>
  outdoor > 0 ? `야외 자리만 되는 ${outdoor}곳 포함` : null;

/**
 * '실내 자리 필요'(`needsIndoor`)로 센 수라는 말(14 W261010.22). 꺼져 있으면 null.
 *
 * 그 값은 퍼시스트 전역이고 칩은 둘러보기 필터 시트에만 있다 — 한 번 켜고 잊으면 홈 "갈 수 있는 곳" 이 71 → 57 로 이유 없이 줄었다.
 * `countIfOff` 는 같은 강아지를 `needsIndoor` 없이 센 히어로 수다. 그 수가 지금과 다를 때만 "끄면 N곳" 을 붙인다 — 같으면 끄든 말든
 * 이 강아지의 답은 같아 읽을 거리가 아니다(상세의 `needsIndoorChangedLevel` 이 등급이 바뀐 때만 말하는 것과 같은 어법).
 */
export const homePageIndoorNote = (needsIndoor: boolean, count: number, countIfOff: number): string | null => {
  if (!needsIndoor) return null;
  return countIfOff === count ? '‘실내 자리 필요’ 기준' : `‘실내 자리 필요’ 기준 · 끄면 ${countIfOff}곳`;
};

export type THomeTypeCardSegment = { level: keyof TLevelCounts; label: string; count: number; strong: boolean };

/**
 * 종류 카드 수 줄의 칸들 — 목록 머리와 같은 이름(`LEVEL_COUNT_LABEL`), 같은 순서.
 *
 * - 가능 · 확인 필요는 0 이어도 선다 — "가능 0" 이 그 아이의 답이다. 야외는 1 이상일 때만(W261007.5).
 * - 정보 없음 · 어려움도 센다(14 W261013.2) — 빼면 "31곳 · 가능 10 · 확인 필요 4" 가 나머지 17곳을 말하지 않아 합이 안 맞았다
 *   (junhyuk-05 · minji-19). 목록 머리처럼 0 이면 뺀다. 굵게 세우지 않는다(`strong: false`) — 카드의 답은 가능 쪽이다.
 *
 * 칸의 합은 언제나 `countByLevel` 의 합(= 그 종류 곳 수)이다.
 */
export const homeTypeCardSegments = (counts: TLevelCounts): THomeTypeCardSegment[] => {
  const segment = (level: keyof TLevelCounts, strong: boolean): THomeTypeCardSegment => ({
    level,
    label: LEVEL_COUNT_LABEL[level],
    count: counts[level],
    strong,
  });
  return [
    segment('ok', true),
    ...(counts.outdoor > 0 ? [segment('outdoor', true)] : []),
    segment('cond', true),
    ...(counts.unknown > 0 ? [segment('unknown', false)] : []),
    ...(counts.hard > 0 ? [segment('hard', false)] : []),
  ];
};

/** 종류 카드 수 줄이 읽히는 말 — 보이는 글자와 같다("31곳 중 가능 10 · 확인 필요 4 · 정보 없음 4 · 어려움 13"). 점(·)은 화면에선 aria-hidden 이다. */
export const homeTypeCardCountsLabel = (counts: TLevelCounts, total: number): string =>
  `${total}곳 중 ${homeTypeCardSegments(counts)
    .map((segment) => `${segment.label} ${segment.count}`)
    .join(' · ')}`;
