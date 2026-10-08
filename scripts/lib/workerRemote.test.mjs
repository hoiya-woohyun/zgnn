import { describe, expect, it, vi } from 'vitest';
import { HOP_ANALYZE_CAP, HOP_BUDGET_S, bearerToken, handleRun, isBusy, runHop, shouldChain } from './workerRemote.mjs';

const NOW = Date.parse('2026-10-08T03:00:00Z');
const NOW_S = NOW / 1000;
const jwt = (exp) => ['h', Buffer.from(JSON.stringify({ exp })).toString('base64url'), 's'].join('.');
const TOKEN = jwt(NOW_S + 2 * 3600);

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('bearerToken', () => {
  it('Bearer 한 칸만 토큰으로 — 다른 꼴은 null', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer  abc')).toBe('abc');
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Bearer ')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer a b')).toBeNull();
  });
});

describe('shouldChain — 남았고 · 줄였고 · 한도 아니고 · 실효가 한 홉 이상', () => {
  const ran = (patch = {}) => ({ key: 'analyze:requested', step: 'analyze', code: 0, rateLimited: false, remainder: 0, progressed: true, ...patch });
  const base = { history: [ran()], nextSteps: [{ key: 'analyze:requested' }], usableUntilSec: NOW_S + HOP_BUDGET_S, nowSec: NOW_S };

  it('넷이 다 맞으면 잇는다 — 실효가 딱 한 홉(5분)이어도', () => {
    expect(shouldChain(base).chain).toBe(true);
  });

  it('실효 4분59초면 멈춘다', () => {
    expect(shouldChain({ ...base, usableUntilSec: NOW_S + HOP_BUDGET_S - 1 })).toMatchObject({ chain: false });
    expect(shouldChain({ ...base, usableUntilSec: Number.NaN }).chain).toBe(false); // exp 를 못 읽은 토큰
  });

  it('진척이 없으면 멈춘다 — 403 으로 계속 실패하는 글 하나가 한도를 태우지 않게', () => {
    expect(shouldChain({ ...base, history: [ran({ progressed: false })] }).chain).toBe(false);
    expect(shouldChain({ ...base, history: [] }).chain).toBe(false);
  });

  it('수집은 성공(code 0)이면 진척으로 친다 — 실패면 아니다', () => {
    const collect = (code) => ({ key: 'collect', step: 'collect', code, rateLimited: false, remainder: 0, progressed: false });
    expect(shouldChain({ ...base, history: [collect(0)] }).chain).toBe(true);
    expect(shouldChain({ ...base, history: [collect(1)] }).chain).toBe(false);
  });

  it('한도에 걸렸으면 진척이 있어도 멈춘다', () => {
    expect(shouldChain({ ...base, history: [ran(), ran({ key: 'analyze:limit', code: 1, rateLimited: true, progressed: false })] }).chain).toBe(false);
  });

  it('남은 일이 없으면 멈춘다', () => {
    expect(shouldChain({ ...base, nextSteps: [] })).toEqual({ chain: false, why: '남은 일 없음' });
  });
});

