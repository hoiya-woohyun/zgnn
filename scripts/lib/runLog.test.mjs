import { describe, expect, it } from 'vitest';
import { argFlags, beginRun, classifyRunError, NO_RUN, PROGRESS_MS, RUN_ERROR, setRunListener } from './runLog.mjs';

/**
 * supabase-js 의 `from(t).insert(row)` · `from(t).update(patch, opts).eq(col, v)` 모양만 흉내 낸다.
 * `insert`·`update` 는 결과 객체를 주거나(거부) 예외를 던진다(네트워크).
 */
function fakeClient({ insert = () => ({ error: null }), update = () => ({ error: null, count: 1 }) } = {}) {
  const calls = { insert: [], update: [] };
  return {
    calls,
    from(table) {
      return {
        async insert(row) {
          calls.insert.push({ table, row });
          return insert(row);
        },
        update(patch, opts) {
          return {
            async eq(col, value) {
              calls.update.push({ table, patch, opts, col, value });
              return update(patch);
            },
          };
        },
      };
    },
  };
}

const quiet = () => {
  const lines = [];
  return { lines, warn: (line) => lines.push(line) };
};

describe('beginRun — 기록은 본업을 막지 않는다(fail-soft)', () => {
  it('insert 가 거부되면(표 없음·세션 만료) 경고 한 줄 + id null 핸들, tick/end 는 throw 하지 않는다', async () => {
    const client = fakeClient({ insert: () => ({ error: { message: 'relation "public.pipeline_runs" does not exist', code: '42P01' } }) });
    const log = quiet();
    const run = await beginRun(client, { script: 'collect', args: { keywords: 6 } }, { warn: log.warn });
    expect(run.id).toBeNull();
    await expect(run.tick()).resolves.toBeUndefined();
    await expect(run.end({ status: 'ok', stats: { fetched: 1 } })).resolves.toBeUndefined();
    expect(log.lines).toEqual(['⚠️ 실행 기록 못 남김: relation "public.pipeline_runs" does not exist']);
    expect(client.calls.update).toHaveLength(0);
  });

  it('insert 가 던져도(네트워크) 같은 결과 — 경고의 URL 은 지운다', async () => {
    const client = fakeClient({
      insert: () => {
        throw new TypeError('fetch failed https://abc.supabase.co/rest/v1/pipeline_runs\n  at stack');
      },
    });
    const log = quiet();
    const run = await beginRun(client, { script: 'analyze' }, { warn: log.warn });
    expect(run).toBe(NO_RUN);
    expect(log.lines).toEqual(['⚠️ 실행 기록 못 남김: fetch failed <url>']);
  });

  it('성공하면 id 를 미리 정해 넣는다(.select() 없이) — 시작·심장 시각은 이 프로세스의 시계', async () => {
    const client = fakeClient();
    const run = await beginRun(client, { script: 'apply', args: null }, { now: () => Date.parse('2026-10-06T01:00:00Z') });
    expect(run.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(client.calls.insert).toEqual([
      { table: 'pipeline_runs', row: { id: run.id, script: 'apply', args: null, started_at: '2026-10-06T01:00:00.000Z', heartbeat_at: '2026-10-06T01:00:00.000Z' } },
    ]);
  });
});

describe('tick — 60초에 한 번만 쓴다', () => {
  it('자주 불러도 60초가 안 지났으면 쓰지 않고, 지나면 heartbeat_at 하나만 쓴다', async () => {
    let t = 0;
    const client = fakeClient();
    const run = await beginRun(client, { script: 'analyze' }, { now: () => t });
    t = 59_000;
    await run.tick();
    expect(client.calls.update).toHaveLength(0);
    t = 60_000;
    await run.tick();
    await run.tick();
    expect(client.calls.update).toHaveLength(1);
    expect(client.calls.update[0]).toMatchObject({ patch: { heartbeat_at: new Date(60_000).toISOString() }, col: 'id', value: run.id });
  });

  it('갱신이 던져도 삼킨다', async () => {
    let t = 0;
    const client = fakeClient({
      update: () => {
        throw new Error('network');
      },
    });
    const run = await beginRun(client, { script: 'analyze' }, { now: () => t });
    t = 120_000;
    await expect(run.tick()).resolves.toBeUndefined();
  });
});

describe('progress — 5초에 한 번만 쓴다', () => {
  it('첫 값은 바로, 그 뒤 5초 안의 값은 버리고, 지나면 progress 하나만 쓴다', async () => {
    let t = 0;
    const client = fakeClient();
    const run = await beginRun(client, { script: 'analyze' }, { now: () => t });
    await run.progress({ done: 0, total: 40, current: '애월 카페' });
    t = PROGRESS_MS - 1;
    await run.progress({ done: 1, total: 40, current: '협재 펜션' });
    expect(client.calls.update).toHaveLength(1);
    t = PROGRESS_MS;
    await run.progress({ done: 2, total: 40, current: '성산 식당' });
    expect(client.calls.update).toHaveLength(2);
    expect(client.calls.update.map((c) => c.patch)).toEqual([
      { progress: { done: 0, total: 40, current: '애월 카페' } },
      { progress: { done: 2, total: 40, current: '성산 식당' } },
    ]);
    expect(client.calls.update[1]).toMatchObject({ col: 'id', value: run.id });
  });

  it('심장과 따로 센다 — progress 가 썼다고 tick 이 밀리지 않는다', async () => {
    let t = 0;
    const client = fakeClient();
    const run = await beginRun(client, { script: 'analyze' }, { now: () => t });
    t = 60_000;
    await run.progress({ done: 1, total: 2 });
    await run.tick();
    expect(client.calls.update.map((c) => Object.keys(c.patch)[0])).toEqual(['progress', 'heartbeat_at']);
  });

  it('갱신이 던져도 삼키고, 닫힌 뒤와 NO_RUN 은 아무것도 안 한다', async () => {
    const throwing = await beginRun(fakeClient({ update: () => { throw new Error('network'); } }), { script: 'analyze' });
    await expect(throwing.progress({ done: 1, total: 2 })).resolves.toBeUndefined();
    let t = 0;
    const client = fakeClient();
    const run = await beginRun(client, { script: 'analyze' }, { now: () => t });
    await run.end({ status: 'ok' });
    t = PROGRESS_MS * 2;
    await run.progress({ done: 2, total: 2 });
    expect(client.calls.update).toHaveLength(1);
    await expect(NO_RUN.progress({ done: 1, total: 1 })).resolves.toBeUndefined();
  });
});

describe('setRunListener — 워커가 실행 행 id 를 받는 길', () => {
  it('행이 섰을 때만 알리고, 리스너가 던져도 실행은 그대로다', async () => {
    const seen = [];
    try {
      setRunListener((r) => seen.push(r));
      const run = await beginRun(fakeClient(), { script: 'apply' });
      await beginRun(fakeClient({ insert: () => ({ error: { message: 'x' } }) }), { script: 'collect' }, { warn: () => {} });
      expect(seen).toEqual([{ id: run.id, script: 'apply' }]);
      setRunListener(() => {
        throw new Error('listener');
      });
      expect((await beginRun(fakeClient(), { script: 'analyze' })).id).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      setRunListener(null);
    }
  });
});

describe('end', () => {
  it('상태·stats·끝 시각을 한 번에 쓰고, 두 번째 호출은 아무것도 안 한다', async () => {
    let t = 0;
    const client = fakeClient();
    const run = await beginRun(client, { script: 'collect' }, { now: () => t });
    t = 90_000;
    await run.end({ status: 'ok', stats: { fetched: 3, new: 1 } });
    await run.end({ status: 'failed', error: RUN_ERROR.unknown });
    expect(client.calls.update).toHaveLength(1);
    expect(client.calls.update[0].patch).toEqual({
      status: 'ok',
      stats: { fetched: 3, new: 1 },
      error: null,
      ended_at: new Date(90_000).toISOString(),
      heartbeat_at: new Date(90_000).toISOString(),
    });
    expect(client.calls.update[0].opts).toEqual({ count: 'exact' });
  });

  it('error 에 섞여 온 URL 은 지우고 200자로 자른다', async () => {
    const client = fakeClient();
    const run = await beginRun(client, { script: 'apply' });
    await run.end({ status: 'failed', error: `알 수 없음 https://example.com/x?y=1 ${'가'.repeat(300)}` });
    const { error } = client.calls.update[0].patch;
    expect(error.startsWith('알 수 없음 <url> 가')).toBe(true);
    expect(error).toHaveLength(200);
  });

  it('닫기가 실패하면(세션 만료·0행) throw 하지 않고 "기록 못 닫음" 한 줄', async () => {
    for (const update of [
      () => ({ error: { message: 'JWT expired' } }),
      () => ({ error: null, count: 0 }),
      () => {
        throw new Error('fetch failed');
      },
    ]) {
      const log = quiet();
      const run = await beginRun(fakeClient({ update }), { script: 'analyze' }, { warn: log.warn });
      await expect(run.end({ status: 'ok' })).resolves.toBeUndefined();
      expect(log.lines).toHaveLength(1);
      expect(log.lines[0]).toMatch(/^⚠️ 실행 기록 못 닫음\(.+\) — 화면에 중단된 듯으로 보일 수 있어요$/);
    }
  });
});

describe('classifyRunError · argFlags', () => {
  it('던지는 자리가 붙인 분류만 믿는다 — 메시지는 읽지 않는다', () => {
    expect(classifyRunError(Object.assign(new Error('x'), { runError: RUN_ERROR.naver429 }))).toBe('네이버 검색 429');
    expect(classifyRunError(new Error('status=429 claude 인증 실패'))).toBe('알 수 없음');
    expect(classifyRunError({ runError: '장소명 같은 아무 문자열' })).toBe('알 수 없음');
    expect(classifyRunError(undefined)).toBe('알 수 없음');
  });

  it('플래그 이름만 남기고 값은 버린다', () => {
    expect(argFlags(['--limit', '30', '--dump=data/raw/x.json', '--no-geo', '--limit', '5'])).toEqual(['--limit', '--dump', '--no-geo']);
    expect(argFlags(['approve', 'abc123', '--note', '폐업한 가게명'])).toEqual(['--note']);
  });
});
