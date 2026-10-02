import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifySendFailure, sendPlaceReport } from './placeReportSend';

const row = { place_id: 'p1', kind: 'closed' as const, note: null, app_build: 'dev' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifySendFailure', () => {
  it('표가 없거나 권한이 없으면 unavailable, CHECK 위반은 rejected', () => {
    expect(classifySendFailure(404, 'PGRST205')).toBe('unavailable');
    expect(classifySendFailure(401)).toBe('unavailable');
    expect(classifySendFailure(403, '42501')).toBe('unavailable');
    expect(classifySendFailure(400, '23514')).toBe('rejected');
    expect(classifySendFailure(500)).toBe('network');
  });
});

describe('sendPlaceReport', () => {
  it('apikey 하나와 return=minimal 로 보낸다 — 본문을 달라고 하지 않는다(select 권한이 없다)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendPlaceReport(row)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/rest\/v1\/place_reports$/);
    const headers = init.headers as Record<string, string>;
    expect(headers.Prefer).toBe('return=minimal');
    expect(headers.apikey).toMatch(/^sb_publishable_/);
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual(row);
  });

  it('응답의 코드로 실패를 가른다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'PGRST205' }), { status: 404 })));
    expect(await sendPlaceReport(row)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('네트워크가 던지면 network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    expect(await sendPlaceReport(row)).toEqual({ ok: false, reason: 'network' });
  });
});
