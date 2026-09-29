/**
 * 이미 올린 장소를 **내리고 되살리는** 길(`/admin` 의 '올린 장소' 칸). 후보를 올리는 쪽은 `adminApply.ts` 다.
 *
 * 왜 소프트 삭제인가 — 고른 게 아니라 **정해져 있었다.** `20260922120000_narrow_grants.sql` 이 authenticated 에
 * `select, insert, update` 만 주고 `delete` 는 일부러 주지 않았다(정책에도 delete 가 없다). 그래서 브라우저에서
 * 행을 지우는 길은 42501 로 막혀 있고, 남은 수단은 `status` 한 칸이다. 그 한 칸이 나머지를 알아서 한다:
 *   `archived` → anon 정책(`using (status='published')`)과 `pull-db.mjs` 의 `.eq('status','published')` 가 같은
 *   집합을 보므로 다음 빌드의 `places.json` 에서 빠지고, `places` 가 바뀌었으니 재빌드 트리거가 그 빌드를 부른다.
 * **재빌드 장치를 새로 만들지 않는다** — 승인이 쓰는 그 트리거가 내림에도 그대로 쓰인다.
 *
 * 되살리기는 언제나 `published` 로 간다(`draft` 로 돌려보내지 않는다). 이전 상태를 적어 두는 칸이 없어서인데,
 * 숨은 규칙으로 두는 대신 버튼에 그대로 쓴다 — '되살리기(게시중으로)'. 초안이었던 행을 되살리면 게시가 되고,
 * 그건 사람이 그 버튼을 눌러 고른 것이다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { appendReviewerNote } from './adminSession';
import type { TPlaceRow, TPlaceStatus } from './adminCandidates';

/**
 * 내림 사유 칩. 자유 입력만 두면 매번 다른 말이 적혀 나중에 "왜 내렸나" 를 셀 수 없다
 * (`REJECT_REASONS` 와 같은 이유·같은 모양). 목록은 실제로 내릴 이유가 되는 갈래만 둔다 —
 * 후보 반려 사유(`목록글`·`홍보·협찬`)는 여기 올 수 없다. 이미 올라간 장소에는 해당하지 않는 말이다.
 */
export const ARCHIVE_REASONS = ['폐업', '중복', '정보가 틀림', '동반 불가로 바뀜', '업장 요청', '기타'] as const;

export type TArchiveReason = (typeof ARCHIVE_REASONS)[number];

export const PLACE_STATUS_LABEL: Record<TPlaceStatus, string> = {
  published: '게시중',
  draft: '게시 대기',
  archived: '내림',
};

/** 상태 배지 색. 게시중만 초록이고 내림은 회색이다 — 내리는 것은 사고가 아니라 정상 운영이라 빨강을 쓰지 않는다. */
export const PLACE_STATUS_COLOR: Record<TPlaceStatus, 'success' | 'warning' | 'gray'> = {
  published: 'success',
  draft: 'warning',
  archived: 'gray',
};

/**
 * 관리 목록이 보는 장소 — **상태를 가리지 않는다.** `fetchMatchablePlaces`(대조용)와 달리 내린 곳도 나와야
 * 되살릴 수 있다. 두 함수를 합치지 않는 이유는 쓰임이 다르기 때문이다: 저쪽은 `approveGroup` 이 **읽고 고치는**
 * 배열(ref)이고 이쪽은 화면이 그리는 state 다. 같은 객체를 둘이 나눠 쓰면 한쪽의 제자리 수정이 다른 쪽에
 * 리렌더 없이 새 나간다 — 그래서 목록을 열 때 따로 한 번 더 읽는다.
 *
 * 0행이면 던진다(`fetchMatchablePlaces` 와 같은 보호). RLS 나 프로젝트가 어긋나면 PostgREST 는 에러가 아니라
 * `[]` 를 주는데, 그대로 그리면 "장소가 하나도 없어요" 라는 **거짓말**이 화면에 뜬다.
 */
export async function fetchManagedPlaces(client: SupabaseClient): Promise<TPlaceRow[]> {
  const { data, error } = await client.from('places').select('*');
  if (error)
    throw new Error(`장소 목록을 불러오지 못했어요 — 로그아웃하고 다시 로그인해 주세요. (${error.message})`);
  const rows = (data ?? []) as unknown as TPlaceRow[];
  if (rows.length === 0) {
    throw new Error('장소 목록이 비어서 멈췄어요 — 로그아웃하고 다시 로그인해 주세요. 아무것도 바꾸지 않았어요.');
  }
  return sortManagedPlaces(rows);
}

