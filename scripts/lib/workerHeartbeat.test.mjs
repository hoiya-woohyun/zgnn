import { describe, expect, it } from 'vitest';
import { startHeartbeat } from './workerHeartbeat.mjs';

/** `from('workers').upsert(row, opts)` · `.update(patch).eq('host', h)` 모양만. `fail()` 이 참이면 update 가 오류를 준다. */
function fakeClient(name, { upsertError = null, fail = () => false } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        async upsert(row, opts) {
          calls.push({ client: name, table, op: 'upsert', row, opts });
          return { error: upsertError };
        },
        update(patch) {
          return {
            async eq(col, value) {
              calls.push({ client: name, table, op: 'update', patch, col, value });
              return { error: fail() ? { message: 'JWT expired' } : null };
            },
          };
        },
      };
    },
  };
}

const opts = (lines) => ({ host: 'mac', version: 'abc1234', intervalMs: 3_600_000, warn: (line) => lines.push(line) });

describe('startHeartbeat — workers 행 하나(17 리뷰 17)', () => {
  it('시작은 idle 로 upsert, 실패하면 던진다(표가 없으면 거기서 멈춰 말한다)', async () => {
    const client = fakeClient('a');
    const hb = await startHeartbeat(client, opts([]));
    expect(client.calls[0]).toMatchObject({ op: 'upsert', row: { host: 'mac', phase: 'idle', run_id: null, version: 'abc1234' }, opts: { onConflict: 'host' } });
    await hb.close();
    await expect(startHeartbeat(fakeClient('b', { upsertError: { message: 'relation "workers" does not exist' } }), opts([]))).rejects.toThrow(/workers 행을 못 세움/);
  });

  it('그 뒤 쓰기는 fail-soft — 끊긴 순간 한 줄, 이어지는 실패는 조용히, 다시 붙으면 한 줄', async () => {
    let failing = true;
    const lines = [];
    const hb = await startHeartbeat(fakeClient('a', { fail: () => failing }), opts(lines));
    await hb.setPhase('analyze');
    await hb.setRunId('run-1');
    await hb.setPhase('idle');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^⚠️ 워커 심장 못 씀\(JWT expired\)/);
    failing = false;
    await hb.setPhase('apply');
    expect(lines).toEqual([lines[0], '워커 심장 다시 붙음']);
    expect(hb.phase()).toBe('apply');
    await hb.close();
  });

  it('setClient — 재로그인 뒤 새 클라이언트로 쓴다, close 는 idle 로 닫는다', async () => {
    const old = fakeClient('old');
    const next = fakeClient('new');
    const hb = await startHeartbeat(old, opts([]));
    hb.setClient(next);
    await hb.setPhase('collect', 'run-2');
    await hb.close();
    expect(old.calls.filter((c) => c.op === 'update')).toHaveLength(0);
    expect(next.calls.map((c) => c.patch)).toEqual([
      expect.objectContaining({ phase: 'collect', run_id: 'run-2' }),
      expect.objectContaining({ phase: 'idle', run_id: null }),
    ]);
    expect(next.calls.every((c) => c.col === 'host' && c.value === 'mac')).toBe(true);
    expect(hb.phase()).toBe('idle');
  });
});
