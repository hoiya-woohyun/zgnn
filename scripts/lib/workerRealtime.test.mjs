import { describe, expect, it } from 'vitest';
import { REALTIME_BINDINGS, REALTIME_STEP, shouldWake, startRealtime } from './workerRealtime.mjs';

describe('shouldWake — 이 변경이 할 일을 늘렸나', () => {
  it('collect_requests · pipeline_requests 는 INSERT 면 깨우고, 그 밖의 변경은 아니다', () => {
    for (const table of ['collect_requests', 'pipeline_requests']) {
      expect(shouldWake(table, 'INSERT', { status: 'queued' })).toBe(true);
      expect(shouldWake(table, 'UPDATE', { status: 'done' })).toBe(false);
    }
  });

  it('candidates 는 approved 가 된 UPDATE 만 — 서버 필터가 새도 거른다', () => {
    expect(shouldWake('candidates', 'UPDATE', { status: 'approved' })).toBe(true);
    expect(shouldWake('candidates', 'UPDATE', { status: 'merged' })).toBe(false);
    expect(shouldWake('candidates', 'INSERT', { status: 'approved' })).toBe(false);
  });

  it('blog_posts 는 요청 글이 된 UPDATE 만 — 분석이 analyzed_at 을 찍는 UPDATE 는 아니다', () => {
    expect(shouldWake('blog_posts', 'UPDATE', { requested_at: '2026-10-07T05:00:00Z', analyzed_at: null })).toBe(true);
    expect(shouldWake('blog_posts', 'UPDATE', { requested_at: '2026-10-07T05:00:00Z', analyzed_at: '2026-10-07T05:01:00Z' })).toBe(false);
    expect(shouldWake('blog_posts', 'UPDATE', { requested_at: null, analyzed_at: null })).toBe(false);
    expect(shouldWake('blog_posts', 'UPDATE', undefined)).toBe(false);
  });

  it('모르는 표는 깨우지 않는다', () => {
    expect(shouldWake('places', 'UPDATE', { status: 'approved' })).toBe(false);
  });

  it('듣는 표마다 단계 key 가 정해져 있다(pipeline_requests 는 원래 늘 돌아 null)', () => {
    expect(REALTIME_BINDINGS.map((b) => b.table).sort()).toEqual(Object.keys(REALTIME_STEP).sort());
  });
});

/** supabase-js 의 channel 을 흉내 — on 을 모으고, subscribe 콜백을 손으로 부른다. */
function fakeClient() {
  const channels = [];
  return {
    channels,
    removed: [],
    channel(name) {
      const ch = {
        name,
        bindings: [],
        on(type, filter, handler) {
          ch.bindings.push({ type, filter, handler });
          return ch;
        },
        subscribe(callback) {
          ch.status = callback;
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    },
    async removeChannel(ch) {
      this.removed.push(ch);
      ch.status?.('CLOSED');
    },
  };
}

describe('startRealtime', () => {
  it('채널 하나에 넷을 걸고, 깨울 이벤트만 단계 key 와 함께 넘긴다', () => {
    const client = fakeClient();
    const events = [];
    startRealtime(client, { onEvent: (key) => events.push(key), log: () => {} });
    const [ch] = client.channels;
    expect(ch.name).toBe('worker');
    expect(ch.bindings.map((b) => b.filter)).toEqual([
      { event: 'INSERT', schema: 'public', table: 'collect_requests' },
      { event: 'INSERT', schema: 'public', table: 'pipeline_requests' },
      { event: 'UPDATE', schema: 'public', table: 'candidates', filter: 'status=eq.approved' },
      { event: 'UPDATE', schema: 'public', table: 'blog_posts' },
    ]);
    const fire = (i, payload) => ch.bindings[i].handler(payload);
    fire(0, { table: 'collect_requests', eventType: 'INSERT', new: {} });
    fire(1, { table: 'pipeline_requests', eventType: 'INSERT', new: {} });
    fire(3, { table: 'blog_posts', eventType: 'UPDATE', new: { requested_at: 'x', analyzed_at: 'y' } });
    fire(3, { table: 'blog_posts', eventType: 'UPDATE', new: { requested_at: 'x', analyzed_at: null } });
    expect(events).toEqual(['collect', null, 'analyze:requested']);
  });

  it('상태는 바뀔 때만 한 줄 — 되풀이되는 CHANNEL_ERROR 는 한 번', () => {
    const client = fakeClient();
    const lines = [];
    startRealtime(client, { onEvent: () => {}, log: (line) => lines.push(line) });
    const status = client.channels[0].status;
    status('SUBSCRIBED');
    status('CHANNEL_ERROR', new Error('token has expired'));
    status('TIMED_OUT');
    status('CHANNEL_ERROR');
    status('SUBSCRIBED');
    expect(lines).toEqual(['realtime 연결 — 바뀌면 바로 깬다', 'realtime 끊김(CHANNEL_ERROR · token has expired) — 폴링으로(60초)', 'realtime 연결 — 바뀌면 바로 깬다']);
  });

  it('restart — 옛 채널을 치우고 새 클라이언트로 다시 구독한다. 옛 채널의 CLOSED 는 끊김으로 안 찍는다', async () => {
    const old = fakeClient();
    const next = fakeClient();
    const lines = [];
    const rt = startRealtime(old, { onEvent: () => {}, log: (line) => lines.push(line) });
    old.channels[0].status('SUBSCRIBED');
    await rt.restart(next);
    expect(old.removed).toEqual([old.channels[0]]);
    expect(next.channels).toHaveLength(1);
    next.channels[0].status('SUBSCRIBED');
    await rt.close();
    expect(next.removed).toEqual([next.channels[0]]);
    expect(lines).toEqual(['realtime 연결 — 바뀌면 바로 깬다']);
  });
});
