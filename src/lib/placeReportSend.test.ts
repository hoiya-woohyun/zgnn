import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAppStatus, getAppStatus, pressAppStatusAction, showAppStatus, STATUS_UNDO_MS } from './appStatus';
import { classifySendFailure, sendPlaceReport, sendPlaceReportUndoable } from './placeReportSend';

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

  it('keepalive 를 달라면 요청에 싣는다 — 탭을 닫는 순간에 보낼 때', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendPlaceReport(row, { keepalive: true });
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].keepalive).toBe(true);
    await sendPlaceReport(row);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].keepalive).toBeUndefined();
  });
});

describe('sendPlaceReportUndoable — 되돌리기 알림이 걷힐 때 보낸다(14 W261010.7g)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearAppStatus();
  });
  afterEach(() => {
    clearAppStatus();
    vi.useRealTimers();
  });

  const start = () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const onUndo = vi.fn();
    const onDone = vi.fn();
    sendPlaceReportUndoable(row, { text: '고마워요', onUndo, onDone, send });
    return { send, onUndo, onDone };
  };

  it('되돌리기 창이 지나면 한 번 보내고 결과를 넘긴다', async () => {
    const { send, onDone } = start();
    expect(getAppStatus()?.action?.label).toBe('되돌리기');
    vi.advanceTimersByTime(STATUS_UNDO_MS - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(row, { keepalive: false });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith({ ok: true }));
  });

  it('되돌리면 보내지 않는다 — 토스트가 알림을 먼저 걷어도', () => {
    const { send, onUndo } = start();
    pressAppStatusAction(getAppStatus()!.id);
    vi.advanceTimersByTime(STATUS_UNDO_MS * 2);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('화면을 옮겨 셸이 걷거나 다른 알림이 덮으면 그때 보낸다', () => {
    const moved = start();
    clearAppStatus();
    expect(moved.send).toHaveBeenCalledTimes(1);

    const replaced = start();
    showAppStatus('링크를 복사했어요');
    expect(replaced.send).toHaveBeenCalledTimes(1);
  });

  it('탭을 닫거나 다른 앱으로 넘어가면 keepalive 로 한 번, 알림은 걷는다', () => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);

    const hidden = start();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(STATUS_UNDO_MS);
    expect(hidden.send).toHaveBeenCalledTimes(1);
    expect(hidden.send).toHaveBeenCalledWith(row, { keepalive: true });
    expect(getAppStatus()).toBeNull();

    doc.visibilityState = 'visible';
    const closed = start();
    win.dispatchEvent(new Event('pagehide'));
    expect(closed.send).toHaveBeenCalledWith(row, { keepalive: true });

    const undone = start();
    pressAppStatusAction(getAppStatus()!.id);
    win.dispatchEvent(new Event('pagehide'));
    expect(undone.send).not.toHaveBeenCalled();
  });
});
