# 내 강아지 프로필과 장소별 판정

> 상태: 구현됨 — 프로필 등록·판정 로직(A2·B1), 상세 화면 반영(B2), 목록·지도·홈 반영(B3) 모두 완료.
> 최종 수정: 2026-10-06 (v10: 홈 등록 카드 부제가 예시 두 몸무게의 숙소 수 — 등록 전 미리보기(14 C2610.2))
> 이전 2026-10-02 (v9: 프로필 삭제에 **되돌리기** — 화면 안 배너 대신 셸 토스트(todo/12 U2.1))
> 이전 2026-09-30 (v8: 정보 없음 머리글에서 강아지 이름을 뺐다 — "보리는 확인된 정보가 없어요" → "이곳은 반려견 동반 조건이 공개돼 있지 않아요". 판정한 게 없는데 판정한 것처럼 읽혔다)
> 이전 (v7: 화면 문구에서 내부어를 걷었다 — 상세 배너 "…바로 판정을 볼 수 있어요" → "…갈 수 있는지 바로 알려 드려요", 크기 접힘 "크기 수정 — 자동 계산: 소형견" → "크기: 소형견(몸무게로 정했어요) · 바꾸기"(직접 고르면 "(직접 골랐어요)"))
> 이전 (v6: 저장하면 **보던 화면으로 돌아간다** — 무조건 홈으로 보냈더니 상세의 "등록하면…" 으로 온 사람이 보던 장소를 잃고, 뒤로가기가 폼으로 갔다(D3). 도착 화면에 "보리 기준으로 바꿨어요")
> 이전 (v5: 상세 cond 머리글을 목록 배지와 같은 "확인이 필요해요" 로 — 규칙은 pet-policy-and-eligibility.md)
> 이전 (v4: 이동 수단은 기본값 없이 묻는다 — 기본값 '없어요' 가 식당 판정을 조용히 뒤집었다)
> 이전 (v3: 폼이 기다리는 기준을 "읽기가 끝났나" 로 — 저장된 값이 깨지면 로딩에 갇히던 문제 → BUG-002)
> 이전 (v2: 마리별 이름 — `TDogProfile.dogs[]`, 옛 `{name, weightsKg}` 는 읽을 때 올려 변환. 요금 문구가 마릿수 합산(`formatDogFee`)·애칭 조사(`korean.ts`)를 갖고, 판정 레벨 문구를 문장형으로("갈 수 있어요 / 확인이 필요해요 / 정보가 없어요 / 이용하기 어려워요"). 프로필 진입이 설정 탭으로)
> 이전 (v1 · B3: 둘러보기·홈·지도·근처 장소에 판정 반영)
> 결정 근거: [ADR-005](../decisions/ADR-005-dog-profile-eligibility.md) · 판정 규칙: [architecture/pet-policy-and-eligibility.md](../architecture/pet-policy-and-eligibility.md)

## 목표

강아지를 한 번 등록하면 목록·지도·상세가 "우리 강아지 기준" 으로 보인다. 등록하지 않으면 지금 화면 그대로다.

## 사용자 흐름

```mermaid
flowchart TD
  H[홈] -->|"우리 강아지 등록하기"| F["프로필 폼(/dog)<br/>마리별 이름·몸무게 · 이동 수단"]
  S[설정 탭: "우리 강아지" 카드] -->|수정| F
  D0[상세: "등록하면…"] --> F
  F -->|"저장 → 온 곳으로(되감기)"| D0
  F -->|"저장(딥링크로 폼에 들어옴) → 설정"| S
  F -->|"저장 → 홈에서 왔으면 홈"| H2[홈: "짱구랑 제주 어디 갈까요?"]
  H2 --> L[둘러보기: 판정 배지 + 정렬]
  H2 --> M[지도: 마커에 판정 표시]
  L --> D[상세: 판정 + 근거 → 원문 카드]
  H2 -->|프로필 수정| F
```

## 화면

