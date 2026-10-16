import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  closeReportsForArchived,
  mergeReportRows,
  needsHandling,
  openReportsByPlace,
  openSuggestions,
  countReportedPlaces,
  inboxHasWork,
  reportInbox,
  reportInboxText,
  reportBuildText,
  requestSuggestionCollect,
  setReportStatus,
  type TReportRow,
  suggestionSearchName,
  visitedTallyByPlace,
} from './adminReports';
import { policyReportCounts } from './adminReports';

const report = (patch: Partial<TReportRow> = {}): TReportRow => ({
  id: 'r1',
  place_id: 'p1',
  kind: 'closed',
  note: null,
  app_build: 'abc1234',
  status: 'open',
  handled_note: null,
  handled_at: null,
  created_at: '2026-10-01T03:00:00.000Z',
  ...patch,
});

function fakeClient(returned: TReportRow[] | null = null, error: { message: string } | null = null) {
  const calls: { payload: Record<string, unknown>; ids: string[] }[] = [];
  const client = {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        in: (_col: string, ids: string[]) => {
          calls.push({ payload, ids });
          return { select: () => Promise.resolve({ data: returned, error }) };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { calls, client };
}

describe('openReportsByPlace · needsHandling', () => {
  it('열린 것만, visited_ok·제안은 빼고, 최신순', () => {
    const rows = [
      report({ id: 'a', created_at: '2026-09-01T00:00:00.000Z' }),
      report({ id: 'b', created_at: '2026-09-20T00:00:00.000Z', kind: 'address' }),
      report({ id: 'c', status: 'handled' }),
      report({ id: 'd', kind: 'visited_ok' }),
      report({ id: 'e', kind: 'suggest', place_id: null, note: '카페' }),
    ];
    expect(openReportsByPlace(rows).p1.map((row) => row.id)).toEqual(['b', 'a']);
    expect(needsHandling(rows[3])).toBe(false);
    expect(openSuggestions(rows).map((row) => row.id)).toEqual(['e']);
  });
});

describe('reportInbox — 머리글 숫자 = 가서 보는 곳의 숫자(14 W261010.13)', () => {
  // 기본 제보(10-01)와 다른 날 — 오늘 들어온 것이 섞이지 않게. 오늘 칸은 셋째 경우가 따로 본다.
  const now = new Date('2026-10-05T12:00:00');
  const places = [
    { id: 'p1', status: 'published' as const },
    { id: 'p2', status: 'published' as const },
    { id: 'p3', status: 'archived' as const },
  ];

  it('한 곳에 둘이면 곳은 하나, 건은 둘 — 곳은 칩과 같은 함수로 센다', () => {
    const rows = [report({ id: 'a' }), report({ id: 'b', kind: 'address' }), report({ id: 'c', place_id: 'p2', kind: 'policy' })];
    const inbox = reportInbox(rows, places, now);
    expect(inbox).toMatchObject({ places: 2, reports: 3, archivedPlaces: 0, suggestions: 0 });
    expect(inbox.places).toBe(countReportedPlaces(openReportsByPlace(rows), places, false));
    expect(reportInboxText(inbox)).toBe('열린 제보 2곳(3건)');
  });

  it('제안은 곳에 섞지 않고 따로 센다 — 예전 한 숫자가 9(제보 6 + 제안 3)였다', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => report({ id: `r${i}`, place_id: `q${i}` })),
      ...Array.from({ length: 3 }, (_, i) => report({ id: `s${i}`, kind: 'suggest', place_id: null, note: `카페 ${i}` })),
    ];
    const listed = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, status: 'published' as const }));
    const inbox = reportInbox(rows, listed, now);
    expect(inbox).toMatchObject({ places: 6, reports: 6, suggestions: 3 });
    expect(reportInboxText(inbox)).toBe('열린 제보 6곳 · 장소 제안 3건');
    expect(inboxHasWork(inbox)).toBe(true);
  });

  it('다녀왔어요·닫힌 것은 할 일이 아니다 — 오늘 들어온 것으로만 말한다', () => {
    const rows = [
      report({ id: 'v', kind: 'visited_ok', created_at: new Date('2026-10-05T09:00:00').toISOString() }),
      report({ id: 'h', status: 'handled', created_at: new Date('2026-09-28T10:00:00').toISOString() }),
    ];
    const inbox = reportInbox(rows, places, now);
    expect(inbox).toEqual({ places: 0, reports: 0, archivedPlaces: 0, suggestions: 0, today: 1 });
    expect(inboxHasWork(inbox)).toBe(false);
    expect(reportInboxText(inbox)).toBe('오늘 들어온 것 1건');
    expect(reportInboxText(reportInbox([], places, now))).toBeNull();
  });

  it('내린 곳에 남은 제보는 등록 해제 칸 몫 — 등록 완료 칸으로 보내는 숫자에 넣지 않는다', () => {
    const rows = [report({ id: 'a', place_id: 'p3' }), report({ id: 'b', place_id: 'p1' })];
    const inbox = reportInbox(rows, places, now);
    expect(inbox).toMatchObject({ places: 1, reports: 1, archivedPlaces: 1 });
    expect(countReportedPlaces(openReportsByPlace(rows), places, true)).toBe(1);
    expect(reportInboxText(inbox)).toBe('열린 제보 1곳 · 등록 해제 칸에 열린 제보 1곳');
  });

  it('목록을 아직 못 읽었으면 등록 완료 칸 몫으로 센다 — 제보는 게시중인 곳에만 들어온다', () => {
    expect(reportInbox([report({ id: 'a', place_id: 'zz' })], [], now)).toMatchObject({ places: 1, reports: 1 });
  });
});

