import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 로더의 시간 제한(14 W261010.33g)을 못 박는다. jsdom 을 두지 않아(vitest.config.mts) 로더가 만지는 면 —
 * `window.naver` · `navermap_authFailure` · `document` 의 script 붙이기 — 만 손으로 흉내 내고, load/error 는 테스트가 쏜다.
 * 로더는 모듈 상태(`pending`·`authFailed`·`stalled`)를 들고 있어 매번 새로 import 한다.
 */

type TListener = () => void;

class FakeScript {
  id = '';
  async = false;
  src = '';
  private readonly listeners = new Map<string, TListener[]>();

  constructor(private readonly list: FakeScript[]) {}

  addEventListener(type: string, listener: TListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** `{ once: true }` 로 붙였으니 쏘면 뗀다. */
  fire(type: 'load' | 'error') {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.delete(type);
    for (const listener of listeners) listener();
  }

  remove() {
    const index = this.list.indexOf(this);
    if (index >= 0) this.list.splice(index, 1);
  }
}

type TFakeWindow = { naver?: { maps: unknown }; navermap_authFailure?: () => void };

let scripts: FakeScript[];
let fakeWindow: TFakeWindow;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  scripts = [];
  fakeWindow = {};
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', {
    getElementById: (id: string) => scripts.find((script) => script.id === id) ?? null,
    createElement: () => new FakeScript(scripts),
    head: { appendChild: (script: FakeScript) => scripts.push(script) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const freshLoader = () => import('./naverMap');

/** promise 가 지금 어떤 상태인지 — 마이크로태스크를 비운 뒤 읽는다. */
function track<T>(promise: Promise<T>) {
  const state: { status: 'pending' | 'resolved' | 'rejected'; value?: T } = { status: 'pending' };
  promise.then(
    (value) => Object.assign(state, { status: 'resolved', value }),
    () => Object.assign(state, { status: 'rejected' }),
  );
  return state;
}

/** SDK 가 실행된 것처럼 전역을 세운다. */
const sdkExecuted = () => {
  const maps = { Map: class {} };
  fakeWindow.naver = { maps };
  return maps;
};

describe('loadNaverMaps — 시간 제한 ①(스크립트)', () => {
  it('제때 load 되면 naver.maps 로 resolve 하고, 지난 뒤의 타이머는 아무것도 안 한다', async () => {
    const { loadNaverMaps, NAVER_SDK_TIMEOUT_MS } = await freshLoader();
    const first = track(loadNaverMaps());
    const maps = sdkExecuted();
    scripts[0].fire('load');
    await vi.advanceTimersByTimeAsync(NAVER_SDK_TIMEOUT_MS * 2);
    expect(first).toEqual({ status: 'resolved', value: maps });
    await expect(loadNaverMaps()).resolves.toBe(maps);
  });

  it('스크립트 요청이 응답도 오류도 없이 매달리면 NAVER_SDK_TIMEOUT_MS 에 거부한다', async () => {
    const { loadNaverMaps, NAVER_SDK_TIMEOUT_MS } = await freshLoader();
    const state = track(loadNaverMaps());
    await vi.advanceTimersByTimeAsync(NAVER_SDK_TIMEOUT_MS - 1);
    expect(state.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(state.status).toBe('rejected');
  });

  it('시간 초과 뒤 늦게 온 load 는 버리고, 다음 호출도 바로 거부한다(SDK 가 이미 서 있어도)', async () => {
    const { loadNaverMaps, NAVER_SDK_TIMEOUT_MS } = await freshLoader();
    const state = track(loadNaverMaps());
    await vi.advanceTimersByTimeAsync(NAVER_SDK_TIMEOUT_MS);
    sdkExecuted();
    scripts[0].fire('load');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.status).toBe('rejected');
    await expect(loadNaverMaps()).rejects.toThrow();
    expect(scripts).toHaveLength(1);
  });

  it('시간 초과 뒤 늦게 온 error 가 캐시를 비워도 새 스크립트로 다시 기다리지 않는다', async () => {
    const { loadNaverMaps, NAVER_SDK_TIMEOUT_MS } = await freshLoader();
    void loadNaverMaps().catch(() => {});
    await vi.advanceTimersByTimeAsync(NAVER_SDK_TIMEOUT_MS);
    scripts[0].fire('error');
    expect(scripts).toHaveLength(0);
    await expect(loadNaverMaps()).rejects.toThrow();
    expect(scripts).toHaveLength(0);
  });

  it('error 는 시간 제한을 끈다 — 다음 호출은 새 스크립트로 다시 시도한다(시간 초과와 달리 sticky 아님)', async () => {
    const { loadNaverMaps, NAVER_SDK_TIMEOUT_MS } = await freshLoader();
    const state = track(loadNaverMaps());
    scripts[0].fire('error');
    await vi.advanceTimersByTimeAsync(NAVER_SDK_TIMEOUT_MS * 2);
    expect(state.status).toBe('rejected');
    expect(scripts).toHaveLength(0);
    const retry = track(loadNaverMaps());
    expect(scripts).toHaveLength(1);
    const maps = sdkExecuted();
    scripts[0].fire('load');
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toEqual({ status: 'resolved', value: maps });
  });
});

/** `Event.addListener`·`removeListener` 와 `isReady` 만 가진 가짜 SDK·지도. */
function fakeMap() {
  const handlers = new Set<TListener>();
  const state = { isReady: false };
  const maps = {
    Event: {
      addListener: (_target: object, eventName: string, listener: TListener) => {
        handlers.add(listener);
        return { eventName, listener };
      },
      removeListener: (handle: { listener: TListener }) => handlers.delete(handle.listener),
    },
  } as unknown as typeof naver.maps;
  const fireInit = () => {
    state.isReady = true;
    for (const listener of [...handlers]) listener();
  };
  return { maps, map: state as unknown as naver.maps.Map, handlers, fireInit };
}

describe('watchNaverMapInit — 시간 제한 ②(지도가 일어서기)', () => {
  it("제때 'init' 이 오면 한 번만 true 를 알리고 리스너를 뗀다", async () => {
    const { watchNaverMapInit, NAVER_MAP_INIT_TIMEOUT_MS } = await freshLoader();
    const { maps, map, handlers, fireInit } = fakeMap();
    const onSettle = vi.fn();
    watchNaverMapInit(maps, map, onSettle);
    fireInit();
    await vi.advanceTimersByTimeAsync(NAVER_MAP_INIT_TIMEOUT_MS * 2);
    expect(onSettle.mock.calls).toEqual([[true]]);
    expect(handlers.size).toBe(0);
  });

  it('이미 선 지도면 바로 true', async () => {
    const { watchNaverMapInit } = await freshLoader();
    const { maps, map, fireInit } = fakeMap();
    fireInit();
    const onSettle = vi.fn();
    watchNaverMapInit(maps, map, onSettle);
    expect(onSettle.mock.calls).toEqual([[true]]);
  });

  it("안 서면 NAVER_MAP_INIT_TIMEOUT_MS 에 false, 늦게 온 'init' 은 버리고 로더도 sticky 로 거부한다", async () => {
    const { watchNaverMapInit, loadNaverMaps, NAVER_MAP_INIT_TIMEOUT_MS } = await freshLoader();
    sdkExecuted(); // 스크립트는 왔다(서비스워커 사본) — 매달린 건 스타일·인증이다
    const { maps, map, handlers, fireInit } = fakeMap();
    const onSettle = vi.fn();
    watchNaverMapInit(maps, map, onSettle);
    await vi.advanceTimersByTimeAsync(NAVER_MAP_INIT_TIMEOUT_MS - 1);
    expect(onSettle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onSettle.mock.calls).toEqual([[false]]);
    expect(handlers.size).toBe(0);
    fireInit();
    expect(onSettle.mock.calls).toEqual([[false]]);
    await expect(loadNaverMaps()).rejects.toThrow();
  });

  it('그만 기다리면(언마운트) 아무것도 알리지 않고 sticky 도 안 세운다', async () => {
    const { watchNaverMapInit, loadNaverMaps, NAVER_MAP_INIT_TIMEOUT_MS } = await freshLoader();
    const sdk = sdkExecuted();
    const { maps, map, handlers } = fakeMap();
    const onSettle = vi.fn();
    const stop = watchNaverMapInit(maps, map, onSettle);
    stop();
    await vi.advanceTimersByTimeAsync(NAVER_MAP_INIT_TIMEOUT_MS * 2);
    expect(onSettle).not.toHaveBeenCalled();
    expect(handlers.size).toBe(0);
    await expect(loadNaverMaps()).resolves.toBe(sdk);
  });
});
