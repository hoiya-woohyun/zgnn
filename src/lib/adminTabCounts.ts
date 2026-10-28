/**
 * `/admin` 탭 줄의 숫자와 `새 N`(2026-10-29).
 *
 * **숫자는 그 칸에 남은 일이다** — 누적 재고가 아니다. `수집 완료 7,627` 은 늘 7천 몇이라 오늘 볼 것이 있는지 말하지 못했다(운영자 지적).
 * 누적 수(전체 · 게시 · 막힘)는 칸 안 제목 밑 설명줄이 말한다. 0 은 0 으로 보인다(일이 끝났다는 신호) — 못 셌으면 숫자를 안 단다.
 *
 * **`새 N` 은 이 브라우저에서 그 칸을 마지막으로 연 뒤 들어온 것이다.** 기준 시각은 localStorage 에 칸별로 둔다(운영자 한 명 — 기기 간 동기는 다음).
 * 칸을 여는 순간 저장소에는 지금 시각을 적지만, 화면이 그리는 기준은 **그 방문 동안 이전 값으로 고정**한다 — 열자마자 배지가 사라지면
 * 무엇이 새것인지 못 본다. 떠날 때 기준이 이번에 연 시각으로 넘어간다. 창을 닫는 순간을 잡지 않아도 되도록 저장은 '열 때' 한다.
 * 기준은 브라우저 시계, 비교 대상(`fetched_at`·`created_at`)은 DB 시계다 — 몇 초 어긋나도 운영자 한 명에겐 받아들인다.
 */

import type { TCandidateGroup, TCandidateRow } from './adminCandidates';
import type { TPostCounts } from './adminPosts';
import type { TReportInbox } from './adminReports';
import type { TAdminTab } from './adminUrlState';

/**
 * 칸별 남은 일. 순수.
 * - 수집 완료: 미분석(`onlyUnanalyzed` 의 집합 — 분석 제외는 빠진다).
 * - 검수 대기: 결정 안 한 곳(묶음 수).
 * - 등록 완료: 열린 제보가 있는 곳 + 장소 제안 + 게시 대기(`게시` 를 눌러야 사이트에 나간다) — 머리글 `열린 제보 N곳 · 장소 제안 K건` 이 보내는 곳과 같은 단위.
 * - 등록 해제: 열린 제보가 남은 곳(내릴 때 함께 닫히므로 보통 0).
 * - 블랙리스트: 숫자 없음 — 큐가 아니라 보관 목록이고, 만료(`지남`)도 비교라 사람이 할 일이 아니다.
 *
 * `draft` 는 장소 목록을 못 읽었으면 `undefined` — 그때 두 장소 칸은 숫자를 안 단다(`reportInbox` 는 모르는 장소를 등록 완료 몫으로 세어,
 * 목록 없이 센 등록 해제 0 은 거짓말이다).
 */
export function adminTabWork(input: {
  posts: TPostCounts | undefined;
  groups: number;
  inbox: TReportInbox | undefined;
  draft: number | undefined;
}): Record<TAdminTab, number | undefined> {
  const { posts, groups, inbox, draft } = input;
  const placesKnown = inbox !== undefined && draft !== undefined;
  return {
    posts: posts?.unanalyzed,
    candidates: groups,
    places: placesKnown ? inbox.places + inbox.suggestions + draft : undefined,
    archived: placesKnown ? inbox.archivedPlaces : undefined,
    blocks: undefined,
  };
}

/** `새 N` 을 다는 칸 — 들어오는 것이 있는 두 칸뿐이다(장소 칸은 운영자가 만든 것이라 '새로 들어온' 것이 없다). */
export type TSeenTab = 'posts' | 'candidates';
export const SEEN_TABS: readonly TSeenTab[] = ['posts', 'candidates'];

export function isSeenTab(tab: TAdminTab): tab is TSeenTab {
  return (SEEN_TABS as readonly string[]).includes(tab);
}

export const ADMIN_SEEN_KEY = 'zgnn.admin.seen';

/** 저장소 모양 — 칸별 마지막으로 연 시각(ISO). */
export type TAdminSeen = Partial<Record<TSeenTab, string>>;

/** 순수 — 깨진 값·모르는 칸·날짜가 아닌 값은 버린다(없는 것으로 = 처음 방문). */
export function parseAdminSeen(raw: string | null): TAdminSeen {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object') return {};
  const out: TAdminSeen = {};
  for (const tab of SEEN_TABS) {
    const at = (value as Record<string, unknown>)[tab];
    if (typeof at === 'string' && !Number.isNaN(Date.parse(at))) out[tab] = at;
  }
  return out;
}

/** 저장소를 못 읽으면(사생활 보호 창·막힌 저장소) 처음 방문과 같다 — `새` 를 안 그린다. */
export function readAdminSeen(): TAdminSeen {
  try {
    return parseAdminSeen(localStorage.getItem(ADMIN_SEEN_KEY));
  } catch {
    return {};
  }
}