describe('reportBuildText — 해시가 아니라 지금/예전 사이트(14 W261010.14)', () => {
  it('이 화면과 같은 빌드면 지금 사이트, 다르면 예전 사이트, 없으면 말하지 않는다', () => {
    expect(reportBuildText('abc1234', 'abc1234')).toBe('지금 사이트를 보고 보냄');
    expect(reportBuildText('dda522e', 'abc1234')).toBe('예전 사이트를 보고 보냄 — 그 뒤 고친 것일 수 있어요');
    expect(reportBuildText(null, 'abc1234')).toBeNull();
    expect(reportBuildText('dda522e', 'abc1234')).not.toContain('dda522e');
  });
});

describe('requestSuggestionCollect', () => {
  const insertClient = (error: { code?: string; message: string } | null) => {
    const calls: { table: string; row: Record<string, unknown> }[] = [];
    const client = {
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          calls.push({ table, row });
          return Promise.resolve({ error });
        },
      }),
    } as unknown as SupabaseClient;
    return { calls, client };
  };

  it('추가 수집과 같은 표에 후보 없이 한 줄 — 검색어·이름 키는 추가 수집과 같은 함수', async () => {
    const { calls, client } = insertClient(null);
    await expect(requestSuggestionCollect(client, '카페 바당')).resolves.toBe('queued');
    expect(calls).toEqual([{ table: 'collect_requests', row: { query: '제주 카페 바당', name: '카페 바당', name_key: expect.any(String) } }]);
    expect(calls[0].row).not.toHaveProperty('candidate_id');
  });

  it('이미 대기 중(23505)은 실패가 아니다 · 다른 오류는 던진다', async () => {
    await expect(requestSuggestionCollect(insertClient({ code: '23505', message: 'dup' }).client, '바당')).resolves.toBe('alreadyQueued');
    await expect(requestSuggestionCollect(insertClient({ code: '42501', message: 'denied' }).client, '바당')).rejects.toThrow('수집 요청');
  });
});