/**
 * 목록 순서 — 순수. 내린 곳을 **맨 위**로 올린다(최근에 내린 순), 나머지는 이름순.
 *
 * 내림이 위에 오는 이유: 이 목록을 여는 두 가지 일 중 하나가 "방금 내린 게 맞나 확인" 이고 다른 하나가
 * "되살리기" 인데, 둘 다 내린 곳을 찾는 일이다. 게시중 86곳 아래에 묻어 두면 그때마다 검색을 해야 한다.
 * 이름 정렬은 `localeCompare('ko')` 로 한다 — Postgres 의 collation 과 앱의 정렬이 어긋나면 같은 목록이
 * 서버에서 한 순서, 화면에서 다른 순서가 된다(`REGION_OPTIONS` 와 같은 어법).
 */
export function sortManagedPlaces(rows: TPlaceRow[]): TPlaceRow[] {
  return [...rows].sort((a, b) => {
    const aArchived = a.status === 'archived';
    const bArchived = b.status === 'archived';
    if (aArchived !== bArchived) return aArchived ? -1 : 1;
    if (aArchived && bArchived) {
      // 내린 시각이 없는 행(트리거가 생기기 전에 Studio 로 내린 것)은 뒤로 보낸다 — 시각이 있는 것이 최근이다.
      const at = a.archived_at ?? '';
      const bt = b.archived_at ?? '';
      if (at !== bt) return at < bt ? 1 : -1;
    }
    return a.name.localeCompare(b.name, 'ko');
  });
}

/** 검색 비교용 — 소문자, 공백 제거. 띄어쓰기가 데이터와 다른 것("카페 살레" vs "카페살레")이 가장 흔한 실패다. */
const searchKey = (value: string): string => value.toLowerCase().replace(/\s+/g, '');

/**
 * 검색어 하나로 이름·지역·주소를 본다 — 순수. 86곳이 넘는 목록에서 한 곳을 찾는 유일한 수단이다.
 *
 * `matchPlace` 의 `normalizeName` 을 쓰지 않는다. 그쪽은 대조용이라 '카페'·'제주' 를 떼는데, 검색에서 그러면
 * "카페" 를 입력한 사람에게 카페가 하나도 안 나온다. 검색은 **적은 그대로** 찾는 게 맞다.
 */
export function matchesPlaceQuery(place: TPlaceRow, query: string): boolean {
  const key = searchKey(query);
  if (key === '') return true;
  return searchKey(`${place.name} ${place.region_raw} ${place.address ?? ''}`).includes(key);
}