describe('handleRun — 401·403 이면 아무것도 돌지 않는다(ADR-028 결정 3)', () => {
  const request = (headers = {}, method = 'POST') => new Request('http://worker.test/api/run', { method, headers });
  const authed = () => request({ Authorization: `Bearer ${TOKEN}` });
  const client = ({ user = { id: 'u1' }, userError = null, operator = true, rpcError = null, throwAt = null } = {}) => ({
    auth: {
      getUser: vi.fn(async () => {
        if (throwAt === 'getUser') throw new Error('network');
        return { data: { user: userError ? null : user }, error: userError };
      }),
    },
    rpc: vi.fn(async () => {
      if (throwAt === 'rpc') throw new Error('network');
      return { data: rpcError ? null : operator, error: rpcError };
    }),
  });
  function deps(patch = {}) {
    const fake = patch.client ?? client();
    return {
      fake,
      deps: {
        createUserClient: vi.fn(() => fake),
        readPeers: vi.fn(async () => []),
        isBusy: () => false,
        startHop: vi.fn(async () => {}),
        waitUntil: vi.fn(),
        log: () => {},
        now: () => NOW,
        ...patch.deps,
      },
    };
  }
  const read = async (res) => ({ status: res.status, body: await res.json() });

  it('POST 가 아니면 405', async () => {
    const { deps: d } = deps();
    expect((await handleRun(request({}, 'GET'), d)).status).toBe(405);
    expect(d.createUserClient).not.toHaveBeenCalled();
  });

  it('Bearer 가 없으면 401 — Supabase 에 묻지도 않는다', async () => {
    const { deps: d } = deps();
    expect(await read(await handleRun(request(), d))).toEqual({ status: 401, body: { state: 'unauthorized' } });
    expect(d.createUserClient).not.toHaveBeenCalled();
    expect(d.startHop).not.toHaveBeenCalled();
  });

  it('getUser 오류·유저 없음·던짐은 401', async () => {
    for (const fake of [client({ userError: { message: 'invalid JWT' } }), client({ throwAt: 'getUser' })]) {
      const { deps: d } = deps({ client: fake });
      expect((await handleRun(authed(), d)).status).toBe(401);
      expect(fake.auth.getUser).toHaveBeenCalledWith(TOKEN);
      expect(fake.rpc).not.toHaveBeenCalled();
      expect(d.startHop).not.toHaveBeenCalled();
      expect(d.waitUntil).not.toHaveBeenCalled();
    }
  });

  it('운영자가 아니거나 rpc 가 실패하면 403', async () => {
    for (const fake of [client({ operator: false }), client({ rpcError: { message: 'boom' } }), client({ throwAt: 'rpc' })]) {
      const { deps: d } = deps({ client: fake });
      expect(await read(await handleRun(authed(), d))).toEqual({ status: 403, body: { state: 'forbidden' } });
      expect(fake.rpc).toHaveBeenCalledWith('is_operator');
      expect(d.readPeers).not.toHaveBeenCalled();
      expect(d.startHop).not.toHaveBeenCalled();
    }
  });

  it('로컬 워커가 60초 안에 뛰었으면 200 local — 서버는 비킨다', async () => {
    const peers = [{ host: 'mac', phase: 'idle', last_seen_at: new Date(NOW - 10_000).toISOString() }];
    const { deps: d } = deps({ deps: { readPeers: vi.fn(async () => peers) } });
    expect(await read(await handleRun(authed(), d))).toEqual({ status: 200, body: { state: 'local' } });
    expect(d.startHop).not.toHaveBeenCalled();
  });

  it('로그인을 기다리는 로컬·서버 자신의 행은 비킬 이유가 아니다, 조회가 실패해도 돈다', async () => {
    const peers = [
      { host: 'mac', phase: 'login-needed', last_seen_at: new Date(NOW - 10_000).toISOString() },
      { host: 'vercel', phase: 'analyze', last_seen_at: new Date(NOW - 10_000).toISOString() },
    ];
    for (const readPeers of [vi.fn(async () => peers), vi.fn(async () => Promise.reject(new Error('workers 조회 실패')))]) {
      const { deps: d } = deps({ deps: { readPeers } });
      expect((await handleRun(authed(), d)).status).toBe(202);
      expect(d.startHop).toHaveBeenCalledTimes(1);
    }
  });

  it('이 인스턴스가 바쁘면 202 busy — 홉을 겹쳐 세우지 않는다', async () => {
    const { deps: d } = deps({ deps: { isBusy: () => true } });
    expect(await read(await handleRun(authed(), d))).toEqual({ status: 202, body: { state: 'busy' } });
    expect(d.startHop).not.toHaveBeenCalled();
    expect(d.waitUntil).not.toHaveBeenCalled();
  });

  it('202 started — 홉 promise 를 waitUntil 에 넘기고, 본문에 토큰이 없다', async () => {
    const { deps: d } = deps();
    const res = await handleRun(authed(), d);
    const text = await res.text();
    expect(res.status).toBe(202);
    expect(JSON.parse(text)).toEqual({ state: 'started' });
    expect(text).not.toContain(TOKEN);
    expect(d.startHop).toHaveBeenCalledWith(TOKEN);
    expect(d.waitUntil).toHaveBeenCalledTimes(1);
    expect(typeof d.waitUntil.mock.calls[0][0].then).toBe('function');
  });
});

