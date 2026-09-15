# 내 강아지 프로필과 장소별 판정

> 상태: 제안 (구현 전)
> 최종 수정: 2026-09-15 (v1: 스펙 초안)
> 결정 근거: [ADR-005](../decisions/ADR-005-dog-profile-eligibility.md) · 판정 규칙: [architecture/pet-policy-and-eligibility.md](../architecture/pet-policy-and-eligibility.md)

## 목표

강아지를 한 번 등록하면 목록·지도·상세가 "우리 강아지 기준" 으로 보인다. 등록하지 않으면 지금 화면 그대로다.

## 사용자 흐름

```mermaid
flowchart TD
  H[홈] -->|"우리 강아지 등록하기"| F[프로필 폼<br/>이름 · 몸무게 · 마릿수 · 이동가방 · 실내 필요]
  F -->|저장| H2[홈: "짱구가 갈 수 있는 곳 N곳"]
  H2 --> L[둘러보기: 판정 배지 + 정렬]
  H2 --> M[지도: 마커에 판정 표시]
  L --> D[상세: 판정 + 근거 → 원문 카드]
  H2 -->|프로필 수정| F
```

## 화면

| 화면 | 프로필 없음 | 프로필 있음 |
|---|---|---|
| 홈 | 현재와 같음 + "우리 강아지 등록하기" 카드 | 인사말에 이름. 종류 카드의 숫자가 "갈 수 있는 곳 / 전체" |
| 둘러보기 | 현재와 같음 | 카드에 판정 배지 1개. 기본 정렬 가능 → 조건부 → 정보 없음 → 어려움. "어려움 숨기기" 토글 |
| 지도 | 현재와 같음 | 마커 테두리로 판정 구분(가능 실선 / 조건부 점선 / 어려움 반투명). 미니 카드에 배지 |
| 상세 | 현재와 같음 | 원문 카드 위에 판정 + 근거 문구 목록. 어려움이어도 네이버 링크·전화 안내 유지 |
| 프로필 폼 | `/dog` (신규 라우트, 정적) | 같은 화면에서 수정·삭제 |

## 데이터

```ts
// src/types.ts (추가)
export type TDogSize = 'small' | 'medium' | 'large';
export type TDogProfile = {
  name: string;
  weightKg: number;
  size: TDogSize;      // weightKg 로 기본값, 사용자가 고칠 수 있음
  count: number;       // 함께 가는 마릿수
  hasCarrier: boolean; // 케이지·이동가방·유모차
  needsIndoor: boolean;
};
```

- 스토어 `useAppStore` 에 `dog: TDogProfile | null`, `setDog`, `clearDog`. persist 대상. `merge` 에서 형태가 깨진 값은 `null` 로.
- 크기 기본값: `< 10kg → small`, `10~25 → medium`, `> 25 → large`. 원문의 "대형견" 과 정확히 일치한다는 보장이 없어 사용자가 고칠 수 있게 한다.

## 판정

`src/lib/eligibility.ts`(신규)

```ts
export type TEligibilityLevel = 'ok' | 'cond' | 'hard' | 'unknown';
export type TEligibility = { level: TEligibilityLevel; reasons: string[] };
export const judgeEligibility = (dog: TDogProfile, policy: TPetPolicy): TEligibility => { /* 규칙 테이블 */ };
```

규칙은 아키텍처 문서의 표를 그대로 옮긴다. 첫 매치가 결과이고, 정보성 문구(요금)는 `reasons` 에 덧붙인다.
테스트는 실제 원문 몇 건을 골라 프로필 2~3종(소형 1마리 이동가방 있음 / 대형 1마리 / 소형 2마리)에 대해 기대 판정을 적는다.

## 범위 밖

- 마리별 프로필, 견종·성향, 서버 동기화, 공유 링크에 프로필 싣기.

## 구현 순서 (제안)

1. 파서 결과 86건 점검(누락 표현 보강) — 판정 정확도의 전제.
2. 타입·스토어·`eligibility.ts` + 테스트.
3. 프로필 폼 화면(`/dog`).
4. 상세 → 둘러보기 → 지도 → 홈 순으로 판정 표시.
5. 문서 갱신: 이 문서의 상태를 "구현됨" 으로, ADR-005 상태를 "채택" 으로.
