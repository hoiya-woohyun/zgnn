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
  it('값이 깨져 있어도 신호가 오고, 깨진 값은 멀쩡한 기본값으로 바뀐다', async () => {
    const map = installLocalStorage();
    map.set(STORAGE_NAME, '{broken json');

    const { isHydrationSettled, useAppStore } = await rehydrateFresh();

    expect(isHydrationSettled()).toBe(true);
    // 기본값으로 그린다 — 읽을 수 없었으므로 "저장된 것이 없다" 와 같은 상태다.
    expect(useAppStore.getState().dog).toBeNull();
    // 남겨 두면 다음 로드에서도 같은 자리에서 또 실패한다(영구 고장). 지운 직후 방문 수(1)를 쓰므로 키는 다시 생기되 읽히는 값이다.
    const stored = JSON.parse(map.get(STORAGE_NAME) ?? 'null');
    expect(stored.state.dog).toBeNull();
    expect(stored.state.visitCount).toBe(1);
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
    expect(useAppStore.getState().savedNotes).toEqual({ [a.id]: '전화함', gone: '없는 곳' });

    useAppStore.getState().setSavedNote(b.id, '저장 안 했으면 안 붙는다');
    expect(useAppStore.getState().savedNotes[b.id]).toBeUndefined();

    useAppStore.getState().toggleSaved(a.id);
    expect(useAppStore.getState().savedNotes).toEqual({ gone: '없는 곳' });
  });
});

describe('날짜 라벨·하루 순서(tripDays·tripOrder, 16 T1.1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('칸이 없던 옛 저장값은 전부 미정으로 읽는다', async () => {
    const map = installLocalStorage();
    map.set(STORAGE_NAME, JSON.stringify({ state: { savedIds: ['a'] }, version: 0 }));
    const { useAppStore } = await rehydrateFresh();
    expect(useAppStore.getState().tripDays).toEqual({});
    expect(useAppStore.getState().tripOrder).toEqual({});
  });

  it('저장 안 한 곳·범위 밖 날은 읽을 때 버리고, 순서는 라벨을 따른다 · 하트를 지우면 라벨·순서에서도 빠진다', async () => {
    const map = installLocalStorage();
    map.set(
      STORAGE_NAME,
      JSON.stringify({
        state: { savedIds: ['a', 'b', 'gone'], tripDays: { a: 1, b: 1, c: 2, gone: 9 }, tripOrder: { 1: ['b', 'a', 'c'], 2: ['c'] } },
        version: 0,
      }),
    );
    const { useAppStore } = await rehydrateFresh();
    expect(useAppStore.getState().tripDays).toEqual({ a: 1, b: 1 });
    expect(useAppStore.getState().tripOrder).toEqual({ 1: ['b', 'a'] });

    useAppStore.getState().setTripDay('c', 2);
    expect(useAppStore.getState().tripDays.c).toBeUndefined();

    useAppStore.getState().toggleSaved('b');
    expect(useAppStore.getState().tripDays).toEqual({ a: 1 });
    expect(useAppStore.getState().tripOrder).toEqual({ 1: ['a'] });

    useAppStore.getState().clearSaved();
    expect(useAppStore.getState().tripDays).toEqual({});
    expect(useAppStore.getState().tripOrder).toEqual({});
  });
});

describe('공유받은 목록 담기(addSaved, 07 P1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('이미 저장한 곳은 자리·메모 그대로, 새 곳만 순서대로 뒤에 붙인다', async () => {
    const { PLACES } = await import('../lib/places');
    const [a, b, c] = PLACES;
    const map = installLocalStorage();
    map.set(STORAGE_NAME, JSON.stringify({ state: { savedIds: [b.id, a.id], savedNotes: { a: 'x', [a.id]: '전화함' } }, version: 0 }));
    const { useAppStore } = await rehydrateFresh();

    useAppStore.getState().addSaved([c.id, a.id, c.id]);
    expect(useAppStore.getState().savedIds).toEqual([b.id, a.id, c.id]);
    expect(useAppStore.getState().savedNotes[a.id]).toBe('전화함');

    // 전부 이미 있으면 목록을 새로 만들지 않는다 — 구독자가 다시 그리지 않게.
    const before = useAppStore.getState().savedIds;
    useAppStore.getState().addSaved([a.id, b.id]);
    expect(useAppStore.getState().savedIds).toBe(before);
  });
});

