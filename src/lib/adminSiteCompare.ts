/**
 * 갱신·보강 묶음의 **세 칸 비교** — 지금 사이트 값 · 글들이 말한 것(글마다) · 나갈 값(docs/todo/11 T1.3). 순수.
 *
 * 왜 따로 있나: 펼친 줄의 비교표는 `원문 ↔ 나갈 값` 두 칸이고, 지금 사이트에 무엇이 나가 있는지는 결정 레일의 한 줄(`합칠 곳`)뿐이었다.
 * 기존 장소를 고치는 글을 볼 때 운영자가 알아야 하는 것은 거꾸로 "사이트는 지금 이런데, 글들은 무엇이라 하고, 승인하면 무엇이 되나" 다.
 * 글이 여럿이면 **글마다** 한 줄로 세운다 — 대표 한 건의 값만 보이면 다른 말을 하는 글이 confidence 에 밀려 사라진다(11 G3).
 *
 * 칸은 **글이 말하는 사실 칸**만이다(조건 · 숙박 요금 · 숙소 환경 · 시설 · 소개 · 카테고리). 이름·주소·좌표는 비교표의 원래 줄과
 * `주소 다름` 흐름이 말한다(주소 대조는 규칙이다 — ADR-019 결정 4·5).
 */

import { EMPTY_VALUE } from './adminEdit';
import { factsLine, FACTS_EMPTY, type TCandidateExtracted, type TCandidateRow, type TPlaceRow } from './adminCandidates';
import { LOOSEN_HINT, policyDirection } from './policyDirection';
import { environmentPhrases } from './stayEnvironmentView';
import type { TPetPolicyFacts, TStayEnvironment } from '../types';

type TColumn = {
  key: string;
  label: string;
  stayOnly?: boolean;
  site: (place: TPlaceRow) => string | null;
  cand: (extracted: TCandidateExtracted) => string | null;
};

const text = (v: unknown): string | null => (v == null || String(v).trim() === '' ? null : String(v).trim());
const facts = (v: TPetPolicyFacts | null | undefined): string | null => {
  const line = factsLine(v ?? null);
  return line && line !== FACTS_EMPTY ? line : null;
};
const environment = (v: TStayEnvironment | null | undefined): string | null => text(environmentPhrases(v ?? undefined).join(' · '));

/** 순서가 곧 화면 순서다 — 조건이 먼저(갱신의 대부분이 거기서 난다). 칸 이름은 덮어쓰기 칸 이름이다(`overwriteWithLatest`). */
export const SITE_COMPARE_COLUMNS: TColumn[] = [
  { key: 'pet_policy_text', label: '조건 원문', site: (p) => text(p.pet_policy_text), cand: (e) => text(e.petPolicyText) },
  { key: 'pet_policy', label: '동반 판단', site: (p) => facts(p.pet_policy), cand: (e) => facts(e.petPolicy) },
  { key: 'stay_price_text', label: '숙박 요금', stayOnly: true, site: (p) => text(p.stay_price_text), cand: (e) => text(e.stayPriceText) },
  { key: 'stay_environment', label: '숙소 환경', stayOnly: true, site: (p) => environment(p.stay_environment), cand: (e) => environment(e.stayEnvironment) },
  { key: 'stay_amenities_text', label: '숙소 시설', stayOnly: true, site: (p) => text(p.stay_amenities_text), cand: (e) => text(e.stayAmenitiesText) },
  { key: 'features', label: '소개', site: (p) => text(p.features), cand: (e) => text(e.features) },
  { key: 'category', label: '카테고리', site: (p) => text(p.category), cand: (e) => text(e.category) },
];

export type TFieldVoice = {
  rowId: string;
  /** 글 날짜(`YYYY-MM-DD`). 모르면 null — 그런 글은 맨 뒤다. */
  postedAt: string | null;
  title: string;
  url: string | null;
  value: string;
};

/**
 * 한 칸에 대해 **글마다 무엇이라 했나** — 가장 새 글이 위. 그 칸을 말하지 않은 글은 뺀다(빈 값은 "다른 말" 이 아니라 "말 없음" 이다).
 * 같은 글(post_url)의 후보가 둘이면(재분석으로 옛 판단·새 판단이 같이 남은 경우) 둘 다 선다 — 행이 다르면 판단도 다를 수 있다.
 */
export function fieldVoices(rows: TCandidateRow[], column: Pick<TColumn, 'cand'>): TFieldVoice[] {
  return rows
    .flatMap((row) => {
      const value = column.cand(row.extracted);
      if (!value) return [];
      return [
        {
          rowId: row.id,
          postedAt: row.blog_posts?.posted_at ? String(row.blog_posts.posted_at).slice(0, 10) : null,
          title: row.blog_posts?.title ?? row.post_url ?? '제목 없는 글',
          url: row.post_url,
          value,
        },
      ];
    })
    .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
}

export type TSiteCompareRow = {
  key: string;
  label: string;
  /** 지금 사이트 값(비었으면 `EMPTY_VALUE`). */
  site: string;
  voices: TFieldVoice[];
  /** 승인(덮어쓰기)하면 나갈 값 — 대표 후보의 값. 대표가 그 칸을 말하지 않으면 지금 값 그대로다. */
  next: string;
  /** 글들이 이 칸에 **서로 다른 말**을 한다(빈 값 제외, 값이 둘 이상). */
  conflict: boolean;
  /** 충돌일 때 한마디 — 가장 새 글의 날짜와 값. 날짜를 모르면 null. */
  latestNote: string | null;
  /** 사이트 값과 나갈 값이 다르다. */
  changed: boolean;
  /** 동반 판단이 **완화**로 바뀐다(`policyDirection`, 11 U6) — 그 줄에 `전화로 확인해 주세요`. 강화·중립이면 null. */
  loosenHint: string | null;
};

/**
 * 사이트 ↔ 글들 ↔ 나갈 값. 세 쪽이 다 비어 있는 칸과 숙소가 아닌 곳의 숙소 칸은 줄을 세우지 않는다.
 * @param place 짝 장소의 지금 행
 * @param rows 묶음의 후보들
 * @param lead 대표 후보(덮어쓰기가 쓰는 값)
 */
export function siteCompareRows(place: TPlaceRow, rows: TCandidateRow[], lead: TCandidateRow): TSiteCompareRow[] {
  const stay = place.type === 'stay' || lead.extracted.type === 'stay';
  const loosen = policyDirection(place.pet_policy, lead.extracted.petPolicy).overall === 'loosen';
  return SITE_COMPARE_COLUMNS.flatMap((column) => {
    if (column.stayOnly && !stay) return [];
    const site = column.site(place);
    const voices = fieldVoices(rows, column);
    const next = column.cand(lead.extracted) ?? site;
    if (!site && !voices.length && !next) return [];
    const distinct = new Set(voices.map((voice) => voice.value));
    const conflict = distinct.size > 1;
    const latest = voices[0];
    return [
      {
        key: column.key,
        label: column.label,
        site: site ?? EMPTY_VALUE,
        voices,
        next: next ?? EMPTY_VALUE,
        conflict,
        latestNote: conflict && latest?.postedAt ? `최신 글(${latest.postedAt})은 "${latest.value}"` : null,
        changed: (site ?? null) !== (next ?? null),
        loosenHint: loosen && column.key === 'pet_policy' ? LOOSEN_HINT : null,
      },
    ];
  });
}
