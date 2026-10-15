import { beforeEach, describe, expect, it } from 'vitest';
import { usePlacesPageFilterStore } from './usePlacesPageFilterStore';

const INITIAL = usePlacesPageFilterStore.getState();

describe('usePlacesPageFilterStore', () => {
  beforeEach(() => usePlacesPageFilterStore.setState(INITIAL, true));

  // 시트 버튼 숫자(`activeFilterCount`)가 세는 것은 시트의 '모두 지우기'(`resetConditions`)가 전부 푼다 —
  // '갈 수 있는 곳만' 은 시트에 칩이 생겨(14 W261013.14d) 센다. 세기만 하고 안 풀면 "필터 1" 인데 눌러도 그대로다.
  it("'모두 지우기' 는 '갈 수 있는 곳만' 도 풀고 권역·검색어는 둔다", () => {
    const store = usePlacesPageFilterStore.getState();
    store.enterArea('west');
    store.setQuery('카레');
    store.setHideHard(true);
    expect(usePlacesPageFilterStore.getState().onlyReachable).toBe(true);

    usePlacesPageFilterStore.getState().resetConditions();
    expect(usePlacesPageFilterStore.getState()).toMatchObject({ onlyReachable: false, hideHard: false, area: 'west', query: '카레' });
  });

  it("시트 칩은 동네 카드가 건 값과 같은 값을 켜고 끈다", () => {
    usePlacesPageFilterStore.getState().enterArea('west');
    usePlacesPageFilterStore.getState().toggleOnlyReachable();
    expect(usePlacesPageFilterStore.getState().onlyReachable).toBe(false);
    usePlacesPageFilterStore.getState().toggleOnlyReachable();
    expect(usePlacesPageFilterStore.getState().onlyReachable).toBe(true);
  });
});
