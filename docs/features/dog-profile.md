# 내 강아지 프로필과 장소별 판정

> 상태: 구현됨 — 프로필 등록·판정 로직(A2·B1), 상세 화면 반영(B2), 목록·지도·홈 반영(B3) 모두 완료.
> 최종 수정: 2026-09-16 (B3: 둘러보기·홈·지도·근처 장소에 판정 반영)
> 결정 근거: [ADR-005](../decisions/ADR-005-dog-profile-eligibility.md) · 판정 규칙: [architecture/pet-policy-and-eligibility.md](../architecture/pet-policy-and-eligibility.md)

## 목표

강아지를 한 번 등록하면 목록·지도·상세가 "우리 강아지 기준" 으로 보인다. 등록하지 않으면 지금 화면 그대로다.

## 사용자 흐름

```mermaid
flowchart TD
  H[홈] -->|"우리 강아지 등록하기"| F["프로필 폼(/dog)<br/>이름 · 마리별 몸무게 · 이동 수단"]
  F -->|저장| H2[홈: "짱구가 갈 수 있는 곳 N곳"]
  H2 --> L[둘러보기: 판정 배지 + 정렬]
  H2 --> M[지도: 마커에 판정 표시]
  L --> D[상세: 판정 + 근거 → 원문 카드]
  H2 -->|프로필 수정| F
```

## 화면

| 화면 | 프로필 없음 | 프로필 있음 | 상태 |
|---|---|---|---|
| 프로필 폼 | `/dog` (정적 라우트) | 같은 화면에서 수정·삭제 | **구현됨** |
| 홈 | 현재와 같음 + "우리 강아지 등록하기" 카드(인사말 카드 아래) | 인사말에 이름("{이름}랑 제주 어디 갈까요?"). 종류 카드의 숫자가 "갈 수 있는 곳 N / 전체 M"(N = ok+cond) | **구현됨** |
| 둘러보기 | 현재와 같음 | 카드에 판정 배지 1개 + "{이름} · {요금}" 한 줄. 기본 정렬 가능 → 조건부 → 정보 없음 → 어려움(가격 정렬 선택 시 가격 우선). "어려움 숨기기"·(식당·카페만) "실내 자리 필요" 토글. 조건 겹쳐 0~1곳이면 안내 문구 | **구현됨** |
| 지도 | 현재와 같음 | 마커 테두리로 판정 구분(가능 실선 / 조건부 점선 / 정보 없음 회색 테두리 / 어려움 반투명 opacity .45), 아이콘 캐시 키에 레벨 포함. 시트에 배지 + 첫 근거 한 줄. 상단에 "어려움 숨기기" 토글 | **구현됨** |
| 근처 장소 | 카드에 `PetBadges limit={1}`(리뷰 ③ 요청 — 프로필과 무관) | 같은 카드에 판정 배지 추가 | **구현됨** |
| 상세 | 원문 카드 위에 조용한 배너 한 줄("우리 강아지를 등록하면 여기서 바로 판정을 볼 수 있어요" → `/dog`) | 원문 카드 위에 판정 카드(배지 + 머리글 + 근거 문구, 심각도순). 요금(`info`)은 아래에 작게 별도 줄. 근거의 `quote` 는 원문 카드에서 `<mark>` 로 강조. 네이버 버튼은 판정과 무관하게 '반려동물 이용' 카드 바로 아래 유지 | **구현됨** |

## 데이터 — 구현됨

```ts
// src/types.ts
export type TDogSize = 'small' | 'medium' | 'large';
export type TCarrier = 'none' | 'bag' | 'cage' | 'stroller';
export type TDogProfile = {
  name: string;
  weightsKg: number[];   // 1~3마리. 무게 상한 비교는 최댓값, 마릿수는 length
  carrier: TCarrier;     // 케이지 필수인 곳에서 이동 수단을 정확히 구분해야 판정이 안전하다
  sizeOverride?: TDogSize; // 자동 계산(dogSize())을 사용자가 고친 값
};
```

`needsIndoor` 는 `TDogProfile` 에 없다 — 여행 정보라 `useAppStore.needsIndoor` 로 따로 둔다.

