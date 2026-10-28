import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_SEEN_KEY,
  adminTabWork,
  freshCandidateGroups,
  freshText,
  isAgainGroup,
  openSeenVisit,
  parseAdminSeen,
  readAdminSeen,
  seenSince,
  writeAdminSeen,
} from './adminTabCounts';

const inbox = { places: 2, reports: 3, archivedPlaces: 1, suggestions: 4, today: 9 };

describe('adminTabWork — 탭 숫자는 그 칸에 남은 일', () => {
  it('수집 완료는 누적(전체)이 아니라 미분석, 장소 칸은 볼 일(제보·제안·게시 대기), 블랙리스트는 숫자 없음', () => {
    expect(
      adminTabWork({ posts: { total: 7627, unanalyzed: 9, excluded: 0 }, groups: 1955, inbox, draft: 1 }),
    ).toEqual({ posts: 9, candidates: 1955, places: 2 + 4 + 1, archived: 1, blocks: undefined });
  });

  it('다 센 0 은 0 — 일이 끝났다는 신호', () => {
    const empty = { places: 0, reports: 0, archivedPlaces: 0, suggestions: 0, today: 3 };
    expect(adminTabWork({ posts: { total: 10, unanalyzed: 0, excluded: null }, groups: 0, inbox: empty, draft: 0 })).toEqual({
      posts: 0,
      candidates: 0,
      places: 0,
      archived: 0,
      blocks: undefined,
    });
  });

  it('못 셌으면 숫자를 안 단다 — 장소 목록이 없으면 제보가 있어도 두 장소 칸 모두', () => {
    expect(adminTabWork({ posts: undefined, groups: 3, inbox, draft: undefined })).toEqual({
      posts: undefined,
      candidates: 3,
      places: undefined,
      archived: undefined,
      blocks: undefined,
    });
    expect(adminTabWork({ posts: undefined, groups: 3, inbox: undefined, draft: 0 }).places).toBeUndefined();
  });
});

describe('parseAdminSeen — 깨진 저장값은 처음 방문', () => {
  it('칸별 ISO 만 남긴다', () => {
    expect(parseAdminSeen(JSON.stringify({ posts: '2026-10-28T00:00:00.000Z', candidates: 'x', places: '2026-10-28T00:00:00.000Z' }))).toEqual({
      posts: '2026-10-28T00:00:00.000Z',
    });
  });

  it.each([null, '', '{', '"문자"', 'null', '[]'])('%j → {}', (raw) => {
    expect(parseAdminSeen(raw)).toEqual({});
  });
});

describe('localStorage 래퍼', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fakeStorage = (initial: Record<string, string> = {}) => {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      map,
    };
  };

  it('여는 칸을 적고, 아직 없는 칸도 같은 시각으로 채운다(안 연 칸도 다음 방문부터 새를 단다)', () => {
    const storage = fakeStorage({ [ADMIN_SEEN_KEY]: JSON.stringify({ posts: '2026-10-01T00:00:00.000Z' }) });
    vi.stubGlobal('localStorage', storage);
    writeAdminSeen('candidates', '2026-10-29T00:00:00.000Z');
    expect(readAdminSeen()).toEqual({ posts: '2026-10-01T00:00:00.000Z', candidates: '2026-10-29T00:00:00.000Z' });
    writeAdminSeen('posts', '2026-10-30T00:00:00.000Z');
    expect(readAdminSeen().posts).toBe('2026-10-30T00:00:00.000Z');
  });

  it('저장소가 던지면 읽기는 처음 방문, 쓰기는 조용히', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    });
    expect(readAdminSeen()).toEqual({});
    expect(() => writeAdminSeen('posts', '2026-10-29T00:00:00.000Z')).not.toThrow();
  });
});

