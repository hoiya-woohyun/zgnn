import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  closeReportsForArchived,
  mergeReportRows,
  needsHandling,
  openReportsByPlace,
  openSuggestions,
  countReportedPlaces,
  inboxDestination,
  reportInbox,
  reportInboxText,
  reportBuildText,
  setReportStatus,
  type TReportRow,
  suggestionPrefillName,
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
    expect(inboxDestination(inbox)).toBe('places');
  });

  it('다녀왔어요·닫힌 것은 할 일이 아니다 — 오늘 들어온 것으로만 말한다', () => {
    const rows = [
      report({ id: 'v', kind: 'visited_ok', created_at: new Date('2026-10-05T09:00:00').toISOString() }),
      report({ id: 'h', status: 'handled', created_at: new Date('2026-09-28T10:00:00').toISOString() }),
    ];
    const inbox = reportInbox(rows, places, now);
    expect(inbox).toEqual({ places: 0, reports: 0, archivedPlaces: 0, suggestions: 0, today: 1 });
    expect(inboxDestination(inbox)).toBeNull();
    expect(reportInboxText(inbox)).toBe('오늘 들어온 것 1건');
    expect(reportInboxText(reportInbox([], places, now))).toBeNull();
  });

  it('내린 곳에 남은 제보는 등록 해제 칸 몫 — 등록 완료 칸으로 보내는 숫자에 넣지 않는다', () => {
    const rows = [report({ id: 'a', place_id: 'p3' }), report({ id: 'b', place_id: 'p1' })];
    const inbox = reportInbox(rows, places, now);
    expect(inbox).toMatchObject({ places: 1, reports: 1, archivedPlaces: 1 });
    expect(countReportedPlaces(openReportsByPlace(rows), places, true)).toBe(1);
    expect(reportInboxText(inbox)).toBe('열린 제보 1곳 · 등록 해제 칸에 열린 제보 1곳');
    // 둘 다면 등록 완료 칸으로 — 그 칸을 다 처리하면 다음은 등록 해제 칸이다.
    expect(inboxDestination(inbox)).toBe('places');
  });

  it('등록 해제 칸에만 남으면 그 칸으로 보낸다 — 말만 하고 데려가지 않던 자리(14 W261010.13a ③)', () => {
    const inbox = reportInbox([report({ id: 'a', place_id: 'p3' })], places, now);
    expect(inbox).toMatchObject({ places: 0, suggestions: 0, archivedPlaces: 1 });
    expect(inboxDestination(inbox)).toBe('archived');
    // 제안이 있으면 등록 완료 칸이 먼저다(제안은 그 칸의 칩을 켜면 선다).
    expect(inboxDestination({ ...inbox, suggestions: 1 })).toBe('places');
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

describe('suggestionPrefillName — 고쳐서 요청한 이름으로 다시 선다(14 W261010.13a ④)', () => {
  const sentence = '애월 바닷가 카페 바당 강아지 데려갈 수 있어요';

  it('요청이 없으면 첫 구분자 앞 — 문장이면 한 줄 통째(그래서 화면에 고칠 칸이 있다)', () => {
    expect(suggestionPrefillName('카페 바당, 애월읍', [])).toBe('카페 바당');
    expect(suggestionPrefillName(sentence, [])).toBe(sentence);
  });

  it('한 줄에 든 이름으로 요청했으면 그 이름 — 새로고침 뒤에도 요청 줄이 다시 선다', () => {
    expect(suggestionPrefillName(sentence, [{ name: '카페 바당' }])).toBe('카페 바당');
    // 가장 긴 것 — 짧은 이름이 우연히 들어 있는 것보다 운영자가 고른 것이다.
    expect(suggestionPrefillName(sentence, [{ name: '바당' }, { name: '카페 바당' }])).toBe('카페 바당');
    // 공백이 달라도 같은 이름이다.
    expect(suggestionPrefillName('애월  바닷가 카페   바당 돼요', [{ name: '카페 바당' }])).toBe('카페 바당');
  });

  it('처음 이름에 요청이 있으면 그대로 · 한 줄에 없는 이름 · 한 글자 이름은 고르지 않는다', () => {
    expect(suggestionPrefillName('카페 바당, 애월읍 — 애월', [{ name: '카페 바당' }, { name: '애월읍' }])).toBe('카페 바당');
    expect(suggestionPrefillName(sentence, [{ name: '숨도' }])).toBe(sentence);
    expect(suggestionPrefillName(sentence, [{ name: '카' }])).toBe(sentence);
  });
});

describe('policyReportCounts — 조건이 달라요 제보만 센다(11 T3.2)', () => {
  it('policy 만, 0 인 장소는 빠진다', () => {
    const r = (kind: string) => ({ kind }) as never;
    expect(policyReportCounts({ p1: [r('policy'), r('closed'), r('policy')], p2: [r('address')] })).toEqual({ p1: 2 });
  });
});