/** 칸을 연 시각을 적는다. 저장소에 아직 없는 칸도 같은 시각으로 채운다 — 한 번도 안 연 칸이 영영 `새` 를 못 다는 일을 막는다. 실패는 조용히. */
export function writeAdminSeen(tab: TSeenTab, at: string): void {
  try {
    const next: TAdminSeen = { ...parseAdminSeen(localStorage.getItem(ADMIN_SEEN_KEY)) };
    for (const other of SEEN_TABS) next[other] ??= at;
    next[tab] = at;
    localStorage.setItem(ADMIN_SEEN_KEY, JSON.stringify(next));
  } catch {
    // 저장이 안 되면 다음 방문도 처음 방문이다 — `새` 를 안 그릴 뿐 화면은 그대로다.
  }
}

/**
 * 이 페이지에서 칸을 연 기록 — `prev` 는 이번에 열기 전의 기준(처음 방문이면 null), `openedAt` 은 이번에 연 시각.
 * 화면 기준은 `seenSince` 가 정한다.
 */
export type TSeenVisits = Partial<Record<TSeenTab, { prev: string | null; openedAt: string }>>;

/** 순수 — 칸을 열었다. 이번 기준은 이 페이지에서 지난번에 연 시각, 처음이면 마운트 때 읽은 저장값. */
export function openSeenVisit(visits: TSeenVisits, tab: TSeenTab, stored: TAdminSeen, now: string): TSeenVisits {
  return { ...visits, [tab]: { prev: visits[tab]?.openedAt ?? stored[tab] ?? null, openedAt: now } };
}

/**
 * 순수 — 칸의 `새` 기준. 지금 연 칸이면 이번 방문 동안 고정된 이전 값, 아니면 마지막으로 연 시각(이 페이지에서 안 열었으면 저장값).
 * null 이면 `새` 를 그리지 않는다.
 */
export function seenSince(visits: TSeenVisits, tab: TSeenTab, active: TAdminTab, stored: TAdminSeen): string | null {
  const visit = visits[tab];
  if (!visit) return stored[tab] ?? null;
  return tab === active ? visit.prev : visit.openedAt;
}

type TFreshGroup = Pick<TCandidateGroup, 'key' | 'kind'> & {
  rows: readonly Pick<TCandidateRow, 'created_at' | 'match_place_id' | 'places'>[];
};

/**
 * 이미 게시된 가게로 다시 올라온 묶음 — 짝이 확정된 기존 장소(`kind` 갱신·보강, 곧 `tier` auto)이고 그 장소가 게시중이다.
 * `updateGroupsByPlace` 는 갱신만 센다(등록 완료 줄의 `검수 대기에 갱신 N` — 덮어쓸지 고를 일). 여기는 "신규가 아니라 아는 가게의 새 글" 을
 * 가르는 자리라 보강도 넣는다 — 신규 3 과 아는 가게 3 은 할 일의 무게가 다르다.
 */
export function isAgainGroup(group: TFreshGroup): boolean {
  if (group.kind !== 'update' && group.kind !== 'fill') return false;
  return group.rows.some((row) => row.match_place_id !== null && row.places?.status === 'published');
}

export type TFreshCandidates = { fresh: number; again: number; keys: ReadonlySet<string> };

/**
 * 순수 — 기준 뒤에 생긴 묶음. **묶음의 가장 새 행**이 기준 뒤면 새것이다 — 이미 있던 묶음에 새 글이 붙은 것도 볼 일이다.
 * 묶음 키를 저장해 대 보지 않는다: 같은 자리 합치기가 행 하나로 키를 바꾼다(`fetchPendingCandidates` 머리 주석). 기준이 없으면 null.
 */
export function freshCandidateGroups(groups: readonly TFreshGroup[], since: string | null): TFreshCandidates | null {
  if (!since) return null;
  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) return null;
  const keys = new Set<string>();
  let again = 0;
  for (const group of groups) {
    const latest = Math.max(...group.rows.map((row) => Date.parse(row.created_at)).filter((ms) => !Number.isNaN(ms)));
    if (!(latest > sinceMs)) continue;
    keys.add(group.key);
    if (isAgainGroup(group)) again += 1;
  }
  return { fresh: keys.size, again, keys };
}

/** 설명줄 조각 — `새 3 · 다시 올라옴 1`. 새것이 없거나 못 셌으면 null(설명줄에 안 붙인다). */
export function freshText(fresh: number | undefined, again = 0): string | null {
  if (!fresh) return null;
  const n = (value: number) => value.toLocaleString('ko-KR');
  return again > 0 ? `새 ${n(fresh)} · 다시 올라옴 ${n(again)}` : `새 ${n(fresh)}`;
}
