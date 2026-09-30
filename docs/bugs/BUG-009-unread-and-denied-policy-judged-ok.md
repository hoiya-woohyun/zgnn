# BUG-009 — 못 읽은 조건과 '대형견 불가' 가 '갈 수 있어요'·'확인 필요' 로 판정됐다

> 최종 수정: 2026-09-30 (v1: 신설 — [todo/06](../todo/06-admin-review.md) 「열린 것」 A-1·A-2 를 고쳤다. `/admin` 의 문구
> "AI 는 읽었는데 사이트에 안 나와요" 가 무엇을 뜻하느냐는 질문에서 판정까지 번지는 것이 확인됐다)
> 상태: 고침(`src/lib/petPolicy.ts` — `largeDogNo`·`unread`·`feeCharged`; `src/lib/eligibility.ts` H7·C7; `scripts/lib/petPolicyFacts.mjs` — AI 판단 보정).

## 증상

1. **원문은 있는데 아무도 못 읽으면 '갈 수 있어요'** — 정규식도 AI 도 조건을 하나도 못 뽑은 원문(블로그 구어체)이 판정 규칙을 하나도
   걸지 않아 `ok` 가 됐다. 첫 분석에서 조건 문장 32건 중 20건이 정규식 0 이었다(ADR-017) — 드문 경로가 아니다. BUG-008 이 빈 원문에서 막은
   상태가 "원문 있음 · 못 읽음" 으로 살아 있었다.
2. **AI 가 '대형견 불가' 를 읽어도 대형견에게 '확인이 필요해요 · 대형견 언급이 없어요'** — 원문과 반대 말이다. 같은 후보를 `/admin` 은
   "AI 는 읽었는데 사이트에 안 나와요" 라고 표시했다. AI 의 '추가 요금 있음'(`feeFree: false`)도 화면 어디에도 안 나왔다.

## 원인

- `TPetPolicy.largeDogOk` 가 참/거짓 **한 칸**이라 "불가"(`false`)와 "언급 없음"(기본값 `false`)을 구분하지 못했다. 판정 C5 는
  `if (policy.largeDogOk)` 로 보므로 불가가 언급 없음으로 읽혔다. 배지도 되는 것만 만든다(`대형견 OK`).
- `withPolicyFacts` 의 `anyFact` 가 `largeDogOk === false`·`feeFree === false` 를 '판단 있음' 으로 세서 `noInfo` 는 꺼지는데,
  그 값이 닿는 규칙·배지는 없었다 — 판단이 있는데 아무 데도 안 쓰였다.
- "원문 있음 · 아무것도 못 읽음" 을 나타내는 신호가 없었다. 판정은 `hard`/`noInfo`/`cond` 가 아니면 `ok` 다(BUG-008 과 같은 구조).
- 정규식 `어렵` 은 '어려워요' 를 못 잡는다(ㅂ 불규칙) — '애견동반은 어려워요' 도 `notAllowed` 를 비껴갔다.

## 고침

- `largeDogNo`(정규식 "대형견 … 불가/안 돼/어려워/금지/제한" + AI `largeDogOk: false`) → **H7**(대형견은 어려움) · 배지 '대형견 불가' · C5 는 물러난다.
- `unread`(원문 있음 + 판정·배지에 쓰일 조건 0개, 일반 허용 문장만 있는 원문은 제외) → **C7**(확인 필요) · 배지 '원문 확인 필요'.
- `feeCharged`(AI `feeFree: false`, 금액 문장 없음) → 배지 '추가요금 있음'.
- 같은 작업에서 **AI 판단 보정**(`correctPetPolicyFacts`)을 더했다 — H7 이 생기면서 모델이 추론으로 낸 `largeDogOk: false` 가 곧 '어려움' 이
  되기 때문이다. 원문에 근거 단어·숫자가 없는 판단은 뺀다([pet-policy-and-eligibility §4](../architecture/pet-policy-and-eligibility.md)).
- 테스트: `eligibility.test.ts`(H7·C7·시드 86곳 불변) · `petPolicy.test.ts`(병합·제한 우선·요금 있음) · `petPolicyFacts.test.mjs` · `reviewCandidates.test.mjs`.

## 교훈

부정은 기본값과 같은 칸에 두면 사라진다. "안 된다" 를 말하는 판단은 기본값과 **다른 칸**이어야 판정까지 간다.
그리고 판단이 '있음' 으로 세어지는 곳(`anyFact`)과 판단이 **쓰이는** 곳(규칙·배지)이 같은 목록을 봐야 한다 — 이번엔 앞쪽만 늘어 있었다.