describe('내린 장소의 저장(12 U2.3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('데이터에 없는 id 는 읽기·쓰기 뒤에도 저장소에 남고 개수에는 안 센다', async () => {
    const { PLACES } = await import('../lib/places');
    const [a, b] = PLACES;
    const map = installLocalStorage();
    map.set(
      STORAGE_NAME,
      JSON.stringify({ state: { savedIds: [a.id, 'archived-1'], savedNotes: { 'archived-1': '되살면 다시' } }, version: 0 }),
    );
    const { useAppStore } = await rehydrateFresh();

    useAppStore.getState().toggleSaved(b.id);
    const written = JSON.parse(map.get(STORAGE_NAME) ?? '{}').state;
    expect(written.savedIds).toEqual([a.id, 'archived-1', b.id]);
    expect(written.savedNotes).toEqual({ 'archived-1': '되살면 다시' });

    const { countUnlistedSaved, selectSavedPlaces } = await import('../lib/places');
    expect(countUnlistedSaved(useAppStore.getState().savedIds)).toBe(1);
    expect(selectSavedPlaces(useAppStore.getState().savedIds).map((place) => place.id)).toEqual(
      PLACES.filter((place) => place.id === a.id || place.id === b.id).map((place) => place.id),
    );
  });
});

describe('저장된 값의 모양이 깨졌을 때(12 U0.1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('깨진 칸은 기본값으로, 멀쩡한 칸은 그대로 읽는다', async () => {
    const { PLACES } = await import('../lib/places');
    const map = installLocalStorage();
    map.set(
      STORAGE_NAME,
      JSON.stringify({
        state: { savedIds: [PLACES[0].id, 7], checkedItemIds: 'x', season: '봄', needsIndoor: true },
        version: 0,
      }),
    );
    const { useAppStore } = await rehydrateFresh();
    const state = useAppStore.getState();
    expect(state.checkedItemIds).toEqual([]);
    expect(state.season).toBeNull();
    expect(state.savedIds).toEqual([PLACES[0].id]);
    expect(state.needsIndoor).toBe(true);
    // 깨진 칸이 동작까지 막지 않는다 — 예전에는 `"x".includes` 가 아니라 배열 메서드에서 터졌다.
    state.toggleChecked('water-bowl');
    expect(useAppStore.getState().checkedItemIds).toEqual(['water-bowl']);
  });

  it('저장소를 열 수 없으면 zustand 는 persist API 를 붙이지 않는다 — StoreHydration 이 이것을 가드한다', async () => {
    // 쿠키·사이트 데이터 차단 브라우저: localStorage 에 닿는 순간 SecurityError.
    vi.stubGlobal('window', {
      get localStorage() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    vi.resetModules();
    const { useAppStore, isHydrationSettled } = await import('./useAppStore');
    expect(useAppStore.persist as unknown).toBeUndefined();
    // 스토어 자체는 저장 없이 돈다 — 화면은 기본값으로 그린다.
    useAppStore.getState().toggleSaved('a');
    expect(useAppStore.getState().savedIds).toEqual(['a']);
    expect(isHydrationSettled()).toBe(false); // 신호는 StoreHydration 이 올린다
  });
});

