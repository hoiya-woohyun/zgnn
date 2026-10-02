/**
 * 하이드레이션이 **끝났다는 신호**가 성공·실패 양쪽에서 올라오는지.
 *
 * 여기서 지키려는 것은 BUG-002 이다 — localStorage 값이 깨져 있으면 zustand 의
 * `persist.hasHydrated()` 가 영원히 false 로 남고, 그것을 "아직 읽는 중" 으로 읽은 화면이
 * 로딩 문구에 갇혔다. 그래서 이 파일은 `hasHydrated()` 를 검사하지 않는다. 그 값은 지금도
 * false 다(고친 것은 화면이 보는 신호를 바꾼 쪽이다).
 *
 * 스토어 모듈은 한 번 import 되면 `hydrationSettled` 를 모듈 수준에 들고 있어 되돌릴 수
 * 없다. 그래서 테스트마다 `vi.resetModules()` 로 새로 불러온다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_NAME = 'zgnn-jeju';

/**
 * 이 테스트 파일은 jsdom 없이 돈다(vitest.config.mts). localStorage 를 직접 세운다.
 *
 * `window.localStorage` 까지 세우는 이유: zustand 의 기본 저장소가 바로 그 경로를 읽는다
 * (`createJSONStorage(() => window.localStorage)`). `window` 가 없으면 zustand 가 저장소를
 * 통째로 포기하고 `persist` 를 아예 붙이지 않아, 테스트가 엉뚱한 곳에서 터진다.
 */
const installLocalStorage = () => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  return map;
};

/** 새로 import 한 스토어로 한 번 하이드레이션을 돌린다 — 화면에서 StoreHydration 이 하는 일. */
const rehydrateFresh = async () => {
  vi.resetModules();
  const store = await import('./useAppStore');
  await Promise.resolve(store.useAppStore.persist.rehydrate()).catch(() => undefined);
  return store;
};

describe('저장된 값 읽기가 끝났다는 신호', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('정상 값이면 신호가 오고 프로필도 들어온다', async () => {
    const map = installLocalStorage();
    map.set(
      STORAGE_NAME,
      JSON.stringify({
        state: { savedIds: [], checkedItemIds: [], season: null, dog: { dogs: [{ name: '두부', weightKg: 5 }], carrier: 'none' }, needsIndoor: false, town: null },
        version: 0,
      }),
    );

    const { isHydrationSettled, useAppStore } = await rehydrateFresh();

    expect(isHydrationSettled()).toBe(true);
    expect(useAppStore.getState().dog?.dogs[0]?.name).toBe('두부');
  });

  it('저장된 값이 없어도 신호는 온다', async () => {
    installLocalStorage();

    const { isHydrationSettled, useAppStore } = await rehydrateFresh();

    expect(isHydrationSettled()).toBe(true);
    expect(useAppStore.getState().dog).toBeNull();
  });

  /** BUG-002 의 재현 조건. 이 테스트가 깨지면 등록 화면이 다시 "불러오는 중" 에 갇힌다. */
  it('값이 깨져 있어도 신호가 오고, 깨진 값은 지워진다', async () => {
    const map = installLocalStorage();
    map.set(STORAGE_NAME, '{broken json');

    const { isHydrationSettled, useAppStore } = await rehydrateFresh();

    expect(isHydrationSettled()).toBe(true);
    // 기본값으로 그린다 — 읽을 수 없었으므로 "저장된 것이 없다" 와 같은 상태다.
    expect(useAppStore.getState().dog).toBeNull();
    // 남겨 두면 다음 로드에서도 같은 자리에서 또 실패한다(영구 고장).
    expect(map.has(STORAGE_NAME)).toBe(false);
  });

  /**
   * **신호가 오는 시점에는 읽어온 값이 이미 스토어에 들어와 있어야 한다.**
   *
   * 등록 화면은 "하이드레이션이 끝났다" 를 보고 **그 순간의 `dog` 로 폼 초기값을 한 번만**
   * 채우고 다시는 채우지 않는다(dogProfilePage 의 `seededFor`). 신호가 `set()` 보다 먼저
   * 오면 그때 `dog` 가 아직 null 이라, 프로필이 있는 사용자에게 빈 폼이 뜨고 저장을 누르면
   * 기존 프로필을 빈 값으로 덮어쓴다.
   *
   * 지금은 zustand 가 `set(merge(...))` 을 먼저 하고 그다음 `onRehydrateStorage` 의 콜백을
   * 부르기 때문에 성립한다. 우리가 정한 순서가 아니라 **라이브러리 내부 순서에 기대는 것**이라
   * 여기 못 박아 둔다 — zustand 를 올릴 때 이 테스트가 먼저 깨져야 한다.
   */
  it('신호가 올 때 읽어온 값이 이미 들어와 있다', async () => {
    const map = installLocalStorage();
    map.set(
      STORAGE_NAME,
      JSON.stringify({
        state: { savedIds: [], checkedItemIds: [], season: null, dog: { dogs: [{ name: '두부', weightKg: 5 }], carrier: 'none' }, needsIndoor: false, town: null },
        version: 0,
      }),
    );

    vi.resetModules();
    const { subscribeHydrationSettled, useAppStore } = await import('./useAppStore');

    let dogAtSignal: unknown = 'NOT_CALLED';
    subscribeHydrationSettled(() => {
      dogAtSignal = useAppStore.getState().dog;
    });

    await Promise.resolve(useAppStore.persist.rehydrate()).catch(() => undefined);

    expect(dogAtSignal).toMatchObject({ dogs: [{ name: '두부', weightKg: 5 }] });
  });

  it('구독자는 신호가 올 때 깨어난다', async () => {
    const map = installLocalStorage();
    map.set(STORAGE_NAME, '{broken json');

    vi.resetModules();
    const { subscribeHydrationSettled, useAppStore } = await import('./useAppStore');

    const listener = vi.fn();
    const unsubscribe = subscribeHydrationSettled(listener);
    expect(listener).not.toHaveBeenCalled();

    await Promise.resolve(useAppStore.persist.rehydrate()).catch(() => undefined);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('저장 메모(savedNotes)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('저장 목록에 없는 id 의 메모는 읽을 때 버린다 · 하트를 지우면 메모도 지운다', async () => {
    const { PLACES } = await import('../lib/places');
    const [a, b] = PLACES;
    const map = installLocalStorage();
    map.set(
      STORAGE_NAME,
      JSON.stringify({
        state: { savedIds: [a.id, 'gone'], savedNotes: { [a.id]: '전화함', [b.id]: '저장 안 한 곳', gone: '없는 곳' } },
        version: 0,
      }),
    );
    const { useAppStore } = await rehydrateFresh();
    expect(useAppStore.getState().savedNotes).toEqual({ [a.id]: '전화함' });

    useAppStore.getState().setSavedNote(b.id, '저장 안 했으면 안 붙는다');
    expect(useAppStore.getState().savedNotes[b.id]).toBeUndefined();

    useAppStore.getState().toggleSaved(a.id);
    expect(useAppStore.getState().savedNotes).toEqual({});
  });
});
