import { describe, expect, it } from 'vitest';
import { PEER_FRESH_MS, closeRequests, isSchemaMissing, localWorkerAlive, remoteWorkerBusy, settleAnalyzeRequests, takeRequests } from './workerQueue.mjs';

/** `from('pipeline_requests').update(patch).in('id', ids)` · `.eq('id', id)` 모양만. */
function fakeClient(error = null) {
  const calls = [];
  const filter = (patch) => ({
    async in(col, value) {
      calls.push({ patch, col, value });
      return { error };
    },
    async eq(col, value) {
      calls.push({ patch, col, value });
      return { error };
    },
  });
  return { calls, from: () => ({ update: (patch) => filter(patch) }) };
}

describe('isSchemaMissing — 마이그레이션 미적용', () => {
  it('표 없음 · 칸 없음(42703 · column … does not exist) · schema cache', () => {
    expect(isSchemaMissing({ code: 'PGRST205', message: '' })).toBe(true);
    expect(isSchemaMissing({ code: '42703', message: '' })).toBe(true);
    expect(isSchemaMissing({ message: 'column blog_posts.requested_at does not exist' })).toBe(true);
    expect(isSchemaMissing({ code: 'PGRST204', message: "Could not find the 'requested_at' column of 'blog_posts' in the schema cache" })).toBe(true);
    expect(isSchemaMissing({ code: '42501', message: 'permission denied for table blog_posts' })).toBe(false);
    expect(isSchemaMissing(null)).toBe(false);
  });
});

/** `update(patch).eq(..).eq(..).is(..).select('id')` — 걸린 조건을 쌓고, `won` 이 행마다 돌려줄 행 수를 정한다. */
function atomicClient({ won = () => 1, error = null } = {}) {
  const calls = [];
  const from = () => ({
    update(patch) {
      const call = { patch, where: [] };
      calls.push(call);
      const q = {
        eq: (col, value) => (call.where.push(['eq', col, value]), q),
        is: (col, value) => (call.where.push(['is', col, value]), q),
        select: async () => ({ data: error ? null : Array.from({ length: won(call.where[0][2]) }, () => ({ id: call.where[0][2] })), error }),
      };
      return q;
    },
  });
  return { calls, from };
}

describe('takeRequests — 원자 집기', () => {
  const NOW = '2026-10-08T03:00:00.000Z';
  it('queued 는 id · status 조건만, 1행이 오면 집힌 것', async () => {
    const client = atomicClient();
    const rows = [{ id: 'a', status: 'queued' }];
    expect(await takeRequests(client, rows, NOW)).toEqual(rows);
    expect(client.calls).toEqual([{ patch: { status: 'taken', taken_at: NOW }, where: [['eq', 'id', 'a'], ['eq', 'status', 'queued']] }]);
  });

  it('0행이면 남이 먼저 집은 것 — 돌려주지 않는다(일부만 집힐 수 있다)', async () => {
    const client = atomicClient({ won: (id) => (id === 'b' ? 0 : 1) });
    const rows = [{ id: 'a', status: 'queued' }, { id: 'b', status: 'queued' }];
    expect(await takeRequests(client, rows, NOW)).toEqual([rows[0]]);
  });

  it('오래된 taken 은 taken_at 조건도 붙는다(null 이면 is null)', async () => {
    const client = atomicClient();
    await takeRequests(client, [{ id: 'a', status: 'taken', taken_at: '2026-10-08T02:00:00Z' }, { id: 'b', status: 'taken', taken_at: null }], NOW);
    expect(client.calls[0].where).toEqual([['eq', 'id', 'a'], ['eq', 'status', 'taken'], ['eq', 'taken_at', '2026-10-08T02:00:00Z']]);
    expect(client.calls[1].where).toEqual([['eq', 'id', 'b'], ['eq', 'status', 'taken'], ['is', 'taken_at', null]]);
  });

  it('오류는 던지지 않고 경고 한 줄, 그 행은 못 집은 것', async () => {
    const lines = [];
    const client = atomicClient({ error: { message: 'JWT expired' } });
    expect(await takeRequests(client, [{ id: 'a', status: 'queued' }], NOW, (l) => lines.push(l))).toEqual([]);
    expect(lines).toEqual(['⚠️ 요청 a 를 taken 으로 못 적음 — JWT expired']);
  });
});

