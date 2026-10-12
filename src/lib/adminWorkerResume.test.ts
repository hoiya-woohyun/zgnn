import { describe, expect, it } from 'vitest';
import type { TOpsWorker, TPipelineRun } from './adminOps';
import {
  afterWake,
  CLAUDE_LIMIT_ERROR,
  localTakesOver,
  remainingShrank,
  requestLimitOf,
  RESUME_MAX,
  resumeDecision,
  resumeNotice,
  serverResting,
  type TResumeState,
  type TServerRemaining,
  WAKE_BATCH_POSTS,
  WAKE_PICKUP_MS,
} from './adminWorkerResume';

const NOW = Date.parse('2026-10-13T03:00:00Z');
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();

const worker = (over: Partial<TOpsWorker>): TOpsWorker => ({
  host: 'vercel',
  last_seen_at: ago(90),
  phase: 'idle',
  run_id: null,
  started_at: null,
  version: null,
  ...over,
});

const left = (over: Partial<TServerRemaining> = {}): TServerRemaining => ({ requestedPosts: 0, backlogAsked: 0, collectQueued: 0, ...over });

/** 5분 전에 깨웠고 그 뒤 서버가 돌다 90초 전에 쉰 모양 */
const WOKE = NOW - 5 * 60_000;
const armed = (over: Partial<Extract<TResumeState, { kind: 'armed' }>> = {}): TResumeState => ({
  kind: 'armed',
  baseline: left({ requestedPosts: 17, backlogAsked: 10 }),
  wokeAtMs: WOKE,
  resumes: 0,
  ...over,
});

const analyzeRun = (over: Partial<TPipelineRun>): TPipelineRun => ({
  id: 'r1',
  script: 'analyze',
  status: 'failed',
  started_at: ago(200),
  ended_at: ago(150),
  heartbeat_at: ago(150),
  args: null,
  stats: null,
  error: null,
  alert: null,
  progress: null,
  ...over,
});

describe('requestLimitOf — 서버 requestLimit 과 같은 규칙', () => {
  it('정수 양수만, 없으면 10, 상한 100', () => {
    expect(requestLimitOf({ limit: 30 })).toBe(30);
    expect(requestLimitOf({ limit: 0 })).toBe(10);
    expect(requestLimitOf({ limit: '30' })).toBe(10);
    expect(requestLimitOf(null)).toBe(10);
    expect(requestLimitOf({ limit: 500 })).toBe(100);
  });
});

describe('remainingShrank', () => {
  it('글이 줄면 줄었다', () => {
    expect(remainingShrank(left({ requestedPosts: 17, backlogAsked: 10 }), left({ requestedPosts: 2, backlogAsked: 10 }))).toBe(true);
  });
  it('추가 수집이 돌아 요청 글이 늘어도 수집 요청이 줄었으면 줄었다 — 합으로 보면 거꾸로다', () => {
    expect(remainingShrank(left({ collectQueued: 2 }), left({ requestedPosts: 12 }))).toBe(true);
  });
  it('그대로면 안 줄었다 — 같은 실패를 되풀이하지 않는다', () => {
    expect(remainingShrank(left({ requestedPosts: 3 }), left({ requestedPosts: 3 }))).toBe(false);
  });
});

describe('serverResting', () => {
  it('일하는 중이고 60초 안에 뛰었으면 쉬지 않는다', () => {
    expect(serverResting([worker({ phase: 'analyze', last_seen_at: ago(10) })], WOKE, NOW)).toBe(false);
  });
  it('idle 이 막 쓰였으면 아직 쉬지 않는다 — 사슬의 다음 홉이 곧 행을 다시 쓴다', () => {
    expect(serverResting([worker({ last_seen_at: ago(5) })], WOKE, NOW)).toBe(false);
    expect(serverResting([worker({ last_seen_at: ago(60) })], WOKE, NOW)).toBe(true);
  });
  it('300초에 잘린 홉(일하는 중인데 멎은 행)도 60초 뒤엔 쉰다', () => {
    expect(serverResting([worker({ phase: 'analyze', last_seen_at: ago(61) })], WOKE, NOW)).toBe(true);
  });
  it('깨운 뒤 행이 안 바뀌었으면 받는 시간을 기다린다', () => {
    const woke = NOW - 30_000;
    expect(serverResting([worker({ last_seen_at: ago(600) })], woke, NOW)).toBe(false);
    expect(serverResting([worker({ last_seen_at: ago(600) })], woke, woke + WAKE_PICKUP_MS)).toBe(true);
    expect(serverResting([], woke, NOW)).toBe(false);
  });
});

describe('localTakesOver — 서버 localWorkerAlive 와 같은 규칙', () => {
  it('60초 안에 뛴 PC 행이 있으면 받는다. 로그인·한도 기다림은 못 받는다', () => {
    expect(localTakesOver([worker({ host: 'mac', last_seen_at: ago(10) })], NOW)).toBe(true);
    expect(localTakesOver([worker({ host: 'mac', last_seen_at: ago(10), phase: 'login-needed' })], NOW)).toBe(false);
    expect(localTakesOver([worker({ host: 'mac', last_seen_at: ago(120) })], NOW)).toBe(false);
    expect(localTakesOver([worker({ last_seen_at: ago(1), phase: 'analyze' })], NOW)).toBe(false);
  });
});