describe('seenSince — 이번 방문 동안 기준을 고정한다', () => {
  const stored = { candidates: '2026-10-20T00:00:00.000Z' };

  it('연 칸은 열기 전 값, 떠나면 이번에 연 시각', () => {
    const opened = openSeenVisit({}, 'candidates', stored, '2026-10-29T09:00:00.000Z');
    expect(seenSince(opened, 'candidates', 'candidates', stored)).toBe('2026-10-20T00:00:00.000Z');
    expect(seenSince(opened, 'candidates', 'posts', stored)).toBe('2026-10-29T09:00:00.000Z');
  });

  it('같은 페이지에서 다시 열면 기준은 지난번에 연 시각', () => {
    const first = openSeenVisit({}, 'candidates', stored, '2026-10-29T09:00:00.000Z');
    const again = openSeenVisit(first, 'candidates', stored, '2026-10-29T09:30:00.000Z');
    expect(seenSince(again, 'candidates', 'candidates', stored)).toBe('2026-10-29T09:00:00.000Z');
  });

  it('처음 방문(저장값 없음)은 열어 둔 동안 null — 첫 방문에 전부가 새것으로 보이지 않게', () => {
    const opened = openSeenVisit({}, 'posts', stored, '2026-10-29T09:00:00.000Z');
    expect(seenSince(opened, 'posts', 'posts', stored)).toBeNull();
    expect(seenSince({}, 'posts', 'candidates', stored)).toBeNull();
  });

  it('이 페이지에서 안 연 칸은 저장값', () => {
    expect(seenSince({}, 'candidates', 'posts', stored)).toBe('2026-10-20T00:00:00.000Z');
  });
});

describe('freshCandidateGroups — 묶음의 가장 새 행이 기준 뒤면 새것', () => {
  const row = (created_at: string, published = false) => ({
    created_at,
    match_place_id: published ? 'p1' : null,
    places: published ? { id: 'p1', name: '가게', status: 'published' as const } : null,
  });
  const since = '2026-10-20T00:00:00.000Z';

  it('새 행이 붙은 옛 묶음도 새것, 게시된 가게로 다시 올라온 것은 따로 센다', () => {
    const groups = [
      { key: 'a', kind: 'new' as const, rows: [row('2026-10-21T00:00:00Z')] },
      { key: 'b', kind: 'new' as const, rows: [row('2026-10-01T00:00:00Z'), row('2026-10-22T00:00:00Z')] },
      { key: 'c', kind: 'update' as const, rows: [row('2026-10-23T00:00:00Z', true)] },
      { key: 'd', kind: 'fill' as const, rows: [row('2026-10-01T00:00:00Z', true)] },
      { key: 'e', kind: 'new' as const, rows: [row('2026-10-20T00:00:00Z')] },
    ];
    const out = freshCandidateGroups(groups, since);
    expect(out?.fresh).toBe(3);
    expect(out?.again).toBe(1);
    expect([...(out?.keys ?? [])]).toEqual(['a', 'b', 'c']);
  });

  it('기준이 없거나 깨졌으면 null — 새를 안 그린다', () => {
    expect(freshCandidateGroups([], null)).toBeNull();
    expect(freshCandidateGroups([], 'x')).toBeNull();
  });
});

describe('isAgainGroup', () => {
  const published = { id: 'p1', name: '가게', status: 'published' as const };
  it('짝이 게시중인 기존 장소(갱신·보강)만', () => {
    const rows = [{ created_at: '', match_place_id: 'p1', places: published }];
    expect(isAgainGroup({ key: 'a', kind: 'update', rows })).toBe(true);
    expect(isAgainGroup({ key: 'a', kind: 'fill', rows })).toBe(true);
    expect(isAgainGroup({ key: 'a', kind: 'ask', rows })).toBe(false);
    expect(isAgainGroup({ key: 'a', kind: 'fill', rows: [{ ...rows[0], places: { ...published, status: 'archived' } }] })).toBe(false);
  });
});

describe('freshText', () => {
  it('없으면 null, 다시 올라옴은 있을 때만', () => {
    expect(freshText(undefined)).toBeNull();
    expect(freshText(0, 0)).toBeNull();
    expect(freshText(3)).toBe('새 3');
    expect(freshText(1200, 1)).toBe('새 1,200 · 다시 올라옴 1');
  });
});