describe('저장 해제 되돌리기(12 U2.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('원래 자리와 메모까지 돌아온다 · 이미 저장돼 있으면 그대로', async () => {
    const { PLACES } = await import('../lib/places');
    const [a, b, c] = PLACES;
    const map = installLocalStorage();
    map.set(STORAGE_NAME, JSON.stringify({ state: { savedIds: [a.id, b.id, c.id], savedNotes: { [b.id]: '전화함' } }, version: 0 }));
    const { useAppStore } = await rehydrateFresh();
    useAppStore.getState().toggleSaved(b.id);
    expect(useAppStore.getState().savedNotes).toEqual({});
    useAppStore.getState().restoreSaved(b.id, 1, '전화함');
    expect(useAppStore.getState().savedIds).toEqual([a.id, b.id, c.id]);
    expect(useAppStore.getState().savedNotes).toEqual({ [b.id]: '전화함' });
    useAppStore.getState().restoreSaved(b.id, 0);
    expect(useAppStore.getState().savedIds).toEqual([a.id, b.id, c.id]);
  });

  it('날짜 라벨도 돌아온다(16 T1.4)', async () => {
    const { PLACES } = await import('../lib/places');
    const [a, b] = PLACES;
    const map = installLocalStorage();
    map.set(STORAGE_NAME, JSON.stringify({ state: { savedIds: [a.id, b.id], tripDays: { [b.id]: 2 } }, version: 0 }));
    const { useAppStore } = await rehydrateFresh();
    useAppStore.getState().toggleSaved(b.id);
    expect(useAppStore.getState().tripDays).toEqual({});
    useAppStore.getState().restoreSaved(b.id, 1, undefined, 2);
    expect(useAppStore.getState().tripDays).toEqual({ [b.id]: 2 });
  });
});

describe('설정의 비우기 두 줄(12 U2.6)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('준비물 체크만 · 저장과 메모만 비운다', async () => {
    const { PLACES } = await import('../lib/places');
    const map = installLocalStorage();
    map.set(STORAGE_NAME, JSON.stringify({ state: { savedIds: [PLACES[0].id], savedNotes: { [PLACES[0].id]: '메모' }, checkedItemIds: ['a', 'b'] }, version: 0 }));
    const { useAppStore } = await rehydrateFresh();
    useAppStore.getState().clearChecked();
    expect(useAppStore.getState().checkedItemIds).toEqual([]);
    expect(useAppStore.getState().savedIds).toEqual([PLACES[0].id]);
    useAppStore.getState().clearSaved();
    expect(useAppStore.getState().savedIds).toEqual([]);
    expect(useAppStore.getState().savedNotes).toEqual({});
  });
});

describe('방문 수(visitCount, 07 U2·U9)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('저장된 수 위에 하나 더한다 · 기록이 없으면 1 이 첫 방문이다', async () => {
    const map = installLocalStorage();
    const first = await rehydrateFresh();
    expect(first.useAppStore.getState().visitCount).toBe(1);
    expect(JSON.parse(map.get(STORAGE_NAME) ?? '{}').state.visitCount).toBe(1);

    const second = await rehydrateFresh();
    expect(second.useAppStore.getState().visitCount).toBe(2);
  });

  it('읽기가 끝나면 스스로 한 번 센다 — StrictMode 가 두 번 읽어도 1, 신호보다 먼저', async () => {
    const map = installLocalStorage();
    map.set(STORAGE_NAME, JSON.stringify({ state: { visitCount: 4 }, version: 0 }));
    vi.resetModules();
    const store = await import('./useAppStore');
    let seenAtSignal = -1;
    store.subscribeHydrationSettled(() => {
      seenAtSignal = store.useAppStore.getState().visitCount;
    });
    await store.useAppStore.persist.rehydrate();
    await store.useAppStore.persist.rehydrate();
    expect(store.useAppStore.getState().visitCount).toBe(5);
    expect(seenAtSignal).toBe(5);
  });

  it('저장된 값이 깨져 있으면 지우고 1 부터 센다', async () => {
    const map = installLocalStorage();
    map.set(STORAGE_NAME, '{not json');
    const { useAppStore } = await rehydrateFresh();
    expect(useAppStore.getState().visitCount).toBe(1);
  });

  it('깨진 값(음수·소수·문자열)은 0 으로 읽고, 그 위에 이 로드의 1 이 더해진다', async () => {
    for (const broken of [-3, 1.5, '4', null]) {
      const map = installLocalStorage();
      map.set(STORAGE_NAME, JSON.stringify({ state: { visitCount: broken }, version: 0 }));
      const { useAppStore } = await rehydrateFresh();
      expect(useAppStore.getState().visitCount).toBe(1);
    }
  });
});