| 화면 | 프로필 없음 | 프로필 있음 | 상태 |
|---|---|---|---|
| 프로필 폼 | `/dog` (정적 라우트, 부모는 `/settings`) | 같은 화면에서 수정·삭제 | **구현됨** |
| 설정 탭 | "우리 강아지 등록하기" 카드 → `/dog` | 카드에 애칭("악동이와 두부") + "N마리 · 최대 Xkg · {이동 수단}" 과 "수정" → `/dog` | **구현됨** |
| 홈 | 현재와 같음 + "우리 강아지 등록하기" 카드(인사말 카드 아래). 부제는 **등록 전 미리보기** "숙소 26곳 중 7kg 아이는 18곳, 25kg 아이는 6곳 갈 수 있어요 — 우리 아이는요?"(`homePageRegisterPreview`, 14 C2610.2) — 숙소로만 센다: 숙소는 몸무게로 갈리고 이동 수단이 거의 안 끼어 예시가 가방 유무를 지어내지 않는다. 두 수가 같으면 옛 문구 | 인사말에 애칭 + 이랑/랑("우현이랑 제주 어디 갈까요?" · "악동이와 두부랑 …"). 종류 카드의 숫자가 "갈 수 있는 곳 N / 전체 M"(N = ok+cond) | **구현됨** |
| 둘러보기 | 현재와 같음 | 카드에 판정 배지 1개(라벨 **갈 수 있어요** / 확인이 필요해요 / 정보가 없어요 / 이용하기 어려워요 — 축약 명사형 "조건부"·"정보 없음" 은 처음 보는 사람이 되묻는다) + 요금 한 줄("악동이는 3만원", "악동이와 두부는 2.5만원 (1~5kg 1만원 · 6~10kg 1.5만원)" — 규칙은 [pet-policy-and-eligibility.md §요금](../architecture/pet-policy-and-eligibility.md)). 기본 정렬 ok → cond → unknown → hard(가격 정렬 선택 시 가격 우선). "어려운 곳 숨기기"·(식당·카페만) "실내 자리 필요" 토글. 조건 겹쳐 0~1곳이면 안내 문구 | **구현됨** |
| 지도 | 현재와 같음 | 마커 테두리로 판정 구분(ok 실선 / cond 점선 / unknown 회색 테두리 / hard 반투명 opacity .45), 아이콘 캐시 키에 레벨 포함. 시트에 배지 + 첫 근거 한 줄. 상단에 "어려운 곳 숨기기" 토글 | **구현됨** |
| 근처 장소 | 카드에 `PetBadges limit={1}`(리뷰 ③ 요청 — 프로필과 무관) | 같은 카드에 판정 배지 추가 | **구현됨** |
| 상세 | 원문 카드 위에 조용한 배너 한 줄("우리 강아지를 등록하면 여기서 갈 수 있는지 바로 알려 드려요" → `/dog`) | 원문 카드 위에 판정 카드(레벨 색 점 + 머리글 "악동이는 갈 수 있어요"/"우현이와 민수는 확인이 필요해요"(cond 근거가 야외 자리만 하나면 "…야외 자리에서 갈 수 있어요")/정보 없음이면 이름 없이 "이곳은 반려견 동반 조건이 공개돼 있지 않아요"/"…이용하기 어려워요" + 근거 문구, 심각도순 — 배지는 안 쓴다: 라벨이 문장이 돼 머리글과 같은 말을 두 번 하게 됨). 요금(`info`)은 아래에 작게 별도 줄. 근거의 `quote` 는 원문 카드에서 `<mark>` 로 강조. 네이버 버튼은 판정과 무관하게 '반려동물 이용' 카드 바로 아래 유지 | **구현됨** |

## 데이터 — 구현됨

```ts
// src/types.ts
export type TDogSize = 'small' | 'medium' | 'large';
export type TCarrier = 'none' | 'bag' | 'cage' | 'stroller';
export type TDogEntry = { name: string; weightKg: number };
export type TDogProfile = {
  dogs: TDogEntry[];       // 1~3마리, 마리별 이름·몸무게. 무게 상한 비교는 최댓값, 마릿수는 length
  carrier: TCarrier;       // 한 벌 — 보호자가 들고 다니는 것이라 마리마다 갈리지 않는다
  sizeOverride?: TDogSize; // 자동 계산(dogSize())을 사용자가 고친 값
};
```