/** 상태별 개수 — 순수. 필터 칩에 붙는 수다. */
export function countPlacesByStatus(rows: TPlaceRow[]): Record<TPlaceStatus, number> {
  const counts: Record<TPlaceStatus, number> = { published: 0, draft: 0, archived: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/**
 * `archive_note` 에 덧붙일 한 줄 — 순수.
 *
 * 날짜를 줄 안에 적는 이유: `archived_at` 은 **지금 내려 있는 시각 하나**뿐이라 되살리면 null 이 된다.
 * 내렸다 되살린 이력은 이 칸에만 남으므로 줄마다 날짜가 있어야 순서를 읽을 수 있다.
 * 태그가 `[admin]` 인 것은 `reviewer_note` 와 같은 어법이다(CLI 가 쓰면 `[data:apply]`).
 */
export function archiveNoteLine(
  kind: 'archive' | 'restore',
  dayIso: string,
  reason?: TArchiveReason,
  note?: string,
): string {
  const memo = note && note.trim() ? ` — ${note.trim()}` : '';
  if (kind === 'restore') return `[admin ${dayIso}] 되살림${memo}`;
  return `[admin ${dayIso}] 내림 · ${reason ?? '기타'}${memo}`;
}

/** `nowIso` 에서 날짜만. 줄에 시:분까지 적으면 길어져 사유가 안 읽힌다 — 같은 날 여러 번은 순서로 구분된다. */
export const dayOf = (nowIso: string): string => nowIso.slice(0, 10);

/**
 * `archive_note` 의 **마지막** 한 줄 — 순수. 지금 왜 내려 있는지가 그 줄에 있다(앞줄은 지난 이력이다).
 * 화면 둘이 같이 쓴다('올린 장소' 칸의 줄 · 후보 카드의 "내린 곳이에요" 안내) — 두 벌로 두면 한쪽만 고친다.
 */
export function lastNoteLine(note: string | null | undefined): string | undefined {
  const lines = (note ?? '').split('\n').filter((line) => line.trim() !== '');
  return lines.length ? lines[lines.length - 1] : undefined;
}

/**
 * 기록 한 줄을 화면 말로 — `[admin YYYY-MM-DD]` 의 대괄호와 태그를 벗긴다. 태그는 누가 썼는지 가리는 내부 표식이고
 * (CLI 가 쓰면 `[data:apply]`) 운영자가 읽을 것이 아니다. **저장 문자열은 그대로다** — `archiveNoteLine` 이 정본이고
 * `adminPlaces.test.ts` 가 그 문자열을 단정한다. 태그 꼴이 아닌 줄(Studio 에서 손으로 적은 줄)은 그대로 통과시킨다.
 */
export function noteLineText(line: string | undefined): string | undefined {
  if (!line) return line;
  /*
   * **우리가 쓰는 태그만** 벗긴다. 맨 앞의 아무 `[토큰]` 이나 벗기면 Studio 손글씨를 망친다 —
   * `[폐업] 9월 문 닫음` 이 `9월 문 닫음` 이 되고 `[2026-09-01] 폐업` 은 날짜를 잃는다.
   * 쓰는 쪽은 둘뿐이다: 화면이 `[admin <날짜>]`(`archiveNoteLine`), CLI 가 `[data:apply]`.
   */
  const matched = /^\[(?:admin(?:\s+(\d{4}-\d{2}-\d{2}))?|data:apply)\]\s*(.*)$/.exec(line);
  if (!matched) return line;
  return matched[1] ? `${matched[1]} ${matched[2]}` : matched[2];
}

export type TPlaceStatusChange = {
  nowIso: string;
  reason?: TArchiveReason;
  note?: string;
};

/**
 * 상태 한 칸 + 기록 한 줄. `archived_at` 은 **적지 않는다** — 트리거가 찍는다(`20260929120000:35-55`).
 * 여기서 같이 적으면 두 곳이 같은 칸을 쓰게 되고, 어긋나는 날 어느 쪽이 맞는지 알 수 없다.
 *
 * 돌려주는 행은 **서버가 준 그 행**이다(아래 `.select().single()`). 트리거가 찍은 `archived_at` 이 거기 있다.
 */
async function setPlaceStatus(
  client: SupabaseClient,
  place: TPlaceRow,
  status: TPlaceStatus,
  line: string,
): Promise<TPlaceRow> {
  const archive_note = appendReviewerNote(place.archive_note, line);
  /*
   * `.select().single()` 을 붙이는 이유가 둘이다.
   *  1. **트리거가 찍은 `archived_at` 을 읽어 온다.** 안 읽으면 방금 내린 행의 그 칸이 null 로 남아
   *     `sortManagedPlaces` 가 그것을 "시각 없는 내림" 으로 보고 목록 맨 아래로 보낸다 — 지금 확인해야 할
   *     한 줄이 하필 제일 뒤에 간다(그 정렬을 둔 이유가 그 확인이다).
   *  2. **0행을 성공으로 읽지 않는다.** RLS 가 아무 행도 고르지 못했거나 id 가 사라졌으면 PostgREST 는
   *     에러가 아니라 빈 결과를 준다 — `.single()` 이 그것을 에러로 바꿔 준다. 이 레포가 `[]` 를 사고로
   *     보는 곳이 여기 말고도 여럿이다(`fetchManagedPlaces` · `pull-db` 의 exit 1).
   */
  const { data, error } = await client
    .from('places')
    .update({ status, archive_note })
    .eq('id', place.id)
    .select()
    .single();
  if (error)
    throw new Error(
      `${status === 'archived' ? '내리지' : '되살리지'} 못했어요 — 다시 눌러 보고, 안 되면 로그아웃하고 다시 로그인해 주세요. (${error.message})`,
    );
  return (data ?? { ...place, status, archive_note }) as TPlaceRow;
}

/** 내린다 — 사이트에서 사라지는 것은 다음 빌드부터다(트리거가 그 빌드를 부른다). */
export function archivePlace(
  client: SupabaseClient,
  place: TPlaceRow,
  { nowIso, reason, note }: TPlaceStatusChange,
): Promise<TPlaceRow> {
  return setPlaceStatus(client, place, 'archived', archiveNoteLine('archive', dayOf(nowIso), reason, note));
}

/** 되살린다 — 언제나 `published` 로(파일 머리 주석). */
export function restorePlace(
  client: SupabaseClient,
  place: TPlaceRow,
  { nowIso, note }: TPlaceStatusChange,
): Promise<TPlaceRow> {
  return setPlaceStatus(client, place, 'published', archiveNoteLine('restore', dayOf(nowIso), undefined, note));
}