describe('resumeDecision', () => {
  const resting = [worker({})];
  const decide = (over: Partial<Parameters<typeof resumeDecision>[0]> = {}) =>
    resumeDecision({ state: armed(), remaining: left({ requestedPosts: 7, backlogAsked: 10 }), workers: resting, lastAnalyze: undefined, nowMs: NOW, ...over });

  it('쉬고 · 남았고 · 줄었으면 깨운다', () => {
    expect(decide()).toEqual({ action: 'wake' });
  });
  it('무장하지 않았거나 서버가 안 쉬면 기다린다', () => {
    expect(decide({ state: { kind: 'off' } })).toEqual({ action: 'wait' });
    expect(decide({ workers: [worker({ phase: 'analyze', last_seen_at: ago(5) })] })).toEqual({ action: 'wait' });
  });
  it('남은 일이 없으면 끝', () => {
    expect(decide({ remaining: left() })).toEqual({ action: 'stop', why: 'done' });
  });
  it('PC 워커가 받으면 비킨다', () => {
    expect(decide({ workers: [...resting, worker({ host: 'mac', last_seen_at: ago(5) })] })).toEqual({ action: 'stop', why: 'local' });
  });
  it('깨운 뒤 분석이 한도로 끝났으면 멈춘다 — 깨우기 전의 한도는 보지 않는다', () => {
    expect(decide({ lastAnalyze: analyzeRun({ error: CLAUDE_LIMIT_ERROR }) })).toEqual({ action: 'stop', why: 'limit' });
    expect(decide({ lastAnalyze: analyzeRun({ error: CLAUDE_LIMIT_ERROR, started_at: new Date(WOKE - 1000).toISOString() }) })).toEqual({ action: 'wake' });
  });
  it('안 줄었으면 멈춘다', () => {
    expect(decide({ remaining: left({ requestedPosts: 17, backlogAsked: 10 }) })).toEqual({ action: 'stop', why: 'stuck' });
  });
  it(`페이지당 ${RESUME_MAX}번에서 멈춘다`, () => {
    expect(decide({ state: armed({ resumes: RESUME_MAX - 1 }) })).toEqual({ action: 'wake' });
    expect(decide({ state: armed({ resumes: RESUME_MAX }) })).toEqual({ action: 'stop', why: 'cap' });
  });
});

describe('afterWake', () => {
  it('받았으면(started·busy) 지금 센 수를 새 기준으로 무장한다', () => {
    expect(afterWake('busy', left({ requestedPosts: 3 }), NOW, 2)).toEqual({ kind: 'armed', baseline: left({ requestedPosts: 3 }), wokeAtMs: NOW, resumes: 2 });
  });
  it('받았는데 기준이 없으면 "못 깨웠다" 가 아니라 "못 셌다" 로 멈춘다', () => {
    expect(afterWake('started', null, NOW, 0)).toEqual({ kind: 'stopped', why: 'uncounted' });
  });
  it('local 은 PC 워커가 받는다, 그 밖은 못 깨운 것', () => {
    expect(afterWake('local', left(), NOW, 0)).toEqual({ kind: 'stopped', why: 'local' });
    expect(afterWake('expiring', left(), NOW, 0)).toEqual({ kind: 'stopped', why: 'unwoken' });
    expect(afterWake('failed', left(), NOW, 0)).toEqual({ kind: 'stopped', why: 'unwoken' });
  });
});

describe('resumeNotice', () => {
  const notice = (over: Partial<Parameters<typeof resumeNotice>[0]> = {}) =>
    resumeNotice({ remote: true, remaining: left({ requestedPosts: 17, backlogAsked: 10 }), state: armed(), resting: true, localAlive: false, ...over });

  it('쉬는데 무장했으면 남은 수와 "곧 이어서" — 끝난 것처럼 보이지 않게', () => {
    expect(notice()).toEqual({ text: `서버가 이번에 ${WAKE_BATCH_POSTS}건까지 돌고 쉬어요 — 남은 글 27건, 곧 이어서 깨워요`, warn: false, canResume: false });
  });
  it('이 화면이 깨운 적 없으면 말하고 이어 돌리기를 내놓는다 — 열기만 해서는 깨우지 않는다', () => {
    expect(notice({ state: { kind: 'off' }, remaining: left({ requestedPosts: 17, collectQueued: 1 }) })).toEqual({
      text: '서버 워커가 쉬는 중이에요 — 남은 글 17건 · 추가 수집 1건',
      warn: false,
      canResume: true,
    });
  });
  it('멈췄으면 왜인지와 남은 수, 이어 돌리기', () => {
    expect(notice({ state: { kind: 'stopped', why: 'cap' } })).toMatchObject({ text: `이 화면에서 ${RESUME_MAX}번 이어 깨웠어요 — 남은 글 27건`, warn: true, canResume: true });
    expect(notice({ state: { kind: 'stopped', why: 'stuck' } })?.text).toMatch(/^지난 깨우기 뒤 줄지 않아 멈췄어요/);
  });
  it(`안 쉬면 ${WAKE_BATCH_POSTS}건을 넘을 때만 한 번에 못 끝난다고 미리 말한다`, () => {
    expect(notice({ resting: false })).toEqual({
      text: `남은 글 27건 — 서버는 한 번 깨우면 ${WAKE_BATCH_POSTS}건까지라 쉬면 이 화면이 이어서 깨워요`,
      warn: false,
      canResume: false,
    });
    expect(notice({ resting: false, remaining: left({ requestedPosts: WAKE_BATCH_POSTS }) })).toBeNull();
  });
  it('서버를 안 깨우는 빌드 · 남은 일 없음 · PC 워커가 받음 · 끝남이면 말하지 않는다', () => {
    expect(notice({ remote: false })).toBeNull();
    expect(notice({ remaining: left() })).toBeNull();
    expect(notice({ remaining: null })).toBeNull();
    expect(notice({ localAlive: true })).toBeNull();
    expect(notice({ state: { kind: 'stopped', why: 'local' } })).toBeNull();
  });
});
