import { describe, expect, it, vi } from 'vitest';
import { tooShortToWake, WAKE_MIN_REMAINING_S, wakeNotice, wakeRemoteWorker } from './adminWorkerWake';

const NOW = 1_000_000;
const URL = '/api/worker/run';
const session = (left = 2 * 3600) => ({ accessToken: 'tok', expiresAt: NOW + left });
const reply = (status: number, body: unknown) => vi.fn(async () => ({ status, json: async () => body }) as unknown as Response);

describe('tooShortToWake', () => {
  it('남은 50분 정각은 보낸다, 1초 모자라면 안 보낸다', () => {
    expect(tooShortToWake(NOW + WAKE_MIN_REMAINING_S, NOW)).toBe(false);
    expect(tooShortToWake(NOW + WAKE_MIN_REMAINING_S - 1, NOW)).toBe(true);
  });
  it('31분 남은 토큰은 서버에서 1분짜리라 안 보낸다', () => {
    expect(tooShortToWake(NOW + 31 * 60, NOW)).toBe(true);
  });
  it('exp 를 모르면 true', () => {
    expect(tooShortToWake(undefined, NOW)).toBe(true);
    expect(tooShortToWake(Number.NaN, NOW)).toBe(true);
  });
});

describe('wakeRemoteWorker', () => {
  it('주소가 비면 off — fetch 를 안 부른다', async () => {
    const fetchImpl = reply(202, { state: 'started' });
    expect(await wakeRemoteWorker(session(), { url: '', fetchImpl, nowSec: NOW })).toBe('off');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('세션이 없으면 failed', async () => {
    const fetchImpl = reply(202, { state: 'started' });
    expect(await wakeRemoteWorker(null, { url: URL, fetchImpl, nowSec: NOW })).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('토큰이 짧으면 expiring — 보내지 않는다', async () => {
    const fetchImpl = reply(202, { state: 'started' });
    expect(await wakeRemoteWorker(session(31 * 60), { url: URL, fetchImpl, nowSec: NOW })).toBe('expiring');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('202 started·busy, 200 local', async () => {
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl: reply(202, { state: 'started' }), nowSec: NOW })).toBe('started');
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl: reply(202, { state: 'busy' }), nowSec: NOW })).toBe('busy');
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl: reply(200, { state: 'local' }), nowSec: NOW })).toBe('local');
  });
  it('Bearer 토큰을 싣고 POST 한다', async () => {
    const fetchImpl = reply(202, { state: 'started' });
    await wakeRemoteWorker(session(), { url: URL, fetchImpl, nowSec: NOW });
    expect(fetchImpl).toHaveBeenCalledWith(URL, { method: 'POST', headers: { Authorization: 'Bearer tok' } });
  });
  it.each([401, 403, 405, 500])('%i 는 failed', async (status) => {
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl: reply(status, {}), nowSec: NOW })).toBe('failed');
  });
  it('fetch 가 거부돼도 던지지 않고 failed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl, nowSec: NOW })).toBe('failed');
  });
  it('본문이 깨졌거나 낯설면 failed', async () => {
    const broken = vi.fn(async () => ({ status: 202, json: async () => Promise.reject(new SyntaxError('x')) }) as unknown as Response);
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl: broken, nowSec: NOW })).toBe('failed');
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl: reply(202, { state: 'weird' }), nowSec: NOW })).toBe('failed');
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl: reply(202, null), nowSec: NOW })).toBe('failed');
  });
  it('상태와 본문이 어긋나면 failed(200 인데 started)', async () => {
    expect(await wakeRemoteWorker(session(), { url: URL, fetchImpl: reply(200, { state: 'started' }), nowSec: NOW })).toBe('failed');
  });
});

describe('wakeNotice', () => {
  it('failed·expiring 만 말한다', () => {
    expect(wakeNotice('failed')).toContain('못 깨웠어요');
    expect(wakeNotice('expiring')).toContain('다시 로그인');
    for (const quiet of ['started', 'busy', 'local', 'off'] as const) expect(wakeNotice(quiet)).toBeNull();
  });
});
