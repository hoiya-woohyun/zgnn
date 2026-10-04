/**
 * **최신본으로 저장하기**의 미리보기 — 기존 장소(`places` 행)를 후보의 최신 분석 값으로 덮으면 어느 칸이 무엇에서 무엇으로 바뀌나.
 *
 * 덮는 규칙은 `overwriteWithLatest`(scripts/analyze/applyApproved.mjs) 하나가 정하고 여기서는 **그 patch 를 사람 말로만** 옮긴다.
 * 규칙을 여기서 다시 쓰면 미리보기와 실제 쓰기가 어긋나고, 그 어긋남은 "본 것과 다른 것이 덮였다" 가 된다 —
 * 이 버튼은 되돌리기 어려운 덮어쓰기라 그게 제일 나쁜 실패다.
 */

import { expandOverwriteColumns, overwriteWithLatest } from '../../scripts/analyze/applyApproved.mjs';
import { factsLine, TYPE_LABEL, type TCandidateExtracted, type TCandidateType, type TPlaceRow } from './adminCandidates';
import { EMPTY_VALUE, type TEditChange } from './adminEdit';
import { environmentPhrases } from './stayEnvironmentView';
import type { TPetPolicyFacts, TStayEnvironment } from '../types';

/** 칸 → 표기. 순서가 곧 화면 순서다(고치기 폼과 같은 순서 — 이름 · 종류 · 주소 · … · 동반). */
const COLUMNS: { key: string; label: string; show: (value: unknown) => string }[] = [
  { key: 'name', label: '이름', show: (v) => str(v) },
  { key: 'type', label: '종류', show: (v) => (v ? (TYPE_LABEL[v as TCandidateType] ?? String(v)) : EMPTY_VALUE) },
  { key: 'region_raw', label: '지역', show: (v) => str(v) },
  { key: 'address', label: '주소', show: (v) => str(v) },
  // 좌표는 두 칸(lat·lng)이 짝으로 움직여 한 줄로 합친다. 주소 바로 뒤 — 떨어뜨리면 "주소는 그대로인데 좌표만 바뀐다" 가 안 읽힌다.
  { key: 'geo', label: '좌표', show: (v) => str(v) },
  { key: 'naver_place_id', label: '네이버 플레이스', show: (v) => str(v) },
  { key: 'homepage_url', label: '홈페이지', show: (v) => str(v) },
  { key: 'homepage_image', label: '홈페이지 사진', show: (v) => str(v) },
  { key: 'category', label: '카테고리', show: (v) => str(v) },
  { key: 'features', label: '소개', show: (v) => str(v) },
  { key: 'pet_policy_text', label: '조건 원문', show: (v) => str(v) },
  { key: 'pet_policy', label: '동반 판단', show: (v) => factsLine(v as TPetPolicyFacts | null) ?? '(판단 없음)' },
  { key: 'stay_price_text', label: '숙박 요금', show: (v) => str(v) },
  { key: 'stay_amenities_text', label: '숙소 시설', show: (v) => str(v) },
  // 숙소 환경 — patch 에 서는 칸은 전부 여기 있어야 한다. 없으면 목록에 안 보인 채 덮이고, 칸을 고르면(11 U7) 조용히 빠진다.
  { key: 'stay_environment', label: '숙소 환경', show: (v) => environmentPhrases((v as TStayEnvironment | null) ?? undefined).join(' · ') || EMPTY_VALUE },
];

const str = (v: unknown) => (v == null || String(v).trim() === '' ? EMPTY_VALUE : String(v));

export type TLatestPlan = {
  /** DB 에 쓸 patch. 바뀌는 칸이 없으면 null. */
  patch: Record<string, unknown> | null;
  /** 덮이기 전 값 — `extracted.applied.overwritten` 에 남아 되돌릴 근거가 된다. */
  previous: Record<string, unknown>;
  /** 사람이 읽는 전·후. 좌표는 한 줄(`위도, 경도`)로 합친다. */
  changes: TEditChange[];
};

/**
 * @param only 고른 칸(화면 키 — `changes[].key`, 좌표는 `geo`). 주면 그 칸(과 짝)만 patch 에 남는다(11 U7). 없으면 바뀌는 칸 전부.
 */
