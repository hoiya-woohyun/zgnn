import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  closeReportsForArchived,
  mergeReportRows,
  needsHandling,
  openReportsByPlace,
  openSuggestions,
  reportHeadline,
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

describe('reportHeadline', () => {
  it('처리할 것과 오늘 들어온 것을 센다', () => {
    const now = new Date('2026-10-01T12:00:00');
    const rows = [
      report({ created_at: new Date('2026-10-01T09:00:00').toISOString() }),
      report({ kind: 'visited_ok', created_at: new Date('2026-10-01T10:00:00').toISOString() }),
      report({ created_at: new Date('2026-09-28T10:00:00').toISOString() }),
    ];
    expect(reportHeadline(rows, now)).toEqual({ open: 2, today: 2 });
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
