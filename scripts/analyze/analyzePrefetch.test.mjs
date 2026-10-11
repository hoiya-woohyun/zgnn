import { describe, expect, it } from 'vitest';
import { createAnalyzePrefetch, lookaheadFor } from './analyzePrefetch.mjs';

/** 손으로 풀어 주는 prepare — 몇 개가 동시에 떠 있는지 센다. */
function controlled() {
  const pending = new Map();
  let active = 0;
  let peak = 0;
  const started = [];
  const prepare = (item, index) =>
    new Promise((resolve, reject) => {
      active += 1;
      peak = Math.max(peak, active);
      started.push(index);
      pending.set(index, {
        resolve: (v) => { active -= 1; resolve(v); },
        reject: (e) => { active -= 1; reject(e); },
      });
    });
  return { prepare, pending, started, peak: () => peak };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createAnalyzePrefetch', () => {
  it('동시에 concurrency 건까지만 띄우고, 결과는 순서대로 받는다', async () => {
    const c = controlled();
    const prefetch = createAnalyzePrefetch(['a', 'b', 'c', 'd', 'e'], c.prepare, { concurrency: 2 });
    const first = prefetch.take(0);
    await tick();
    expect(c.started).toEqual([0, 1]);
    // 뒤 글이 먼저 끝나도 받는 쪽은 앞 글을 기다린다 — 빈 칸은 그 사이 다음 글로 채운다
    c.pending.get(1).resolve('B');
    c.pending.get(0).resolve('A');
    expect(await first).toEqual({ ok: true, value: 'A' });
    await tick();
    expect(c.started).toEqual([0, 1, 2, 3]);
    expect(await prefetch.take(1)).toEqual({ ok: true, value: 'B' });
    expect(c.peak()).toBe(2);
  });

  it('느린 앞 글이 다른 칸을 묶지 않는다 — 끝난 칸은 바로 다음 글을 띄운다', async () => {
    const c = controlled();
    const prefetch = createAnalyzePrefetch(['a', 'b', 'c', 'd', 'e'], c.prepare, { concurrency: 2 });
    const first = prefetch.take(0);
    await tick();
    c.pending.get(1).resolve('B');
    await tick();
    c.pending.get(2).resolve('C');
    await tick();
    expect(c.started).toEqual([0, 1, 2, 3]); // 0 이 아직 안 끝났어도
    expect(c.peak()).toBe(2);
    c.pending.get(0).resolve('A');
    expect(await first).toEqual({ ok: true, value: 'A' });
    expect(await prefetch.take(1)).toEqual({ ok: true, value: 'B' });
    expect(await prefetch.take(2)).toEqual({ ok: true, value: 'C' });
  });

  it('앞서 가는 거리는 lookaheadFor 까지 — 받는 글이 나아가야 더 띄운다', async () => {
    const c = controlled();
    const items = Array.from({ length: 10 }, (_, i) => i);
    const prefetch = createAnalyzePrefetch(items, c.prepare, { concurrency: 2 });
    expect(lookaheadFor(2)).toBe(6);
    const first = prefetch.take(0);
    await tick();
    for (const i of [1, 2, 3, 4, 5]) {
      c.pending.get(i).resolve(i);
      await tick();
    }
    expect(c.started).toEqual([0, 1, 2, 3, 4, 5]); // 0 + 6 에서 멈춘다
    c.pending.get(0).resolve(0);
    await first;
    prefetch.take(1);
    await tick();
    expect(c.started).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('concurrency 1 은 지금의 직렬과 같다', async () => {
    const c = controlled();
    const prefetch = createAnalyzePrefetch(['a', 'b'], c.prepare, { concurrency: 1 });
    const first = prefetch.take(0);
    await tick();
    expect(c.started).toEqual([0]);
    c.pending.get(0).resolve('A');
    await first;
    expect(c.started).toEqual([0]);
  });

  it('아직 받지 않은 글의 실패는 감싸 둔다 — 미처리 rejection 이 나지 않는다', async () => {
    const c = controlled();
    const prefetch = createAnalyzePrefetch(['a', 'b'], c.prepare, { concurrency: 2 });
    const first = prefetch.take(0);
    await tick();
    const boom = new Error('quota');
    c.pending.get(1).reject(boom);
    await tick();
    c.pending.get(0).resolve('A');
    expect(await first).toEqual({ ok: true, value: 'A' });
    expect(await prefetch.take(1)).toEqual({ ok: false, error: boom });
  });

  it('prepare 가 동기로 throw 해도 감싼다', async () => {
    const prefetch = createAnalyzePrefetch(['a'], () => { throw new Error('sync'); }, { concurrency: 2 });
    const result = await prefetch.take(0);
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('sync');
  });

  it('시간 예산이 닫히면 더 띄우지 않고 deadlineHit · launched 로 손대지 않은 수를 알린다', async () => {
    const c = controlled();
    let open = 2;
    const prefetch = createAnalyzePrefetch(['a', 'b', 'c', 'd'], c.prepare, { concurrency: 3, canStart: () => open-- > 0 });
    const first = prefetch.take(0);
    await tick();
    expect(c.started).toEqual([0, 1]);
    expect(prefetch.deadlineHit).toBe(true);
    expect(prefetch.launched).toBe(2);
    c.pending.get(0).resolve('A');
    c.pending.get(1).resolve('B');
    await first;
    expect(await prefetch.take(1)).toEqual({ ok: true, value: 'B' });
    expect(await prefetch.take(2)).toBeNull();
  });

  it('canStart 는 앞에서 뒤 절반을 기다리는 글 수를 받는다', async () => {
    const c = controlled();
    const seen = [];
    const prefetch = createAnalyzePrefetch(['a', 'b', 'c', 'd'], c.prepare, { concurrency: 3, canStart: (ahead) => { seen.push(ahead); return true; } });
    const first = prefetch.take(0);
    await tick();
    expect(seen).toEqual([0, 1, 2]);
    // 0 이 끝나 빈 칸이 나면 4번째 글을 띄운다 — 받는 글은 아직 0 이라 앞에 셋(0·1·2)이 기다린다
    c.pending.get(0).resolve('A');
    await first;
    await tick();
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it('stop 뒤로는 띄우지 않지만 이미 뜬 것은 받을 수 있고, settle 이 그것을 기다린다', async () => {
    const c = controlled();
    const prefetch = createAnalyzePrefetch(['a', 'b', 'c'], c.prepare, { concurrency: 2 });
    prefetch.take(0);
    await tick();
    prefetch.stop();
    expect(prefetch.deadlineHit).toBe(false);
    let settled = false;
    const settling = prefetch.settle().then(() => { settled = true; });
    c.pending.get(0).resolve('A');
    await tick();
    expect(settled).toBe(false);
    c.pending.get(1).resolve('B');
    await settling;
    expect(await prefetch.take(1)).toEqual({ ok: true, value: 'B' });
    expect(await prefetch.take(2)).toBeNull();
    expect(c.started).toEqual([0, 1]);
  });
});