export function latestPlan(place: TPlaceRow, extracted: TCandidateExtracted, only?: string[]): TLatestPlan {
  const out = overwriteWithLatest(place, extracted, only ? { only } : {}) as { patch: Record<string, unknown>; previous: Record<string, unknown> } | null;
  if (!out) return { patch: null, previous: {}, changes: [] };
  const { patch, previous } = out;
  const geo = (row: Record<string, unknown>) => (row.lat == null || row.lng == null ? null : `${row.lat}, ${row.lng}`);
  const before: Record<string, unknown> = { ...previous, geo: geo(previous) };
  const after: Record<string, unknown> = { ...patch, geo: 'lat' in patch ? geo(patch) : undefined };
  const changes = COLUMNS.flatMap((column) => {
    if (after[column.key] === undefined) return [];
    const was = column.show(before[column.key]);
    const now = column.show(after[column.key]);
    // 짝으로 덮이는 칸(원문+판단)에서 원문은 그대로일 수 있다 — 같은 값 줄은 목록에 세우지 않는다.
    return was === now ? [] : [{ key: column.key, label: column.label, before: was, after: now }];
  });
  return { patch, previous, changes };
}

/**
 * 칸 고르기의 체크 한 번 — 순수(11 T1.4). 짝 칸(조건 원문+판단 · 홈페이지 주소+사진)은 **한 체크**로 함께 켜지고 꺼진다 —
 * 쓰기(`overwriteWithLatest` 의 `only`)가 어차피 짝으로 덮으므로, 화면이 반쪽만 켜진 모양을 보여 주면 본 것과 쓰는 것이 어긋난다.
 * @param all 이 묶음에서 바뀌는 칸(`latestPlan(...).changes` 의 key)
 * @param picked 지금 고른 칸. `undefined` 는 "아직 안 건드림" = 전부
 */
export function toggleOverwritePick(all: string[], picked: string[] | undefined, key: string): string[] {
  const now = new Set(picked ?? all);
  const tied = [...(expandOverwriteColumns([key]) as Set<string>)].filter((col) => all.includes(col));
  const on = !now.has(key);
  for (const col of tied) {
    if (on) now.add(col);
    else now.delete(col);
  }
  return all.filter((col) => now.has(col));
}

/** 사이트에 값이 있으면 기본으로 켜지 않는 칸 — 사람이 쓴(또는 고른) 정체·소개다. 비어 있으면 채우는 것이라 켠다. */
export const SITE_OWNED_COLUMNS = ['name', 'type', 'features'] as const;

const filled = (value: unknown) => value != null && String(value).trim() !== '';

/**
 * 덮어쓰기의 **기본 체크**(11 U6·U7) — 순수. 사람이 체크를 건드리기 전에 켜져 있는 칸. 제안(`proposalPick`)이 없을 때 이 규칙이다.
 *  - 동반 조건이 **완화**로 바뀌면(`loosen`) 조건 짝(원문+판단)은 꺼진 채 시작한다 — 틀리면 손님이 거절당한다. 막지는 않는다(켜면 된다).
 *  - **사이트에 이미 값이 있는 이름·종류·소개는 꺼진 채 시작한다**(2026-10-04). 제안이 없는 묶음('확인' 묶음은 제안이 구조적으로 안 생긴다)에서
 *    "바뀌는 칸 전부" 가 기본이던 동안, 사이트의 좋은 소개("커피 맛집이지만 빵 맛집… 성산일출봉 뷰")가 후보의 빈약한 한 줄
 *    ("성산에 있는 카페예요. 반려견과 함께 들어갈 수 있어요.")로, 이름 "프릳츠" 가 "프릳츠 성산점" 으로 기본 덮어쓰기 됐다.
 *    그 칸들은 사람이 쓴 것이고 AI 요약은 글 한 편의 말이다 — 바꾸려면 사람이 켠다. 빈 칸을 채우는 것은 그대로 켠다.
 *  - 나머지(주소·좌표·조건·요금…)는 바뀌는 칸 전부(지금까지의 동작).
 * @param place 짝 장소의 지금 값. 없으면(옛 호출) 이름·종류·소개 규칙을 건너뛴다.
 */
export function defaultOverwritePick(
  all: string[],
  { loosen = false, place }: { loosen?: boolean; place?: Pick<TPlaceRow, (typeof SITE_OWNED_COLUMNS)[number]> } = {},
): string[] {
  const policy = loosen ? (expandOverwriteColumns(['pet_policy_text']) as Set<string>) : new Set<string>();
  const kept = new Set<string>(place ? SITE_OWNED_COLUMNS.filter((key) => filled(place[key])) : []);
  return all.filter((key) => !policy.has(key) && !kept.has(key));
}