describe('runHop — 주입 → 한 바퀴 → 심장 idle → 되돌림 → 사슬', () => {
  /** 가짜 의존성. `order` 에 일어난 순서가 쌓인다. `states` 는 readWorkerState 가 차례로 돌려주는 상태(마지막은 반복). */
  function hopDeps({ states, steps = {}, heartbeatFails = false, chain } = {}) {
    const order = [];
    const listeners = [];
    const queue = [...states];
    const deps = {
      injectSession: vi.fn((token) => {
        order.push('inject');
        return () => order.push('restore');
      }),
      createSupabase: () => {
        order.push('client');
        return {};
      },
      startHeartbeat: vi.fn(async (client, opts) => {
        if (heartbeatFails) throw new Error('workers 행을 못 세움');
        order.push('heartbeat');
        let phase = 'idle';
        return {
          phase: () => phase,
          setPhase: async (next) => {
            phase = next;
          },
          setRunId: async () => {},
          close: async () => order.push('close'),
        };
      }),
      probeExcludedAt: async () => true,
      setRunListener: (fn) => listeners.push(fn),
      readWorkerState: async () => {
        const next = queue.length > 1 ? queue.shift() : queue[0];
        if (next instanceof Error) throw next;
        return { collectQueued: 0, requestedPosts: 0, approved: 0, requestRows: [], ...next };
      },
      takeRequests: async (client, rows) => rows,
      closeRequests: async () => {},
      resolveSupabaseCredentials: () => ({}),
      runStep: async (name, argv) => {
        order.push(`${name} ${argv.join(' ')}`.trim());
        return (await steps[name]?.()) ?? 0;
      },
      chain:
        chain ??
        (async () => {
          order.push(`chain busy=${isBusy()}`);
        }),
      version: 'abc1234',
      log: () => {},
      now: () => NOW,
    };
    return { deps, order, listeners };
  }

  it('남았고 줄였으면 — 심장 close · restore 뒤에(바쁨도 풀린 뒤에) 사슬을 건다', async () => {
    const { deps, order, listeners } = hopDeps({ states: [{ requestedPosts: 8 }, { requestedPosts: 3 }] });
    const decision = await runHop(TOKEN, deps);
    expect(decision.chain).toBe(true);
    expect(order).toEqual(['inject', 'client', 'heartbeat', `analyze --requested-only --limit ${HOP_ANALYZE_CAP}`, 'close', 'restore', 'chain busy=false']);
    expect(deps.injectSession).toHaveBeenCalledWith(TOKEN);
    expect(deps.startHeartbeat.mock.calls[0][1]).toMatchObject({ host: 'vercel', version: 'abc1234' });
    expect(listeners).toHaveLength(2);
    expect(typeof listeners[0]).toBe('function');
    expect(listeners[1]).toBeNull();
    expect(isBusy()).toBe(false);
  });

  it('줄이지 못했으면 사슬을 걸지 않는다', async () => {
    const { deps, order } = hopDeps({ states: [{ requestedPosts: 2 }, { requestedPosts: 2 }] });
    expect((await runHop(TOKEN, deps)).chain).toBe(false);
    expect(order.at(-1)).toBe('restore');
  });

  it('JWT 실효가 한 홉보다 짧으면 사슬을 걸지 않는다', async () => {
    const short = jwt(NOW_S + 30 * 60 + HOP_BUDGET_S - 1); // 실효 = exp − 30분 = 4분59초 뒤
    const { deps, order } = hopDeps({ states: [{ requestedPosts: 8 }, { requestedPosts: 3 }] });
    expect((await runHop(short, deps)).chain).toBe(false);
    expect(order).not.toContain('chain busy=false');
  });

  it('바퀴 중간에 던져도 밖으로 새지 않고 — 리스너·심장·주입·바쁨을 되돌린다, 사슬은 없다', async () => {
    const { deps, order, listeners } = hopDeps({ states: [{ requestedPosts: 8 }, new Error('blog_posts 조회 실패')] });
    await expect(runHop(TOKEN, deps)).resolves.toMatchObject({ chain: false });
    expect(order).toEqual(['inject', 'client', 'heartbeat', `analyze --requested-only --limit ${HOP_ANALYZE_CAP}`, 'close', 'restore']);
    expect(listeners.at(-1)).toBeNull();
    expect(isBusy()).toBe(false);
  });

  it('심장을 못 세우면 단계를 돌리지 않고 주입·바쁨만 되돌린다', async () => {
    const { deps, order } = hopDeps({ states: [{ requestedPosts: 8 }], heartbeatFails: true });
    await expect(runHop(TOKEN, deps)).resolves.toMatchObject({ chain: false });
    expect(order).toEqual(['inject', 'client', 'restore']);
    expect(isBusy()).toBe(false);
  });

  it('사슬 호출이 던져도 홉은 정상으로 끝난다', async () => {
    const { deps } = hopDeps({
      states: [{ requestedPosts: 8 }, { requestedPosts: 3 }],
      chain: async () => {
        throw new Error('fetch failed');
      },
    });
    await expect(runHop(TOKEN, deps)).resolves.toMatchObject({ chain: true });
  });

  it('한 인스턴스에서 홉은 하나만 — 도는 동안 handleRun 은 busy, 겹친 runHop 은 주입도 안 한다', async () => {
    const gate = deferred();
    const first = hopDeps({ states: [{ requestedPosts: 8 }, { requestedPosts: 3 }], steps: { analyze: () => gate.promise.then(() => 0) } });
    const running = runHop(TOKEN, first.deps);
    expect(isBusy()).toBe(true);

    const second = hopDeps({ states: [{ requestedPosts: 8 }] });
    expect(await runHop(TOKEN, second.deps)).toEqual({ chain: false, why: '바쁨' });
    expect(second.deps.injectSession).not.toHaveBeenCalled();

    const fake = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) }, rpc: async () => ({ data: true, error: null }) };
    const startHop = vi.fn(async () => {});
    const res = await handleRun(new Request('http://worker.test/api/run', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } }), {
      createUserClient: () => fake,
      readPeers: async () => [],
      startHop,
      waitUntil: () => {},
      log: () => {},
      now: () => NOW,
    });
    expect(await res.json()).toEqual({ state: 'busy' });
    expect(startHop).not.toHaveBeenCalled();

    gate.resolve();
    await running;
    expect(isBusy()).toBe(false);
  });
});