`needsIndoor` 는 `TDogProfile` 에 없다 — 여행 정보라 `useAppStore.needsIndoor` 로 따로 둔다.

- 스토어 `useAppStore` 에 `dog: TDogProfile | null`, `needsIndoor: boolean`, `setDog`, `clearDog`, `setNeedsIndoor`. persist 대상. `merge` 가 `sanitizeDog`(`src/lib/dogProfile.ts`)를 거친다: `dogs` 가 1~3개이고 각 항목의 이름이 비어 있지 않고 몸무게가 양수여야 하며, `carrier` 가 enum 밖이면 `dog: null`.
- **옛 모양 `{ name, weightsKg: number[] }` 는 버리지 않고 올려 변환한다.** 이름이 하나뿐이던 v1 프로필을 버리면 사용자는 이유도 모른 채 판정이 사라진 화면을 본다. 한 마리면 손실 없이 `[{ name, weightKg }]`, 여러 마리면 첫 마리에 그 이름을 주고 나머지는 `둘째`·`셋째` 라는 자리표시자를 준다(설정 → 수정에서 고칠 수 있다). 새 모양 검사가 먼저 돌아 멱등이다 — 변환은 localStorage 에 다시 써지기 전까지 매 로드마다 돌기 때문에 이 성질이 필요하다.
- 훅은 `src/store/useAppStore.ts` 의 `useDog()` 과 `src/store/useDogEligibility.ts` 의 `useEligibility(place)` · `useEligibilityMap()`(dog·needsIndoor 가 바뀔 때만 재계산).
- 크기 기본값(`dogSize()`, `src/lib/eligibility.ts`): `< 10kg → small`, `10~25 → medium`, `> 25 → large`. 원문의 "대형견" 과 정확히 일치한다는 보장이 없어 프로필 폼의 "크기 수정" 접힘에서 `sizeOverride` 로 고칠 수 있다.

## 프로필 폼 — 구현됨 (`src/screens/dogProfilePage.tsx`)

- 마리별 행(`DogProfileDogRows`, 최대 3행, "한 마리 더"/행 삭제) — 행마다 이름(필수, 12자) + 몸무게. 입력 중에는 채워 넣은 값이 틀렸을 때만(0 이하·숫자 아님·12자 초과) 행 에러를 보이고, 빈 칸은 저장을 눌렀을 때 잡는다("이름을 입력해 주세요"/"몸무게를 입력해 주세요") · 이동 수단 4택(`DogProfileCarrierPicker`, 각 한 줄 설명 — **기본 선택 없음**, 안 고르고 저장하면 "외출할 때 어떻게 데리고 다니는지 골라 주세요" 와 함께 첫 옵션으로 포커스. 기본값 '없어요' 로 두었더니 가방이 있는 사람도 그대로 저장해 식당 대부분이 "어려움" 으로 조용히 뒤집혔다. 기존 프로필은 저장된 값으로 채워진다) · "크기 수정" 접힘(`DogProfileSizeOverride`, 자동 계산값 표시 + 셀렉트로 override) · 저장(**온 곳으로 되감는다** — 앱 안에서 왔으면 `router.back()`, 딥링크로 폼에 바로 들어왔으면 되감을 곳이 없어 부모 `/settings` 로 `replace`. 셸의 뒤로가기와 같은 규칙(`appHistory`)이라 저장 뒤 뒤로가기가 폼으로 가지 않는다. 도착 화면에 셸 상태 줄로 "보리 기준으로 바꿨어요"(`dogProfileSavedMessage`) — 화면이 바뀌어도 알림이 남도록 셸이 그린다) · 등록돼 있으면 삭제(확인 없이 즉시, `window.confirm` 미사용 — 대신 셸 토스트 "프로필을 지웠어요 · 되돌리기" 6초. 지운 프로필은 그 클로저만 붙잡고 저장하지 않는다. 화면 안 배너는 폼 맨 위라 맨 아래 버튼을 누른 사람에게 안 보여 없앴다, [todo/12](../todo/12-ux-audit-2026-10-02.md) U2.1).
- `useAppStore` 가 `skipHydration: true` 라 첫 렌더는 항상 `dog: null` 이다. 폼은 하이드레이션이 끝날 때까지 그리지 않고("불러오는 중"), 끝난 시점의 `dog` 로 한 번만 초기값을 채운다(렌더 중 상태 조정 패턴 — 이펙트로 하면 빈 폼이 한 프레임 보였다가 채워진다).
  - 기다리는 기준은 **"읽기가 끝났나"**(`useStoreHydrated()`)지 "성공했나"(`persist.hasHydrated()`)가 아니다. 저장된 값이 깨지면 후자는 영원히 false 라 이 화면이 "불러오는 중이에요…" 에 갇혔다(→ [BUG-002](../bugs/BUG-002-hydration-deadlock.md)). 읽기에 실패했으면 **저장된 것이 없는 사람과 같은 상태**로 빈 폼을 그린다.

