import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { TWorkerHealth } from './adminOpsHealth';
import { analyzeRequestView, isAnalyzeLimit, PIPELINE_REQUESTS_UNAVAILABLE_TEXT, requestAnalyze, requestApply } from './adminRequests';

const worker = (state: TWorkerHealth['state']): TWorkerHealth => ({ state, tone: 'ok', label: '', others: 0, hint: null });

/** `from().select().eq().eq()` 세기와 `from().insert()` 넣기만 흉내 낸다. 넣은 행을 `inserted` 에 모은다. */
function fakeClient(opts: { count?: number | null; countError?: { message: string }; insertError?: { code?: string; message: string } }) {
  const inserted: unknown[] = [];
  const counted = { data: null, count: opts.count ?? 0, error: opts.countError ?? null };
  const chain = { eq: () => chain, then: (resolve: (value: typeof counted) => unknown) => resolve(counted) };
  const client = {
    from: () => ({
      select: () => chain,
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: opts.insertError ?? null };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, inserted };
}

describe('isAnalyzeLimit', () => {
  it('10·30·100 만 통과한다', () => {
    expect([10, 30, 100].every(isAnalyzeLimit)).toBe(true);
    expect([0, 20, 50, 101, '10', null, undefined, 10.5].some(isAnalyzeLimit)).toBe(false);
  });
});

describe('requestApply', () => {
  it('대기 중인 apply 가 없으면 빈 args 로 넣는다', async () => {
    const { client, inserted } = fakeClient({ count: 0 });
    await expect(requestApply(client)).resolves.toBe('queued');
    expect(inserted).toEqual([{ kind: 'apply', args: {} }]);
  });

  it('이미 대기 중이면 넣지 않는다(멱등)', async () => {
    const { client, inserted } = fakeClient({ count: 1 });
    await expect(requestApply(client)).resolves.toBe('alreadyQueued');
    expect(inserted).toEqual([]);
  });
});

describe('requestAnalyze', () => {
  it('대기 중인 analyze 가 없으면 limit 만 실어 넣는다', async () => {
    const { client, inserted } = fakeClient({ count: 0 });
    await expect(requestAnalyze(client, { limit: 30 })).resolves.toBe('queued');
    expect(inserted).toEqual([{ kind: 'analyze', args: { limit: 30 } }]);
  });

  it('이미 대기 중이면 넣지 않는다(멱등)', async () => {
    const { client, inserted } = fakeClient({ count: 1 });
    await expect(requestAnalyze(client, { limit: 10 })).resolves.toBe('alreadyQueued');
    expect(inserted).toEqual([]);
  });

  it('세지 못하면 넣지 않고 던진다 — 모르는 채로 겹쳐 넣지 않는다', async () => {
    const { client, inserted } = fakeClient({ countError: { message: '' } });
    await expect(requestAnalyze(client, { limit: 10 })).rejects.toThrow('세지 못했어요');
    expect(inserted).toEqual([]);
  });

  it('표가 없으면 미적용으로 말한다', async () => {
    const { client } = fakeClient({ insertError: { code: 'PGRST205', message: 'Could not find the table' } });
    await expect(requestAnalyze(client, { limit: 10 })).rejects.toThrow(PIPELINE_REQUESTS_UNAVAILABLE_TEXT);
  });

  it('정해 둔 건수가 아니면 부르지도 않는다', async () => {
    const { client, inserted } = fakeClient({ count: 0 });
    await expect(requestAnalyze(client, { limit: 50 as 10 })).rejects.toThrow('건수');
    expect(inserted).toEqual([]);
  });
});

describe('analyzeRequestView', () => {
  it('저수지 수를 알면 "미분석 M건 중 N건", N 은 M 을 넘지 않는다', () => {
    expect(analyzeRequestView(worker('alive'), 120, 30)).toEqual({ label: '미분석 120건 중 30건 분석', disabled: false, hint: null });
    expect(analyzeRequestView(worker('alive'), 4, 10).label).toBe('미분석 4건 중 4건 분석');
    expect(analyzeRequestView(worker('alive'), undefined, 10).label).toBe('저수지 10건 분석');
  });

  it('저수지가 비었으면 끈다', () => {
    expect(analyzeRequestView(worker('alive'), 0, 10)).toMatchObject({ disabled: true, hint: '미분석 글이 없어요' });
  });

  it('워커가 없거나 멎었으면 끄고 켜 달라고 한다', () => {
    expect(analyzeRequestView(worker('none'), 50, 10)).toMatchObject({ disabled: true, hint: expect.stringContaining('워커를 켜 주세요') });
    expect(analyzeRequestView(worker('stale'), 50, 10)).toMatchObject({ disabled: true, hint: expect.stringContaining('멎은 듯') });
  });

  it('서버 워커를 깨울 수 있으면 PC 워커가 없어도 켠다', () => {
    const on = { disabled: false, hint: 'PC 워커가 꺼져 있어 서버 워커가 돌려요' };
    expect(analyzeRequestView(worker('none'), 50, 10, true)).toMatchObject(on);
    expect(analyzeRequestView(worker('stale'), 50, 10, true)).toMatchObject(on);
    expect(analyzeRequestView(worker('none'), 0, 10, true)).toMatchObject({ disabled: true, hint: '미분석 글이 없어요' });
  });

  it('한도 휴식·로그인 기다림은 켜 둔다 — 요청은 남고 깨어나면 돈다', () => {
    expect(analyzeRequestView(worker('rate-limited'), 50, 10)).toMatchObject({ disabled: false, hint: expect.stringContaining('한도 휴식 중') });
    expect(analyzeRequestView(worker('login-needed'), 50, 10)).toMatchObject({ disabled: false, hint: expect.stringContaining('로그인') });
  });

  it('워커를 모르면(집계 못 읽음·마이그레이션 전) 켜 두고 아무 말도 하지 않는다', () => {
    expect(analyzeRequestView(null, 50, 10)).toEqual({ label: '미분석 50건 중 10건 분석', disabled: false, hint: null });
  });
});
