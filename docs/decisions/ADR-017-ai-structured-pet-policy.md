# ADR-017 — 이용 조건의 구조화는 AI 가 뽑을 때 판단하고, 정규식 파서는 시드와 안전망으로 남긴다

> 최종 수정: 2026-09-30 (v2: **AI 판단도 원문에 대 본다** — 결정 6·7 추가. 원문에 근거 단어·숫자가 없는 판단은 빼고(`correctPetPolicyFacts`,
> 분석 시점과 앱 두 곳), 정규식이 읽은 제한은 AI 의 허용이 풀지 못한다. 계기는 '대형견 불가' 가 판정에 닿게 한 것(BUG-009) — 그 순간부터
> 모델이 추론으로 낸 부정이 곧 '어려움' 이 되므로 근거 확인이 필요해졌다)
> 이전 (v1: 신설 — 첫 `data:analyze` 실측(글 50건 → 후보 160건)과 설계 검토에서 나온 결정)
> 상태: 결정 · 구현됨(`scripts/analyze/extractPlaces.mjs` 의 `petPolicy` · `places.pet_policy` · `src/lib/petPolicy.ts` 의 `withPolicyFacts` · `pnpm data:review`).

## 맥락

[ADR-004](ADR-004-pet-policy-parser.md)와 [data-pipeline](../architecture/data-pipeline.md)의 원칙은 "AI 는 원문 문장만 옮기고, 구조화(무게·마릿수·실내외)는
앱의 정규식(`parsePetPolicy`)이 런타임에 한다" 였다. 파서 규칙을 고칠 때 데이터를 다시 만들 필요가 없게 하려는 것이었고, 시드 86곳
(와이프가 쓴 짧은 문장 — "5kg 이하의 1마리만 가능.")에서는 잘 맞았다.

2026-09-28 첫 실행(네이버 키 없이 50건)에서 이용 조건 문장이 있는 후보 32건 중 **20건을 정규식이 아무것도 못 읽었다**
("애견동반은 야외좌석만 가능해요", "예방접종 확인서를 가지고 가야 합니다"). 빈 문장은 앱이 '갈 수 있어요' 로 판정했고([BUG-008](../bugs/BUG-008-empty-pet-policy-judged-ok.md)),
"애견동반은 아쉽게도 안됩니다" 라고 적힌 카페가 후보로 들어왔다. 정규식 어휘를 늘려도 구어체는 끝이 없다 — 사용자도 "패턴이 아니라 Claude 가 요약할 때 판단하는 쪽" 을 택했다.

## 결정

1. **추출 스키마에 `petPolicy`(`TPetPolicyFacts`, `src/types.ts`)를 둔다** — AI 가 `petPolicyText` 를 읽고 판단한 구조화 값(실내 정책 · 리드줄 · 대형견 · 소형견만 · 전화 확인 · 추가 요금 · 무게 상한 · 마릿수 · 비고).
   원문(`petPolicyText`)은 그대로 저장·표시한다. 원문이 null 이면 판단도 null.
2. **`places.pet_policy`(jsonb)에 저장하고, 앱은 있으면 `withPolicyFacts` 로 정규식 결과를 덮는다.** null 은 "언급 없음" 이라 정규식 값을 남긴다.
   무게·마릿수는 `tiers` 로도 넣어 판정의 계단식 규칙(H1·H2)이 같은 숫자를 본다.
3. **정규식 파서는 남긴다.** 시드 86곳(`pet_policy` null)의 유일한 경로이고, 블로그 경로에서는 AI 가 null 로 둔 필드의 안전망이다. 새 표현은 여전히 정규식 한 줄 + 테스트 한 줄(ADR-004).
   이번에 블로그 구어체(야외 좌석만 · 테라스만 · 켄넬/이동장 챙기기 · 목줄/하네스)를 더했다.
4. **사람 검수가 두 판단을 나란히 본다** — `pnpm data:review` 가 후보마다 `정규식 [..] · AI [..] · 앱 [..]` 과 `⚠ AI≠정규식` 표식을 찍는다. 그 어긋남이 "정규화가 잘 됐는가" 의 실측이다.
5. **빈 문장은 정보 없음이다**(`parsePetPolicy('')` → `noInfo`, 판정 `unknown`). **"동반 안 됨" 문장은 `notAllowed`** → 판정 `hard`(H0) 이고, 추출 단계에서는 아예 후보를 만들지 않는다(`petAllowed: 'no'` → 제외, `blog_posts.analysis.excluded` 에 이유가 남는다).

6. **AI 판단은 덮기 전에 원문에 대 본다**(v2, `scripts/lib/petPolicyFacts.mjs`). 숫자는 원문에 `N kg`·`N마리` 로 있어야 하고, 참/거짓은 근거 단어가 있어야 한다.
   모순(소형견만 + 대형견 가능 등)은 허용 쪽을 뺀다. 이유: 틀린 제한도 틀린 허용만큼 해롭다 — 없는 `10kg` 이 대형견을 '어려움' 으로 보낸다.
   **분석 시점**(저장 전)과 **앱**(읽을 때) 두 곳에서 같은 함수가 돈다 — 보정 전에 분석된 값이 DB 에 남아 있어서다. `facts` 원본은 검수 화면에 그대로 보이고
   뺀 것은 따로 표시된다(프롬프트를 고칠 재료).
7. **제한은 정규식이 이긴다**(v2). 결정 2 의 "AI 가 덮는다" 에 예외 하나 — AI 가 `실내 자유`·`대형견 가능` 인데 정규식이 케이지·야외만·대형견 불가를 읽었으면
   정규식을 남긴다. 반대(AI 가 더 엄격)는 결정 2 그대로 AI 를 따른다.

## 결과

- "두 벌이 되면 어긋난다"(03) 는 우려는 역할 분리로 푼다 — 원문은 **표시용**, 구조화는 **판정용**. 어긋나면 검수 표식으로 드러난다.
  사람이 쓴 원문이 있는 기존 장소에는 다른 글의 AI 판단을 얹지 않는다(`mergeIntoExisting` 은 `pet_policy_text` 를 채울 때만 `pet_policy` 를 함께 채운다).
- 프롬프트가 바뀌면 판단도 바뀐다 — `extracted.meta.promptVersion` · `blog_posts.analysis.promptVersion` 으로 재분석 대상을 고른다(`analyzed_at` 만으로는 못 고른다).
- 시드 86곳에 AI 판단을 덧씌우는 일은 하지 않는다(정규식이 이미 읽고 테스트가 못 박고 있다). 필요해지면 별도 결정.
- 스키마·프롬프트가 바뀌어 `PROMPT_VERSION` 이 바뀌었다 — 첫 실행의 160건(옛 프롬프트, 좌표·`petPolicy`·`visited` 없음)은 `data:review` 에 "AI 판단 없음" 으로 보인다.

## 관련

[ADR-004](ADR-004-pet-policy-parser.md) 정규식 파서 · [pet-policy-and-eligibility](../architecture/pet-policy-and-eligibility.md) · [docs/todo/03](../todo/03-analyze-and-review.md) · [BUG-008](../bugs/BUG-008-empty-pet-policy-judged-ok.md)