describe('setReportStatus', () => {
  it('상태·메모·시각을 함께 쓴다', async () => {
    const { calls, client } = fakeClient([report({ status: 'handled' })]);
    await setReportStatus(client, ['r1'], 'handled', ' 고침 ', '2026-10-01T00:00:00.000Z');
    expect(calls[0]).toEqual({
      payload: { status: 'handled', handled_note: '고침', handled_at: '2026-10-01T00:00:00.000Z' },
      ids: ['r1'],
    });
  });

  it('0행은 성공이 아니다', async () => {
    const { client } = fakeClient([]);
    await expect(setReportStatus(client, ['r1'], 'dismissed', undefined, 'x')).rejects.toThrow('바뀐 줄이 없어요');
  });
});

describe('closeReportsForArchived', () => {
  it('그 장소의 처리할 제보만 닫고, 실패해도 던지지 않는다', async () => {
    const rows = [report({ id: 'a' }), report({ id: 'b', place_id: 'p2' }), report({ id: 'c', kind: 'visited_ok' })];
    const { calls, client } = fakeClient([report({ id: 'a', status: 'handled' })]);
    await closeReportsForArchived(client, rows, 'p1', 'now');
    expect(calls[0].ids).toEqual(['a']);
    const failing = fakeClient(null, { message: 'x' });
    expect(await closeReportsForArchived(failing.client, rows, 'p1', 'now')).toEqual([]);
  });
});

describe('mergeReportRows', () => {
  it('바뀐 행을 덮는다', () => {
    expect(mergeReportRows([report({ id: 'a' }), report({ id: 'b' })], [report({ id: 'b', status: 'dismissed' })]).map((r) => r.status)).toEqual([
      'open',
      'dismissed',
    ]);
  });
});

describe('visitedTallyByPlace', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');
  const visit = (id: string, created_at: string, patch: Partial<TReportRow> = {}) => report({ id, kind: 'visited_ok', created_at, ...patch });

  it('30일 안 2건이면 ready, 1건이면 아니다', () => {
    const tally = visitedTallyByPlace([visit('a', '2026-09-20T00:00:00.000Z'), visit('b', '2026-09-28T00:00:00.000Z')], {}, now);
    expect(tally.p1).toEqual({ ids: ['a', 'b'], ready: true });
    expect(visitedTallyByPlace([visit('a', '2026-09-20T00:00:00.000Z')], {}, now).p1.ready).toBe(false);
  });

  it('창 밖·마지막 확인 이전·닫힌 것은 세지 않는다', () => {
    const rows = [
      visit('old', '2026-08-01T00:00:00.000Z'),
      visit('before', '2026-09-10T00:00:00.000Z'),
      visit('closed', '2026-09-25T00:00:00.000Z', { status: 'handled' }),
      visit('after', '2026-09-25T00:00:00.000Z'),
    ];
    expect(visitedTallyByPlace(rows, { p1: '2026-09-15T00:00:00.000Z' }, now).p1).toEqual({ ids: ['after'], ready: false });
  });

  it('열린 폐업 제보가 있으면 ready 가 서지 않는다', () => {
    const rows = [visit('a', '2026-09-20T00:00:00.000Z'), visit('b', '2026-09-28T00:00:00.000Z'), report({ id: 'c', kind: 'closed' })];
    expect(visitedTallyByPlace(rows, {}, now).p1.ready).toBe(false);
  });
});

describe('suggestionSearchName', () => {
  it('첫 구분자 앞을 이름으로', () => {
    expect(suggestionSearchName('카페 바당, 애월읍 — 테라스')).toBe('카페 바당');
    expect(suggestionSearchName('돌하르방 식당 - 한림')).toBe('돌하르방 식당');
    expect(suggestionSearchName('  숨도  ')).toBe('숨도');
    expect(suggestionSearchName(null)).toBe('');
  });
});

describe('policyReportCounts — 조건이 달라요 제보만 센다(11 T3.2)', () => {
  it('policy 만, 0 인 장소는 빠진다', () => {
    const r = (kind: string) => ({ kind }) as never;
    expect(policyReportCounts({ p1: [r('policy'), r('closed'), r('policy')], p2: [r('address')] })).toEqual({ p1: 2 });
  });
});