## 판정 — 구현됨

`src/lib/eligibility.ts`

```ts
export type TEligibilityLevel = 'ok' | 'cond' | 'unknown' | 'hard';
export type TReason = { level: TEligibilityLevel | 'info'; text: string; quote?: string };
export type TEligibility = { level: TEligibilityLevel; reasons: TReason[]; fee?: string };

export const dogSize: (dog: TDogProfile) => TDogSize;
export const judgeEligibility: (dog: TDogProfile, policy: TPetPolicy, opts?: { needsIndoor?: boolean }) => TEligibility;
export const compareEligibility: (a: TEligibilityLevel, b: TEligibilityLevel) => number; // ok < cond < unknown < hard
```

규칙표는 [architecture/pet-policy-and-eligibility.md §3](../architecture/pet-policy-and-eligibility.md#3-판정--구현됨) 에 있다. 첫 매치가 아니라 **전부 평가해 가장 센 레벨**을 채택하고, `reasons` 는 심각도순으로 정렬된다.

요금 문구는 `src/lib/dogFee.ts` 의 `formatDogFee(policy, dog)` — `TEligibility.fee` 와 info 근거에 같은 문자열이 들어가고 카드는 그대로 출력한다(예전엔 카드가 이름을 따로 붙였다). 이름이 들어가는 문장은 `src/lib/korean.ts`(`dogCallNames`·`withJosa`)를 거친다.

테스트(`eligibility.test.ts`)는 프로필 3종(두부 4kg·이동가방 / 보리+콩 28kg+17kg·이동 수단 없음 / 콩 17kg·케이지)에 대해 실제 장소(웨스티하우스·모닥식탁·무거버거·맘앤도그·솔숲펜션)의 기대 판정을 적고, 보리+콩 프로필로 86곳 전체를 집계해 디자인 리뷰의 사람 판단(가능 9·조건부 30·어려움 42·정보 없음 5) ±5 안에 들어오는지 확인한다(구현 결과: 7·32·42·5 — 전부 ±5 안).

## 범위 밖

- 마리별 이동 수단(케이지·유모차를 마리마다 따로), 견종·성향, 서버 동기화, 공유 링크에 프로필 싣기. 마리별 **이름**은 v2 에서 들어왔다(ADR-005 v3).

## 남은 작업

1. ~~파서 결과 86건 점검~~ — A1 에서 완료.
2. ~~타입·스토어·`eligibility.ts` + 테스트~~ — A2·B1 에서 완료.
3. ~~프로필 폼 화면(`/dog`)~~ — B1 에서 완료.
4. ~~상세 화면 판정 표시~~ — B2 에서 완료(`src/screens/placeDetailEligibilityCard.tsx`).
5. ~~둘러보기·지도·홈·근처 장소 판정 표시~~ — B3 에서 완료.

남은 작업 없음. 판정 관련 토글("어려운 곳 숨기기"·"실내 자리 필요")은 프로필이 있을 때만 보인다 — 프로필이 없으면 모든 화면이 이전과 같아야 한다는 제약 때문이다.