- 스토어 `useAppStore` 에 `dog: TDogProfile | null`, `needsIndoor: boolean`, `setDog`, `clearDog`, `setNeedsIndoor`. persist 대상. `merge` 에서 `weightsKg` 가 1~3개의 양수 배열이 아니거나 `carrier` 가 enum 밖이거나 `name` 이 문자열이 아니면 `dog: null` 로 되돌린다(`sanitizeDog`).
- 훅은 `src/store/useAppStore.ts` 의 `useDog()` 과 `src/store/useDogEligibility.ts` 의 `useEligibility(place)` · `useEligibilityMap()`(dog·needsIndoor 가 바뀔 때만 재계산).
- 크기 기본값(`dogSize()`, `src/lib/eligibility.ts`): `< 10kg → small`, `10~25 → medium`, `> 25 → large`. 원문의 "대형견" 과 정확히 일치한다는 보장이 없어 프로필 폼의 "크기 수정" 접힘에서 `sizeOverride` 로 고칠 수 있다.

## 프로필 폼 — 구현됨 (`src/screens/dogProfilePage.tsx`)

- 이름(필수, 12자 이내) · 마리별 몸무게 행(`DogProfileWeightRows`, 최대 3행, "한 마리 더"/행 삭제) · 이동 수단 4택(`DogProfileCarrierPicker`, 각 한 줄 설명) · "크기 수정" 접힘(`DogProfileSizeOverride`, 자동 계산값 표시 + 셀렉트로 override) · 저장(홈으로 이동) · 등록돼 있으면 삭제(확인 없이 즉시 + 화면 안 배너로 안내, `window.confirm` 미사용).
- `useAppStore` 가 `skipHydration: true` 라 첫 렌더는 항상 `dog: null` 이다. 폼은 하이드레이션이 끝날 때까지 그리지 않고("불러오는 중"), 끝난 시점의 `dog` 로 한 번만 초기값을 채운다(렌더 중 상태 조정 패턴 — 이펙트로 하면 빈 폼이 한 프레임 보였다가 채워진다).

## 판정 — 구현됨

`src/lib/eligibility.ts`

```ts
export type TEligibilityLevel = 'ok' | 'cond' | 'unknown' | 'hard';
export type TReason = { level: TEligibilityLevel | 'info'; text: string; quote?: string };
export type TEligibility = { level: TEligibilityLevel; reasons: TReason[]; fee?: string };

export const dogSize: (dog: TDogProfile) => TDogSize;
export const judgeEligibility: (dog: TDogProfile, policy: TPetPolicy, opts?: { needsIndoor?: boolean }) => TEligibility;
export const feeForDog: (policy: TPetPolicy, dog: TDogProfile) => string | undefined;
export const compareEligibility: (a: TEligibilityLevel, b: TEligibilityLevel) => number; // ok < cond < unknown < hard
```

규칙표는 [architecture/pet-policy-and-eligibility.md §3](../architecture/pet-policy-and-eligibility.md#3-판정--구현됨) 에 있다. 첫 매치가 아니라 **전부 평가해 가장 센 레벨**을 채택하고, `reasons` 는 심각도순으로 정렬된다.

테스트(`eligibility.test.ts`)는 프로필 3종(두부 4kg·이동가방 / 보리+콩 28kg+17kg·이동 수단 없음 / 콩 17kg·케이지)에 대해 실제 장소(웨스티하우스·모닥식탁·무거버거·맘앤도그·솔숲펜션)의 기대 판정을 적고, 보리+콩 프로필로 86곳 전체를 집계해 디자인 리뷰의 사람 판단(가능 9·조건부 30·어려움 42·정보 없음 5) ±5 안에 들어오는지 확인한다(구현 결과: 7·32·42·5 — 전부 ±5 안).

## 범위 밖

- 마리별(개별) 프로필(이름·이동 수단을 마리마다 따로), 견종·성향, 서버 동기화, 공유 링크에 프로필 싣기.

## 남은 작업

1. ~~파서 결과 86건 점검~~ — A1 에서 완료.
2. ~~타입·스토어·`eligibility.ts` + 테스트~~ — A2·B1 에서 완료.
3. ~~프로필 폼 화면(`/dog`)~~ — B1 에서 완료.
4. ~~상세 화면 판정 표시~~ — B2 에서 완료(`src/screens/placeDetailEligibilityCard.tsx`).
5. ~~둘러보기·지도·홈·근처 장소 판정 표시~~ — B3 에서 완료.

남은 작업 없음. 판정 관련 토글("어려움 숨기기"·"실내 자리 필요")은 프로필이 있을 때만 보인다 — 프로필이 없으면 모든 화면이 이전과 같아야 한다는 제약 때문이다.
