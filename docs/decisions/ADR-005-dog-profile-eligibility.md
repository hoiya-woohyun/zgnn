# ADR-005: 강아지 프로필 기반 판정을 v1 의 중심으로

> 작성일: 2026-09-15 · 최종 수정: 2026-09-15(스펙 v2 반영)
> 상태: **채택**

## 맥락 (Context)

- 앱의 목적은 "가이드를 예쁘게 보여주기" 가 아니라 **"우리 강아지가 갈 수 있는 곳" 을 골라 주기**다(→ [CONCEPT.md](../CONCEPT.md)).
- v0 의 필터(실내 OK·대형견 OK·2마리 이상 …)는 조건을 사용자가 매번 고르게 한다. 사용자의 강아지는 바뀌지 않는데 같은 조건을 화면마다 다시 켜야 한다.
- 원 자료의 조건은 몸무게·마릿수·실내 여부·이동가방 유무로 대부분 설명된다. 즉 프로필 필드 몇 개면 판정이 가능하다.
- 디자인 리뷰(`docs/reviews/2026-09-15-design-review.md` §1)가 초안 스펙(v1)의 네 가지 위험을 지적했고, 아래 결정은 그 지적을 반영한 v2다.

## 결정 (Decision) — 스펙 v2

- 스토어에 `dog: TDogProfile | null` 을 추가한다. `TDogProfile = { name, weightsKg: number[], carrier, sizeOverride? }`. 기기 로컬 전용(`useAppStore`, persist).
  - `weightsKg` 는 **마리별 몸무게 배열**(1~3)이다. `count`+대표 몸무게 한 쌍으로 뭉치면 28kg+17kg 를 "28kg 2마리" 로 잘못 읽는다(리뷰 §1③). 무게 상한 비교는 최댓값, 마릿수는 `length`.
  - `carrier: 'none' | 'bag' | 'cage' | 'stroller'` 로 이동 수단을 넷으로 나눈다. `hasCarrier: boolean` 한 칸이면 슬링백을 케이지로 오해해 케이지 필수 식당 다수가 잘못 "가능" 이 된다(리뷰 §1③).
  - `size` 는 프로필 필드가 아니라 `weightsKg` 최댓값에서 파생한다(`dogSize()`). 원문의 "대형견" 과 어긋날 수 있어 `sizeOverride?` 로 사용자가 고칠 수 있게만 열어 둔다(리뷰 §1①).
  - `needsIndoor` 는 `TDogProfile` 이 아니라 `useAppStore` 의 별도 필드다 — 강아지 정보가 아니라 여행 정보라서다(리뷰 §1②).
- `src/lib/eligibility.ts` 에 `judgeEligibility(dog, policy, opts) → TEligibility` 순수 함수를 둔다. `level` 은 `ok | cond | unknown | hard`.
  규칙은 [architecture/pet-policy-and-eligibility.md](../architecture/pet-policy-and-eligibility.md#3-판정--구현됨) 의 표(`RULES` 상수 배열)를 그대로 옮긴다. **"먼저 걸린 규칙" 이 아니라 전부 평가해 가장 센 레벨을 채택**한다 — 리뷰 §1 이 지적한, 규칙 하나("대형견 확인해 주세요")가 원문의 진짜 핵심 근거("케이지 동반시 가능")를 덮는 문제를 이 방식으로 없앤다. `reasons[].quote` 로 근거 원문 문장을 함께 돌려준다.
- 프로필이 있으면 목록·지도·상세가 판정을 먼저 보여주고 정렬한다. 프로필이 없으면 v0 화면 그대로.
- 기존 필터는 없애지 않는다. 판정은 프로필 기준의 기본값이고, 필터는 그 위에 얹는 수동 조건이다.
- 첫 진입 강제 등록은 하지 않는다. 홈 카드 + 상세 배너로만 유도(리뷰 §1 기타 지적).

## 결과 (Consequences)

- 판정 강도(케이지 필수+대형견 조합을 조건부로 볼지 어려움으로 볼지 등)는 제품 판단이라 사용자가 정한다. `RULES` 배열 순서·조건을 조정하는 것으로 바꿀 수 있다. `pet-policy-and-eligibility.md` §3 의 "미해결 제품 판단 1건" 이 그 예다.
- 파서(`petPolicy.ts`)의 누락이 판정 오류로 직결된다. A1 웨이브에서 `tiers`·`outdoorFree`·`unlimitedDogs`·`sources` 를 파서에 먼저 보강한 뒤에야 이 판정 층을 붙였다.
- 화면 문구가 "짱구가 갈 수 있는 곳" 처럼 이름을 부르게 되므로, 프로필 없는 상태의 문구와 두 벌을 유지한다.
- 여러 마리의 마리별(개별) 프로필(이름·이동 수단을 마리마다 따로), 견종·성향 같은 필드는 이번 범위 밖. 필요가 확인되면 이 ADR 을 보완한다.