describe('두 워커의 비킴 — remoteWorkerBusy · localWorkerAlive', () => {
  const now = Date.parse('2026-10-08T03:00:00Z');
  const row = (host, phase, agoMs) => ({ host, phase, last_seen_at: new Date(now - agoMs).toISOString() });

  it('remoteWorkerBusy — vercel 행이 60초 안에 뛰었고 idle 이 아닐 때만', () => {
    expect(remoteWorkerBusy([row('vercel', 'analyze', 5_000)], now)).toBe(true);
    expect(remoteWorkerBusy([row('vercel', 'analyze', PEER_FRESH_MS)], now)).toBe(true); // 경계 포함
    expect(remoteWorkerBusy([row('vercel', 'analyze', PEER_FRESH_MS + 1)], now)).toBe(false);
    expect(remoteWorkerBusy([row('vercel', 'idle', 1_000)], now)).toBe(false);
    expect(remoteWorkerBusy([row('mac', 'analyze', 1_000)], now)).toBe(false);
    expect(remoteWorkerBusy([{ host: 'vercel', phase: 'apply', last_seen_at: 'x' }], now)).toBe(false); // 시각을 못 읽음
    expect(remoteWorkerBusy([], now)).toBe(false);
    expect(remoteWorkerBusy(null, now)).toBe(false);
  });

  it('localWorkerAlive — vercel 아닌 행이 60초 안에 뛰었고 일할 수 있을 때', () => {
    expect(localWorkerAlive([row('mac', 'idle', 1_000)], now)).toBe(true);
    expect(localWorkerAlive([row('mac', 'collect', 1_000)], now)).toBe(true);
    expect(localWorkerAlive([row('mac', 'idle', PEER_FRESH_MS + 1)], now)).toBe(false);
    expect(localWorkerAlive([row('vercel', 'idle', 1_000)], now)).toBe(false);
    // 로그인 기다림·한도 휴식인 PC 는 일을 못 한다 — 서버가 대신 돌아야 한다
    expect(localWorkerAlive([row('mac', 'login-needed', 1_000)], now)).toBe(false);
    expect(localWorkerAlive([row('mac', 'rate-limited', 1_000)], now)).toBe(false);
    expect(localWorkerAlive([row('mac', 'login-needed', 1_000), row('pc2', 'idle', 1_000)], now)).toBe(true);
  });
});

describe('closeRequests — 요청 행 쓰기는 fail-soft', () => {
  it('행마다 정한 patch 를 쓰고, 포기한 요청은 경고한다', async () => {
    const lines = [];
    const client = fakeClient();
    const decide = (row) => (row.id === 'a' ? { patch: { status: 'queued', taken_at: null, args: { attempts: 1 } }, gaveUp: false } : { patch: { status: 'done', args: { attempts: 3 } }, gaveUp: true });
    await closeRequests(client, [{ id: 'a' }, { id: 'b' }], decide, (l) => lines.push(l));
    expect(client.calls.map((c) => [c.value, c.patch.status])).toEqual([
      ['a', 'queued'],
      ['b', 'done'],
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/요청 b 가 3번 돌지 못해 done/);
  });
});

describe('settleAnalyzeRequests — 터미널 분석이 채운 「지금 분석」 요청을 닫는다', () => {
  /** select…eq…eq…order 와 update…eq…eq…select 모양만. `won` 이 false 인 id 는 그 사이 워커가 집은 것(0행). */
  function settleClient({ rows = [], selectError = null, lost = new Set() } = {}) {
    const calls = { select: [], update: [] };
    return {
      calls,
      from: () => ({
        select: () => {
          const record = [];
          calls.select.push(record);
          const link = {
            eq: (col, value) => (record.push(['eq', col, value]), link),
            order: async (col, opts) => (record.push(['order', col, opts]), { data: selectError ? null : rows, error: selectError }),
          };
          return link;
        },
        update: (patch) => {
          const entry = { patch, eq: [] };
          calls.update.push(entry);
          const link = {
            eq: (col, value) => (entry.eq.push([col, value]), link),
            select: async () => {
              const id = entry.eq.find(([col]) => col === 'id')?.[1];
              return { data: lost.has(id) ? [] : [{ id }], error: null };
            },
          };
          return link;
        },
      }),
    };
  }

  it('오래된 것부터, 분석한 글 수로 다 채울 수 있는 요청만 닫고 실행 id 를 잇는다', async () => {
    const client = settleClient({ rows: [{ id: 'a', args: { limit: 10 } }, { id: 'b', args: { limit: 30 } }, { id: 'c', args: { limit: 5 } }] });
    expect(await settleAnalyzeRequests(client, { analyzed: 25, runId: 'run-1' })).toBe(1);
    expect(client.calls.select[0]).toEqual([
      ['eq', 'kind', 'analyze'],
      ['eq', 'status', 'queued'],
      ['order', 'requested_at', { ascending: true }],
    ]);
    // b(30) 를 못 채우면 거기서 멈춘다 — 순서를 건너뛰어 c 를 닫지 않는다(뒤의 것이 앞의 것보다 먼저 끝난 것처럼 보이지 않게)
    expect(client.calls.update).toEqual([{ patch: { status: 'done', run_id: 'run-1' }, eq: [['id', 'a'], ['status', 'queued']] }]);
  });

  it('그 사이 워커가 집은 줄은 건너뛰고 건수도 쓰지 않는다 · 0건·오류는 아무것도 안 한다', async () => {
    const client = settleClient({ rows: [{ id: 'a', args: { limit: 10 } }, { id: 'b', args: { limit: 10 } }], lost: new Set(['a']) });
    expect(await settleAnalyzeRequests(client, { analyzed: 10 })).toBe(1);
    expect(client.calls.update.map((entry) => entry.patch)).toEqual([{ status: 'done' }, { status: 'done' }]);
    expect(await settleAnalyzeRequests(settleClient({ rows: [{ id: 'a' }] }), { analyzed: 0 })).toBe(0);
    expect(await settleAnalyzeRequests(settleClient({ selectError: { message: 'denied' } }), { analyzed: 50 })).toBe(0);
    expect(await settleAnalyzeRequests({ from: () => { throw new Error('network'); } }, { analyzed: 50 })).toBe(0);
  });
});
