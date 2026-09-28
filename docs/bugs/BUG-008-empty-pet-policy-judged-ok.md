# BUG-008 — 빈 이용 조건이 '정보 없음' 이 아니라 '갈 수 있어요' 로 판정됐다

> 최종 수정: 2026-09-28 (v1: 신설 — 설계 검토 FF-1·OB-3, 첫 `data:analyze` 실측에서 발견)
> 상태: 고침(`src/lib/petPolicy.ts` — 빈 원문 → `noInfo`, "동반 안 됨" 문장 → `notAllowed`; `src/lib/eligibility.ts` H0).

## 증상

`petPolicyText` 가 `''` 인 장소를 8kg 강아지·이동 수단 없음 프로필로 판정하면 `ok`('갈 수 있어요')가 나왔다. "풍차해안도로와 가깝지만 애견동반은
아쉽게도 안됩니다" 라는 문장도 같은 결과였다. 첫 분석의 후보 160건 중 128건이 조건 문장이 없었으므로, 승인해 게시했다면 전부 '갈 수 있어요' 로 떴다.

## 원인

- `parsePetPolicy` 의 `noInfo` 는 `/정보\s*없음/` 문자열만 봤다. 시드 86곳은 빈 값이 없고 모르는 곳은 "정보 없음. (문의해보시면…)" 이라 적어 두었기 때문에
  드러나지 않았다. 문서([pet-policy-and-eligibility](../architecture/pet-policy-and-eligibility.md))는 "원문이 비었거나 '정보 없음'" 이라 적혀 있어 문서와 코드가 어긋나 있었다.
- 블로그 경로는 조건 언급이 없으면 `null` → `applyApproved` 가 `''` 로 저장한다(NOT NULL 제약). 그래서 시드 관습을 비껴갔다.
- 판정(`judgeEligibility`)은 `hard`/`noInfo`/`cond` 어느 것도 아니면 `ok` 다 — "조건이 없다" 와 "조건이 확인되지 않았다" 를 구분할 신호가 없었다.
- 동반 자체를 막는 문장은 어느 규칙도 읽지 않았다(견종 뒤의 '불가' 만 `NOT_DENIED` 로 다뤘다).

## 고침

- `parsePetPolicy('')`·공백만 → `noInfo: true`(근거 문장은 없으므로 `sources.noInfo` 없음) → 판정 `unknown`('이용 조건이 적혀 있지 않아요').
- `notAllowed` 플래그(주어 + 동반/출입/입장 + 불가/안 됨/금지)와 판정 규칙 H0('반려견 동반이 안 된다고 적혀 있어요', `hard`), 배지 '동반 불가'.
- 추출 단계에서 `petAllowed: 'no'` 인 장소는 후보를 만들지 않는다(`exclusionReason` → `notAllowed`).
- 테스트: `petPolicy.test.ts`(빈 원문·동반 불가·시드 86곳 회귀 가드) · `eligibility.test.ts`(빈 원문 → unknown, 동반 불가 → hard).

## 교훈

빈 값의 의미를 데이터 관습("정보 없음." 문자열)에만 맡기면 새 입구가 그 관습을 모른 채 들어온다. 의미는 파서에 둔다.
