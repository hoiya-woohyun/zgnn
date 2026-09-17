# BUG-002 — 저장된 값이 한 번 깨지면 앱이 영구히 저장 기능을 잃는다

> 최종 수정: 2026-09-17 (v1: 신설)

## 증상

"우리 강아지 등록" 화면이 **"불러오는 중이에요…" 에서 영영 멈춘다.** 새로고침해도, 앱을
껐다 켜도 같다.

같은 원인에서 나오지만 **눈에는 안 띄는 증상**이 함께 있다. 저장한 곳이 0곳으로 보이고,
등록해 둔 강아지 프로필이 사라지고, 목록·지도·상세의 판정("갈 수 있어요")이 통째로 사라진다.
등록 화면만 티가 나는 것은 **거기만 하이드레이션을 렌더 조건으로 걸어서**다 — 다른 화면은
"저장된 것이 없는 사람" 과 구별할 수 없는 모습으로 조용히 틀린다.

## 재현 조건

`localStorage` 의 `zgnn-jeju` 값이 JSON 으로 파싱되지 않으면 된다.

```js
localStorage.setItem('zgnn-jeju', '{broken json');
location.reload();   // → /dog 가 "불러오는 중이에요…" 에서 멈춘다
```

실제로 이런 값이 생기는 경로는 저장 중 탭 종료·용량 초과로 잘린 쓰기·수동 편집 등이다.
**한 번 그렇게 되면 스스로는 절대 회복하지 못한다**(아래 "원인" 의 둘째 문단).

## 원인

두 가지가 겹쳤다.

### 1. `hasHydrated()` 는 "끝났나" 가 아니라 "성공했나" 다

zustand persist 를 실제로 재 본 결과(`src/store/useAppStore.test.ts`):

| | `rehydrate()` | `hasHydrated()` | `onRehydrateStorage(state, error)` |
|---|---|---|---|
| 정상 | resolve | `true` | `(state, undefined)` |
| 깨진 JSON | **resolve** | **`false` (영구)** | `(undefined, error)` |

`rehydrate()` 가 reject 하지도 않고 `hasHydrated()` 가 올라가지도 않는다. 화면 쪽은
`hasHydrated()` 를 "아직 읽는 중" 으로 읽고 있었으므로, 영원히 기다리는 상태가 된다.

등록 화면은 그때 **공용 훅을 쓰지 않고 같은 판단을 하는 자기 훅을 따로** 갖고 있었다.
훅이 둘이라 고칠 곳도 둘이었고, 둘 다 같은 함수에 기대고 있어 어느 쪽을 고쳐도 반쪽이었다.

### 2. 실패한 값을 아무도 치우지 않는다

zustand 는 읽다 실패한 값을 그대로 둔다. 다음 로드에서 같은 값을 다시 읽고 다시 실패한다 —
**고장이 영구화된다.** 사용자가 할 수 있는 일은 브라우저 저장소를 직접 지우는 것뿐인데,
홈 화면에 추가한 PWA 에는 그 화면으로 가는 길도 없다.

## 수정

### 화면이 보는 신호를 바꾼다

"성공했나" 대신 **"읽기가 끝났나"** 를 묻는 신호(`hydrationSettled`)를 스토어에 두고,
`useStoreHydrated()` 가 그것을 본다. 실패를 성공으로 치자는 게 아니라 **실패도 결말**이라
그 뒤로는 기다릴 이유가 없다는 뜻이다. 실패했으면 "저장된 것이 없는 사람" 과 같은 상태로
그리면 되고, 그것이 사실이기도 하다.

신호는 두 곳에서 올린다. 평소에는 `onRehydrateStorage`(성공·실패 모두 불린다)가, 저장소
자체를 열 수 없어 zustand 가 그 콜백까지 건너뛰는 경우에는 `StoreHydration` 의
`rehydrate().then(…)` 이 올린다. 먼저 온 쪽이 이긴다.

### 깨진 값은 지운다

`onRehydrateStorage` 의 에러 갈래에서 `localStorage.removeItem('zgnn-jeju')`. 깨진 JSON 은
통째로 못 읽는 값이라 일부만 건져낼 것이 없고, 지우면 **다음 로드부터 정상으로 돌아온다.**

### 중복 훅을 없앤다

등록 화면의 지역 `useStoreHydrated` 를 지우고 `providers/storeHydration.tsx` 의 공용 훅을
쓴다. 같은 판단을 하는 곳이 둘이면 다음 사람도 한쪽만 고친다.

## 회귀 방지

`src/store/useAppStore.test.ts` — 깨진 값으로 하이드레이션했을 때 **신호가 오는지**와
**깨진 값이 지워지는지**를 함께 본다. `hasHydrated()` 는 검사하지 않는다. 그 값은 고친
뒤에도 여전히 `false` 이고(고친 것은 화면이 보는 신호 쪽이다), 그걸 검사하면 다음 사람이
엉뚱한 곳을 고치게 된다.

## 관련

- `src/store/useAppStore.ts` · `src/providers/storeHydration.tsx` · `src/screens/dogProfilePage.tsx`
- [라우팅 · 화면 셸 · 클라이언트 상태](../architecture/app-shell-and-state.md)
- [우리 강아지 프로필](../features/dog-profile.md)
