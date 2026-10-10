# 8. 사용성·프로세스 실행 계획 — 한 태스크 = 한 커밋

> 최종 수정: 2026-09-29 (v1: 신설. 근거는 [reviews/2026-09-29-persona-and-process-review.md](../reviews/2026-09-29-persona-and-process-review.md) —
> 페르소나 과제 흐름 77장 + 디자이너 크리틱 + 프로세스 점검. **Sonnet 이 위에서부터 하나씩 집어 실행하도록** 태스크마다 파일·단계·수용 기준·검증 명령을 붙였다.
> [07](07-product-and-ux.md) 과 겹치는 항목은 가져오지 않고 링크만 건다 — 07 은 "무엇을 왜", 08 은 "그대로 따라 하면 되는 것")

## 실행 규약 (먼저 읽는다)

**이 문서를 받은 에이전트는 이렇게 일한다.**

1. **태스크를 위에서부터 하나 고른다.** `[ ]` 인 것 중 가장 위, 단 `선행:` 이 `[x]` 가 아니면 건너뛴다. `🧑 사람 손` 표시는 건너뛴다.
2. **「읽을 것」 만 읽는다.** 레포 전체를 탐색하지 않는다. 막히면 `CLAUDE.md` 의 「어디를 읽을까」 표 한 홉까지만.
3. **「단계」 대로 바꾼다.** 단계에 없는 파일을 고쳐야 하면 멈추고 태스크 끝에 `> 메모:` 로 이유를 적은 뒤 그 범위만 한다. 설계를 새로 하지 않는다.
4. **검증 — 전부 통과해야 커밋한다.**
   ```bash
   pnpm exec tsc --noEmit && pnpm lint && pnpm test
   pnpm build          # 화면·설정을 건드린 태스크만. --webpack 은 스크립트에 이미 있다 — 빼지 않는다
   ```
   태스크에 「확인」 절이 있으면 그것도 한다(대개 `pnpm dev` 후 390×844 로 해당 화면을 연다).
5. **커밋 한 개.** 메시지는 태스크의 「커밋」 줄 그대로(접두어 `feat -`·`fix -`·`docs -`·`style -`·`refactor -` 는 이 레포 관례).
   같은 커밋에서 이 문서의 해당 `[ ]` 를 `[x]` 로 바꾸고, 계획과 다르게 간 점이 있으면 한 줄 `> 메모:` 를 남긴다.
6. **push** — `git push -u origin <현재 브랜치>`. 커밋을 쌓아 두지 않는다(프로세스 점검 S5: 미push 가 세 번 반복됐다).
7. **멈출 때**: 테스트가 두 번 고쳐도 빨갛다 · 단계가 코드와 맞지 않는다(줄 번호가 달라진 건 괜찮다, 함수가 없으면 멈춘다) · 아래 금지 규칙과 충돌한다 → 태스크에 `> 막힘:` 을 적고 커밋·push 후 다음 태스크로.

### 금지 규칙 (이 계획의 어떤 태스크도 이것을 깨지 않는다)

| 규칙 | 이유 |
|---|---|
| 이동가방·케이지·유모차를 `ITEM_NEEDS`(준비물 표)에 넣지 않는다 | 판정과 준비물이 서로 반대로 말한다 — [ADR-009](../decisions/ADR-009-trip-derived-checklist.md) |
| `src/components/base/` 를 고치지 않는다 — 감싸는 컴포넌트를 `src/components/` 에 만든다 | Untitled UI 복사본 |
| 색은 시맨틱 토큰으로만(`bg-brand-solid`·`text-secondary`). 원시 값은 `src/styles/theme.css` 에만 | [ADR-003](../decisions/ADR-003-untitled-ui-and-palette.md) |
| 크기를 브레이크포인트마다 손으로 키우지 않는다(`md:text-lg` 금지). 44px(`h-11`) 아래로 줄이지 않는다 | [ADR-006](../decisions/ADR-006-responsive-scale-and-font.md) |
| 화면에 `AppBar`·`pt-safe`·`env(safe-area-inset-top)` 를 직접 달지 않는다 | 셸 몫 — ADR-007 · ADR-010 |
| `<main>` 안에 `position: fixed` 를 새로 두지 않는다(토스트 포함 — 셸 밖 포털로) | 스와이프 중 자리가 어긋남 — ADR-014 |
| 판정 **등급**(`ok/cond/unknown/hard`)은 태스크가 명시한 곳 외엔 바꾸지 않는다. 문구만 바꾸는 태스크는 등급 테스트가 그대로 통과해야 한다 | 판정은 이 앱의 핵심 도메인 |
| `vercel.json` 에 `outputDirectory` 를 넣지 않는다 | BUG-005 |
| 사진을 넣지 않는다 | ADR-002 |
| 시크릿·`pnpm data:*` 를 부르지 않는다 | ADR-016 — 데이터 태스크는 전부 🧑 |

### 문서 갱신 기준 (이 계획 안에서)

동작이 바뀌는 태스크만 문서를 고친다 — 각 태스크의 「문서」 줄이 정본이다. 없으면 고치지 않는다.
문서를 고치면 H1 아래 `> 최종 수정: YYYY-MM-DD (vN: 무엇을 왜)` 를 맨 위에 한 줄 더한다.

---

## 순서 한눈에

| 단계 | 태스크 | 성격 | 크기 |
|---|---|---|---|
| **P0 — 화면이 서로 반대로 말하는 것** | T1.1 ~ T1.6 | 판정·요금·문구 | 각 S |
| **P0 — 프로세스 정본 정리** | T0.1 ~ T0.3 | 문서만 | S~M |
| P1 — 목록·홈이 답을 말하게 | T2.1 ~ T2.5 | 화면 | S~M |
| P1 — 흐름과 피드백 | T3.1 ~ T3.4 | 화면 | S |
| P2 — 정밀화 | T4.1 ~ T4.8 | 화면·접근성·문구 | S |
| P2 — 프로세스 부채 | T0.4 ~ T0.7 | 문서·훅 | S~M |
| P3 — 나중에 | T5.x | 설계 필요 | — |
| 🧑 사람 손 | H.x | 데이터·결정·실사용자 | — |

P0 두 줄은 서로 독립이다 — 어느 쪽부터 해도 된다. 권장: T1.1 → T1.2 → T0.1 → 나머지.

---

## P0 — 화면이 서로 반대로 말하는 것

### [x] T1.1 어려움 판정에서 "여기 가려면 N가지를 챙겨야 해요" 를 숨긴다

- 근거: 페르소나 두 명 모두 "못 간다면서 챙기래요" (리뷰 §1, D 크리틱 #3). ADR-009 가 막으려던 "서로 반대로 말하는 화면" 이 넛지로 새로 생겼다.
- 읽을 것: `src/components/missingItemsNote.tsx` · `src/store/useDogEligibility.ts`(`useEligibility`) · 호출부 `src/screens/placeDetailPage.tsx`(83행 부근) · `src/screens/mapPageSheet.tsx`(60행 부근) — 상세 페이지는 판정을 직접 계산하지 않는다(판정 카드 안에서 `useEligibility` 로 얻는다)
- 단계:
  1. `src/lib/itemNeeds.ts`(또는 넛지가 쓰는 lib)에 순수 함수 `shouldShowMissingItems(level: TEligibilityLevel | undefined): boolean` 추가 — `hard` 면 `false`, 나머지(프로필 없음 = `undefined` 포함)는 `true`.
  2. `MissingItemsNote` 안에서 `useEligibility(place)?.level` 을 직접 읽고, `shouldShowMissingItems(level)` 가 거짓이면 `null` 을 반환. **prop 은 더하지 않는다.**
  3. 두 호출부(`placeDetailPage.tsx` · `mapPageSheet.tsx`)는 그대로 둔다.
  4. 문구 톤 조정: "여기 가려면 N가지를 더 챙겨야 해요" → "여기 갈 때 챙기면 좋은 것 N가지". (`missingItemsNote.tsx` 안의 문자열만)
- 테스트: `itemNeeds.test.ts` 에 `shouldShowMissingItems` 4케이스(`ok`·`cond`·`unknown`·`hard`) + `undefined`.
- 수용 기준: 대형견 2마리(28·17kg) 프로필로 "그리너리빌리지 펜션" 상세에 노란 박스가 없다. 말티푸 4kg 로 같은 곳을 열면 판정에 따라 보인다.
- 문서: `docs/features/checklist.md` 에 한 줄 — "어려움 판정에서는 넛지를 띄우지 않는다(판정과 반대로 말하므로)".
- 커밋: `fix - 어려움 판정에서 준비물 넛지를 숨긴다 (못 간다면서 챙기라고 하지 않게)`

### [x] T1.2 이동 수단을 미리 고르지 않는다 — 저장 전에 한 번 묻는다

- 근거: 지수가 가방이 있는데 기본값 "없어요" 로 저장 → 식당 28곳이 "어려움". 식당 결과는 이 값 하나로 결판난다(제품·UX 점검 §2).
- 읽을 것: `src/screens/dogProfilePage.tsx`(75행 `useState<TCarrier>('none')`, 91행 기존 프로필 시드, 120행 `setDog`) · `src/screens/dogProfileCarrierPicker.tsx` · `src/types.ts` 의 `TCarrier`
- 단계:
  1. 폼 상태를 `useState<TCarrier | null>(null)` 로. **기존 프로필이 있으면 그 값으로 시드**(91행 동작 유지) — 이미 저장한 사용자는 영향 없음.
  2. `DogProfileCarrierPicker` 의 `value` 를 `TCarrier | null` 로 받게 하고, `null` 이면 아무 것도 선택되지 않은 상태로 그린다.
  2-b. 같은 파일에서 `carrier` 를 쓰는 곳을 모두 null 안전하게: `dogSize({ dogs: validDogs, carrier })`(108행 부근 — `carrier ?? 'none'` 로 크기만 계산) · 삭제 핸들러의 `setCarrier('none')`(128행 부근) → `setCarrier(null)` · `setDog({…, carrier})`(120행) 앞에 null 가드.
  3. 제출 시 `carrier === null` 이면 저장하지 않고 피커 아래에 오류 한 줄 "외출할 때 어떻게 데리고 다니는지 골라 주세요" (기존 `submitErrors`/`banner` 패턴을 따른다). 포커스를 피커 첫 옵션으로.
  4. 피커의 `<Label>` "이동 수단" 아래에 보조 문구 "외출할 때 무엇에 넣고 다니나요?" 를 더한다(라벨 자체는 유지).
  5. 저장 타입(`TDogProfile.carrier: TCarrier`)은 **바꾸지 않는다** — `null` 은 폼 안에만 산다.
- 테스트: 생략 — 폼 검증(`parseValidDogs`·`submitRowError`)이 화면 파일(`dogProfilePage.tsx:26-48`) 안에 있다. lib 로 옮기지 않는다(이 태스크 범위 밖).
- 수용 기준: 프로필 없는 상태로 `/dog` → 이름·몸무게만 넣고 저장 → 저장되지 않고 오류 문구가 보인다. 하나 고르면 저장된다. 기존 프로필로 들어가면 원래 값이 선택돼 있다.
- 문서: `docs/features/dog-profile.md` — "이동 수단은 기본값 없이 묻는다(기본값 '없어요' 가 식당 판정을 조용히 뒤집었다)".
- 커밋: `fix - 이동 수단을 미리 고르지 않고 저장 전에 묻는다`

### [x] T1.3 못 가는 곳·개 요금이 아닌 줄에 강아지 이름을 붙이지 않는다

- 근거: 민준 — 어려움 판정인 그리너리빌리지 상세에 "**대장이와 초코** · 청소비 5만원" → 우리가 낼 돈으로 읽었다.
- 읽을 것: `src/lib/dogFee.ts`(100~115행 "곱하지 않을 때" 대체 경로) · `src/lib/eligibility.ts`(275행 부근 `fee` 를 붙이는 곳) · `src/lib/dogFee.test.ts` · `src/data/places.json` 에서 `"그리너리빌리지 펜션"` 의 `petPolicyText`
- 단계:
  1. `eligibility.ts`: 최종 레벨이 `hard` 면 `fee` 를 `undefined` 로 두고, **요금 `info` 근거(`reasons.push({ level: 'info', text: fee })`)도 넣지 않는다** — 상세 카드는 이 근거로 요금을 그린다.
  2. `dogFee.ts` 대체 경로: `` `${names} · …` `` 대신 글자 그대로 `` `원문 요금 · …` `` 으로(이름은 **곱셈이 성립했을 때만** 붙인다 — `multiplyPerDog` 경로는 그대로).
     이 경로는 hard 가 아닌 곳에서도 바뀐다 — 먼저 `grep -n " · " src/lib/dogFee.test.ts src/lib/eligibility.test.ts` 로 `이름 · ` 접두를 기대하는 기존 케이스를 찾아 기대값을 `원문 요금 · ` 으로 고친다(그 외 기대값은 건드리지 않는다).
- 테스트:
  - `dogFee.test.ts`: 그리너리 원문을 `parsePetPolicy` 로 파싱 + 28/17kg 두 마리 → 결과가 `'대장이'` 로 시작하지 않고 `'원문 요금'` 으로 시작.
  - `eligibility.test.ts`: 같은 입력 → `level === 'hard'` · `fee === undefined` · `reasons` 에 요금 `info` 없음.
  - 기존 "이름 넣은 요금 줄" 테스트(예: "보리와 콩이는 6만원 (1마리당 3만원)")는 **그대로 통과해야 한다**.
- 문서: `docs/architecture/pet-policy-and-eligibility.md` 요금 절에 한 줄.
- 커밋: `fix - 곱하지 못한 요금 줄과 어려움 판정에는 강아지 이름을 붙이지 않는다`

### [x] T1.4 C5("대형견 언급이 없어요")를 정보 없음·kg 요금 구간에서 고친다

- 근거: 민준 — ① 원문에 "10kg 이상 4만원" 이 있는데 "대형견 언급이 없어요" ② "정보 없음" 5곳 중 4곳(귤이네·제주블루스·수선화민박·제주애빛 — 맘앤도그는 `largeDogOk`)에서 C5 문구가 unknown 근거보다 먼저 보인다(최종 등급은 이미 `unknown` 이고 **문구만** 틀리다). 07 의 U4(솔숲펜션 문구)와 같은 뿌리라 **여기서 함께 닫는다** — 07 의 U4 줄에 "→ 08 T1.4" 를 적는다.
- 읽을 것: `src/lib/eligibility.ts` 212~225행(`ruleLargeDogUnmentioned`) · 49행 `REASON_ORDER` · `src/lib/petPolicy.ts` 의 `feeLines`·`noInfo` · `eligibility.test.ts`
- 단계:
  1. `ruleLargeDogUnmentioned` 맨 앞에 `if (policy.noInfo) return null;`
  2. `policy.feeLines` 에서 `(\d+)\s*kg\s*이상` 을 찾으면 문구를 `` `${N}kg 이상 요금이 적혀 있어요 — ${maxKg}kg 도 되는지 확인해 주세요` `` 로. 등급은 `cond` 그대로.
  3. `feeLines` 의 kg 구간(패턴 `\d+\s*~\s*(\d+)\s*kg`, N = 구간 상한 중 최댓값 — `6~10kg` 이면 10)만 있고 우리 강아지가 넘으면 `` `요금표가 ${N}kg 까지만 있어요 — 확인해 주세요` `` (07 U4). 등급 `cond` 그대로.
  4. 1·2·3 어디에도 안 걸리면 기존 문구.
- 테스트(`eligibility.test.ts`):
  - `parsePetPolicy('1마리당 3만원. (2마리 또는 10kg 이상 4만원)')` + 28kg → `level === 'cond'`, reasons 에 `'10kg 이상'` 포함, `'언급이 없어요'` 미포함.
  - 정보 없음 원문 `'정보 없음. (문의해보시면 가장 정확할 것 같아요)'`(`places.json` 실제 값) + 28kg → `level === 'unknown'`, reasons 에 `'대형견 언급'` 없음.
  - 솔숲펜션 원문 + 28kg → `'10kg 까지만'` 포함, `level === 'cond'`.
- 수용 기준: `pnpm test` 전체 통과(기존 등급 테스트 무변경).
- 문서: `docs/architecture/pet-policy-and-eligibility.md` 규칙표 C5 행.
- 커밋: `fix - 대형견 문구가 정보 없음·kg 요금 구간을 무시하지 않게 한다`
> 메모: 근거 줄대로 07 의 U4 줄에 "→ 08 T1.4 에서 처리" 를 적고 `[x]` 로 닫았다(단계 목록엔 없던 파일 — T0.3 단계 4 와 겹친다, T0.3 은 확인만 하면 된다).

### [x] T1.5 어려움 근거에 누가 넘는지 이름을 적는다 (H1)

- 근거: 민준 — "15kg 이하 조건" 이 누구 얘기인지 모른다(다두 보호자).
- 읽을 것: `src/lib/eligibility.ts` 92~103행(`ruleWeightOverLimit`) · `dogCallNames`(이름 + 조사 유틸) 위치 · `src/lib/korean.ts`
- 단계: 한도를 넘는 개만 골라 `` `${이름(몸무게)들} 모두/는 ${한도}kg 이하 조건을 넘어요` `` — 한 마리면 "대장이(28kg)는 …", 여럿이면 "대장이(28kg)·초코(17kg) 모두 …". 조사는 `korean.ts` 유틸을 쓴다. 등급 무변경.
- 테스트: 두 마리 다 넘는 경우 · 한 마리만 넘는 경우(텍스트에 넘는 개 이름만) · 한 마리 프로필.
- 문서: 없음(문구만).
- 커밋: `fix - 무게 한도 근거에 한도를 넘는 강아지 이름을 적는다`
> 메모: 「문서: 없음」 이지만 `pet-policy-and-eligibility.md` 규칙표 H1 칸이 옛 문구("{N}kg 이하만 가능해요")를 그대로 인용해, 그 칸만 새 문구로 고쳤다.

### [x] T1.6 "확인" 머리글이 근거와 싸우지 않게 — 야외만(C1)은 "야외 자리에서 갈 수 있어요"

- 근거: 지수 — 머리글 "확인해야 알 수 있어요" 바로 아래 근거 "야외 자리만 가능해요". 같은 cond 가 목록에선 "확인이 필요해요", 상세에선 "확인해야 알 수 있어요"(D12).
- 읽을 것: `src/screens/placeDetailEligibilityCard.tsx`(`HEADLINE` 상수) · `src/lib/eligibility.ts` 의 `TEligibility` 반환형과 C1(168행)
- 단계:
  1. `TReason` 에 선택 필드 `rule?: string` 을 더하고 각 규칙이 자기 ID(`'H1'`, `'C1'` …)를 싣게 한다(RULES 배열 주석의 ID 그대로).
  2. `src/lib/eligibility.ts` 에 순수 함수 `headlineFor(e: TEligibility): string` — `cond` 이고 `level === 'cond'` 인 근거가 **정확히 1개**이며 그 `rule === 'C1'` 이면(요금 `info` 근거는 세지 않는다) `'야외 자리에서 갈 수 있어요'`, 그 외 `cond` 는 `'확인이 필요해요'`(목록 배지와 같은 말로 통일), 나머지는 기존 HEADLINE 값.
  3. `placeDetailEligibilityCard.tsx` 가 `HEADLINE[level]` 대신 `headlineFor` 를 쓴다.
- 테스트: `headlineFor` — C1 단독 / C1+C5 / C6 단독 / ok / hard.
- 문서: `pet-policy-and-eligibility.md` 에 "머리글은 근거가 하나뿐일 때 근거를 따른다" 한 줄.
- 커밋: `fix - 야외만 되는 곳의 머리글이 근거와 반대로 말하지 않게 한다`
> 메모: 규칙 ID 는 규칙 함수마다 적지 않고 `RULES` 를 `[ID, 규칙]` 표로 바꿔 `judgeEligibility` 가 근거에 싣는다(ID 가 표 한 곳에만 있어 어긋날 수 없다). 요금 근거는 `'I1'`. `HEADLINE` 은 `headlineFor` 와 함께 `eligibility.ts` 로 옮겼다. `docs/features/dog-profile.md` 의 옛 머리글 인용("확인해야 알 수 있어요")도 고쳤다.

---

## P0 — 프로세스 정본 정리 (문서만, 코드 무변경)

### [ ] T0.1 트래커 다이어트 — `todo/README.md` 를 Now / Next / Blocked 로

- 근거: S2 — 정본이 서로 모순되고(72행 부근 상태 줄 "feature/naver-map 미push" 는 9/23 머지됨, ⚠️1 "analyze 돌린 적 없다" vs 같은 파일 "첫 analyze 50건"), 머리말 70줄·세션 로그 170줄이 할 일 문서 안에 있다. 가벼운 모델이 틀린 사실로 출발한다.
- 읽을 것: `docs/todo/README.md` 전체 · `git log --oneline -30`
- 단계:
  1. 새 파일 `docs/todo/CHANGELOG.md` — README 의 `> 최종 수정 … 이전 (v24 …) … (v1 …)` 블록을 **글자 그대로** 옮긴다(최신이 위).
  2. 새 파일 `docs/todo/session-log.md` — `## 세션 로그` 절 전체를 그대로 옮긴다.
  3. README 를 다음 뼈대로 다시 쓴다(**150줄 이하**):
     - H1 + `> 최종 수정: 2026-MM-DD (v26: 머리말·세션 로그를 CHANGELOG·session-log 로 분리, 상태 줄을 사실로)` **한 줄** + `> 이력은 [CHANGELOG](CHANGELOG.md)`
     - `## 지금 상태` — 5줄 이하, **각 줄이 사실 한 개**(머지·배포 여부는 `git log origin/main` 로 확인한 것만).
     - `## 문서 목록` — 00~08 한 줄씩(무엇·상태).
     - `## Now` — 지금 누군가 하고 있어야 할 것 ≤5개(담당 `[Claude]`/`[사용자]` 표시).
     - `## Next` — 그다음 ≤7개.
     - `## Blocked-on-user` — 🙋 를 **한 표로** 모은다(07·03 의 것 포함, 링크).
     - `## 목표`·`## 이 계획이 서 있는 결정`·`## 순서와 의존` 은 유지하되 각 절 20줄 이하로.
  4. `## 진행 상태`(120행 부근)와 `## 다음 할 일`(173행 부근, 약 180줄)이 본문의 대부분이다 — 끝난 항목은 지우고(이력은 CHANGELOG·session-log 에 있다), 남은 것만 Now/Next 로 옮긴다. 단계별 상세는 이미 00~07 에 있으니 링크로 대신한다. **이걸 안 하면 150줄이 안 된다.**
  5. 서로 모순되는 줄(상태 줄 · ⚠️1)은 **git 과 문서 본문에서 확인되는 쪽**으로 고친다. 확인이 안 되면 "확인 필요:" 로 적고 단정하지 않는다.
- 수용 기준: `wc -l docs/todo/README.md` ≤ 150 · `grep -n "feature/naver-map" docs/todo/README.md` 가 "미push" 로 읽히지 않는다 · README 에서 CHANGELOG·session-log·00~08 로 가는 링크가 전부 열린다.
- 문서: 이 태스크 자체.
- 커밋: `docs - 트래커를 지금·다음·막힘으로 줄이고 이력·세션 로그를 떼어 낸다`

> 메모: 2026-10-06 대기열 정리 — 「지금·다음·막힘」 의 역할은 [NOW.md](NOW.md)(「지금」·「기다림」)가 맡았다(README 머리말 v42 이 그리로 보낸다). 수용 기준은 아직 아니다 — README 592줄(≤150 아님), CHANGELOG·session-log 분리도 남아 있어 닫지 않는다.

### [ ] T0.2 CONCEPT v3 — 늘어난 범위를 인정하고 성공 기준을 적는다

- 근거: S1·S3 — 「하지 않는 것」 이 "서버·로그인 안 함 · Notion 재추출" 인데 Supabase 원본·`/admin`·블로그 수집이 생겼다. 성공 지표가 한 줄도 없다.
- 읽을 것: `docs/CONCEPT.md` · ADR-015 · ADR-018 첫 화면 · ADR-011·012 머리의 상태 줄
- 단계:
  1. 「하지 않는 것」 갱신: 데이터 원본은 Supabase, 운영자 검수는 앱 안 `/admin`(운영자 로그인만), **사용자 회원·로그인은 여전히 안 한다**, 사용자 화면은 런타임 fetch 없음.
  2. 새 절 `## 성공을 무엇으로 보나` — 측정 도구가 생기기 전까지는 **5명 테스트의 관찰값**으로 본다:
     | 지표 | 뜻 | 지금 볼 수 있나 |
     |---|---|---|
     | 프로필 스스로 등록 | 안내 없이 등록까지 가는가 | 5명 테스트 |
     | 확인 필요 → 다음 행동 | 전화·네이버로 **확인하러** 나가는가, 포기하는가 | 5명 테스트 |
     | 식당 과제 성공 | "애월 점심" 을 앱 안에서 정하는가 | 5명 테스트 |
     | 공유 | 친구에게 보낼 수 있는가 | 5명 테스트 |
  3. ADR-011·012 상태 줄을 "보류 — ADR-015 §3 이 회원을 범위 밖으로 뒀다" 로(본문은 그대로).
- 문서: 이 태스크 자체. `> 최종 수정` 에 v3.
- 커밋: `docs - 컨셉에 늘어난 범위와 성공 기준을 적는다`

### [ ] T0.3 리뷰 → 할 일 추적을 닫는다

- 근거: S4 — 전화번호·검색 리셋이 두 리뷰에 걸쳐 두 번 나왔다. 9/15 반영 현황 표는 9/16 에 멈췄고 없는 `.omc/plans/…` 를 링크한다.
- 읽을 것: `docs/reviews/2026-09-15-design-review.md` 1~30행 · `docs/todo/07-product-and-ux.md`
- 단계:
  1. 9/15 리뷰 「반영 현황」 표의 **미반영** 줄마다 현재 위치를 적는다: 전화번호 → `07 P0`, 타일 그래픽·사진 없이 매력 → `백로그(08 T5)`.
  2. 9행의 `.omc/plans/…` 링크를 "레포 밖 작업 지시서(삭제됨)" 로 평문화.
  3. `docs/reviews/README.md` 신설(10줄 이내): "리뷰마다 맨 위에 `## 반영 현황` 표 — 지적 ID · 상태(반영/이관/기각) · 커밋 또는 todo 링크. 이관한 지적은 todo 쪽에 리뷰 ID 를 적는다."
  4. 07 의 U4 줄에 "→ 08 T1.4 에서 처리" 를 적는다.
- 커밋: `docs - 리뷰 지적이 백로그에서 사라지지 않게 반영 현황을 잇는다`

---

## P1 — 목록·홈이 답을 말하게

### [x] T2.1 목록 카드에 근거 한 줄 — 눌러 보지 않아도 왜 "확인" 인지

- 근거: 민준 N1 — 카드엔 요금·배지만, 왜 cond/hard 인지 7곳을 다 눌러야 안다. "이것만으로 제외 목록 구실을 한다."
- 읽을 것: `src/components/placeCard.tsx`(60행 부근) · 카드가 판정을 받는 prop · `TReason`
- 단계:
  1. `src/lib/eligibility.ts` 에 `primaryReason(e: TEligibility): TReason | undefined` — 최종 레벨과 같은 레벨의 첫 근거. `ok` 면 `undefined`. `unknown` 이고 `info` 근거가 있으면 그 `info`(맘앤도그 "원문에 대형견도 가능" 같은 힌트 — N9).
  2. `placeCard.tsx` 에서 요금 줄 아래 `text-xs text-tertiary line-clamp-1` 로 한 줄.
- 테스트: `primaryReason` — ok / cond(C5) / hard(H1) / unknown+info.
- 확인: 대형견 2마리 프로필로 `/places/stay` — "어려움" 카드에 "대장이(28kg)… 넘어요"(T1.5 후) 류 한 줄이 보인다. 360px 에서 한 줄로 잘린다.
- 커밋: `feat - 목록 카드에 판정 근거 한 줄을 보인다`

### [x] T2.2 홈·목록 숫자를 한 기준으로 — "가능 N · 확인 M"

- 근거: 지수 "6/34 의 6 이 뭐예요?" · 민준 "홈은 7곳, 목록은 26곳?" · D 크리틱 #4 — 홈 카드의 수는 ok+cond 합인데 이름표가 없고, 스크린리더만 "갈 수 있는 곳" 이라 읽는다(과대표기).
- 읽을 것: `src/screens/homePage.tsx`(55행 부근 집계) · `src/screens/homeTypeCard.tsx`(62·69행) · `src/screens/placesPageResults.tsx`(41~53행)
- 단계:
  1. `src/lib/sortByEligibility.ts`(또는 새 `eligibilityCounts.ts`)에 `countByLevel(places, dog): Record<TEligibilityLevel, number>` 순수 함수.
  2. 홈 종류 카드: 프로필이 있으면 "가능 3 · 확인 3" 을 **보이는 글자**로(작은 숫자 두 개), aria-label 도 같은 말. 프로필 없으면 지금처럼 총수.
  3. 목록 머리: 프로필이 있으면 "26곳 · 가능 4 · 확인 3 · 정보 없음 5 · 어려움 14"(0 인 레벨은 뺀다). 없으면 "26곳".
- 테스트: `countByLevel` 한 벌(86곳 × 대형 2마리 → 숙소 ok 4·cond 3·unknown 5·hard 14 — 리뷰 §2 표와 같아야 한다).
- 문서: `docs/features/home-header.md` 에 숫자 기준 한 줄.
- 커밋: `feat - 홈과 목록이 같은 기준으로 가능·확인 수를 보인다`

### [x] T2.3 판정 배지를 속성 배지와 다르게 생기게

- 근거: D1 — "갈 수 있어요" 와 "실내 OK" 가 같은 핑크 알약. 어려움(slate)과 "케이지 필요"(gray)도 구분이 안 된다.
- 읽을 것: `src/components/eligibilityBadge.tsx` · `src/components/petBadges.tsx` · `src/screens/placeDetailEligibilityCard.tsx` 의 레벨 점(dot) 문법 · `src/styles/theme.css` 의 badge 관련 시맨틱 토큰
- 단계:
  1. `EligibilityBadge` 를 상세 카드와 같은 **점(●) + semibold 글자** 문법으로(알약 배경은 유지하되 점을 앞에). 색 매핑(brand=ok · orange=cond · neutral=unknown · slate=hard)은 그대로.
  2. `PetBadges` 의 `ok` 톤을 `gray` + 체크 아이콘으로 내려 **brand 핑크는 판정 전용**으로 남긴다.
  3. `base/` 는 건드리지 않는다 — 두 파일은 이미 `src/components/` 의 래퍼다.
- 확인: `/places/restaurant` 스크린샷에서 판정 배지가 한눈에 먼저 읽힌다. 대비 4.5:1 이상(글자).
- 문서: ADR-003 에 "brand 는 판정 ok 전용" 한 줄.
- 커밋: `style - 판정 배지를 속성 배지와 구분되게 점과 굵기로 그린다`

### [x] T2.4 켜진 조건을 결과 머리에 보인다 — 조용히 걸린 읍면 필터

- 근거: D4 — 읍면은 퍼시스트인데 모바일에서 안 보인다. 홈에서 읍면 칩을 누르면 조용히 걸리고 다음 방문에도 남는다. 카페 탭 "1곳" 의 이유가 "필터1" 뿐.
- 읽을 것: `src/screens/placesPageResults.tsx` · `src/screens/placesPage.tsx`(필터 상태들) · `src/store/useAppStore.ts`(`town`)
- 단계:
  1. 결과 머리(곳 수 줄) 아래에 **켜진 조건 칩 줄**: `애월읍 ✕` · `동쪽 ✕` · `어려운 곳 숨김 ✕` · `"검색어" ✕`. 각 ✕ 는 그 조건만 끈다. 켜진 게 없으면 줄 자체를 안 그린다.
  2. "필터 지우기" 는 검색어만 있을 땐 "검색 지우기", 둘 다 있으면 "모두 지우기"(D12).
  3. "필터1" → "필터 1" (배지 숫자를 칩 모양으로 띄운다).
  4. 칩은 T4.2 의 `FilterChip` 이 생기기 전이면 `placesPageFilters.tsx` 의 기존 칩 스타일을 재사용.
- 확인: 홈에서 애월읍 칩 → `/places/cafe` 에 `애월읍 ✕` 가 보이고, 누르면 26곳으로 돌아온다.
- 커밋: `feat - 켜진 조건을 결과 머리에 칩으로 보이고 하나씩 끌 수 있게 한다`

> 메모: 칩 줄은 `src/screens/placesPageActiveChips.tsx` 로 뗐다(엿보기도 읍면 칩을 같이 그려야 손을 놓을 때 줄이 튀지 않는다). 칩은 `activeFilterCount` 가 세는 것 전부(읍면·방향·반려동물 조건·가격 정렬·어려운 곳 숨김·실내 자리 필요) + 검색어 — 버튼 숫자와 칩 수가 어긋나지 않게. 지우기 문구는 `resetFiltersLabel`(placeFilters.ts). 「확인」 은 홈 카페 카드에 애월읍 칩이 없어(상위 3곳: 구좌·성산·대정) 구좌읍으로 했다 — 9곳 → ✕ → 26곳.

### [x] T2.5 식당이 전부 "어려움" 일 때 이유와 출구를 말한다

- 근거: 지수 — "애월" 식당 3곳이 전부 "어려움 · 케이지 필요" → 네이버로 이탈. 07 P2 의 "이동 수단 what-if" 를 **P1 로 당겨** 여기서 한다(07 해당 줄에 "→ 08 T2.5" 표기).
- 읽을 것: `src/screens/placesPageResults.tsx` · `src/lib/eligibility.ts`(H5·C2) · `src/lib/sortByEligibility.ts`
- 단계:
  1. 순수 함수 `carrierWhatIf(places, dog): { carrier: TCarrier; opened: number } | null` — `dog.carrier === 'none'` 이고 현재 결과 중 `hard` 인 곳을 `carrier: 'bag'` 으로 다시 판정했을 때 `hard` 에서 벗어나는 수. 0 이면 `null`.
  2. 결과 머리 아래 안내 한 줄(프로필·식당 탭일 때만): "이동가방이 있으면 N곳이 '확인 필요' 로 바뀌어요 · 우리 강아지 정보 고치기 ›" → `/dog`.
  3. **준비물 표(`ITEM_NEEDS`)는 건드리지 않는다**(ADR-009).
  4. 배지 라벨 "케이지 필요"(`petPolicy.ts:374`)는 그대로 둔다 — 안내 줄이 뜻을 풀어 준다.
- 테스트: `carrierWhatIf` — none+케이지 필수 식당들 → opened>0 · bag 프로필 → null · 결과 0곳 → null.
- 문서: `pet-policy-and-eligibility.md` 에 "what-if 는 판정을 바꾸지 않고 안내만 한다".
- 커밋: `feat - 이동 수단 때문에 막힌 식당 수를 알려 주고 프로필로 잇는다`

> 메모: `carrierWhatIf` 는 `countByLevel` 옆(`src/lib/eligibilityCounts.ts`)에 두고 `needsIndoor` 도 판정 옵션으로 넘긴다. 안내 줄은 `PlacesPageResults` 안에서 계산해 스와이프 엿보기도 같은 모양이다. 대형견(H4)은 가방이어도 열리는 곳이 없어 줄이 안 뜬다 — 두부(4kg·없음)로 식당 34곳 중 28곳.

---

## P1 — 흐름과 피드백

### [x] T3.1 공유 버튼을 늘 보인다 — Web Share 가 없으면 링크 복사

- 근거: 지수 ⑤ — 카톡 인앱·데스크톱에서 공유 버튼이 **없다**(`placeDetailPage.tsx:28-42` 가 `'share' in navigator` 일 때만 그림). 과제 "친구에게 보내기" 실패.
- 읽을 것: `src/screens/placeDetailPage.tsx` 28~45행과 버튼 렌더부
- 단계:
  1. 버튼은 항상 그린다. 누르면 `navigator.share` 가 있으면 공유, 없으면 `navigator.clipboard.writeText(url)` 후 `role="status"` 로 "링크를 복사했어요" 2초.
  2. 하이드레이션 규칙은 유지 — 버튼 **존재**는 서버·클라 동일(항상 있음), 동작 분기는 클릭 시점에만 `navigator` 를 본다(`useSyncExternalStore` 는 필요 없어지면 지운다).
  3. 공유 `text` 에 판정 한 줄을 붙인다(프로필 있으면 "보리는 갈 수 있어요 · " + features).
  4. 상태 메시지는 **`<main>` 밖**(셸의 포털 또는 `document.body` 포털)에 둔다 — `fixed` 금지 규칙.
- 확인: Playwright(모바일 에뮬레이션, `navigator.share` 없음)로 상세에서 버튼이 보이고 누르면 "복사했어요" 가 뜬다.
- 커밋: `feat - 공유를 못 하는 브라우저에서도 링크 복사로 보낼 수 있게 한다`

> 메모: 상태 메시지는 포털이 아니라 **셸 슬롯**으로 했다 — `AppShell` 이 탭바 옆(`<main>` 밖)에 `AppStatusToast` 를 그리고, 띄우는 쪽은 `lib/appStatus.ts` 의 `showAppStatus` 만 부른다(T3.2·T3.3 이 그대로 쓴다). 단계에 없던 `appShell.tsx` 를 한 줄 고쳤다. 공유 글·갈래는 `lib/placeShare.ts`(`shareTextFor`·`shareMethodOf`) 순수 함수. 문서는 `app-shell-and-state.md` v15.

### [x] T3.2 저장했다는 피드백 — 첫 저장에 토스트

- 근거: 지수·D7 — 하트가 채워지는 것 외 피드백 없음, `/saved` 는 탭에 없다.
- 읽을 것: `src/components/saveButton.tsx` · T3.1 에서 만든 상태 메시지 포털(있으면 재사용)
- 단계:
  1. 저장(해제 아님) 시 "저장했어요 · 저장한 곳 보기 ›" 2.5초(`role="status"`, 링크 `/saved`). 같은 세션에서 3번째 저장부터는 띄우지 않는다(모듈 변수 카운터 — 퍼시스트하지 않는다).
  2. 접근성 동시 수정(D9): `aria-label` 은 `${name} 저장` 으로 **고정**, 상태는 `aria-pressed` 만.
- 커밋: `feat - 저장하면 알려 주고 저장한 곳으로 잇는다`

> 메모: T3.1 의 셸 상태 줄(`showAppStatus`)을 그대로 쓴다. 세션 카운터는 `lib/appStatus.ts` 의 `createFirstTimesGate(2)`(테스트 있음) — 해제는 세지 않는다. 문구는 "저장했어요" + 링크 "저장한 곳 보기 ›".

### [x] T3.3 프로필 저장 뒤 보던 곳으로 돌아간다

- 근거: D3 — 상세의 "등록하면…" → 저장 → 무조건 홈. 보던 장소를 잃고, 뒤로가기는 폼으로.
- 읽을 것: `src/screens/dogProfilePage.tsx`(121행 저장 후 이동) · `src/lib/appHistory.ts` · `src/lib/appRoutes.ts`(`parentRouteOf`)
- 단계:
  1. 앱 안 이동으로 들어왔으면(`appHistory` 에 이전 항목이 있으면) `router.back()`, 아니면(딥링크) `router.replace(parentRouteOf('/dog'))`.
  2. 도착 화면 알림 "보리 기준으로 바꿨어요"(`role="status"`, T3.1 포털 재사용).
- 확인: `/place/<id>` → 등록 링크 → 저장 → 같은 상세로 돌아오고 판정 카드가 채워져 있다. 뒤로가기가 폼으로 가지 않는다.
- 커밋: `fix - 강아지 정보를 저장하면 보던 화면으로 돌아간다`

> 메모: 딥링크 쪽은 `AppBar` 와 같이 `markReplacedNavigation()` 뒤 `replace` — 깊이가 늘지 않게. 알림 문구는 `dogProfileSavedMessage`(lib/dogProfile.ts, 애칭 규칙). 「확인」: 숙소 목록 → 솔숲펜션 → 등록 → 저장 → 같은 상세, "보리는 갈 수 있어요" 카드 · 브라우저 뒤로 → `/places/stay/`(폼 아님) · `/dog` 딥링크 저장 → `/settings/`. 문서는 `dog-profile.md` v6.

### [x] T3.4 `/places` 를 살린다

- 근거: D5 · 지수 N11 — `/places` 는 404 인데 404 화면에서 둘러보기 탭에 불이 들어온다.
- 읽을 것: `src/app/places/[type]/page.tsx` · `src/components/layout/navItems.ts`(28행 `isActive`) · `src/screens/notFoundPage.tsx` · `next.config.mjs`(정적 내보내기)
- 단계:
  1. `src/app/places/page.tsx` — 클라이언트에서 `router.replace('/places/stay')` + 즉시 보이는 링크 "둘러보기로 가기" 폴백(정적 내보내기라 서버 리다이렉트 없음). `vercel.json` 은 건드리지 않는다.
  2. `navItems.ts` 의 둘러보기 `isActive` 를 `path.startsWith('/places/')` 로.
  3. `notFoundPage.tsx` 문구 "주소를 다시 확인해 주세요" → "찾는 화면이 없어요" + "홈으로" · "둘러보기로" 두 버튼.
- 확인: `pnpm build` 후 `out/places/index.html`(또는 `out/places.html`) 이 생겼는지 · dev 에서 `/places` 가 `/places/stay/` 로 간다.
- 커밋: `fix - /places 주소를 둘러보기로 보내고 404 에 출구를 둔다`

> 메모: CLAUDE.md 규칙(화면 본체는 `src/screens/`)대로 `app/places/page.tsx` 는 메타만, 리다이렉트·폴백 링크는 `src/screens/placesIndexPage.tsx` 로 뗐다. 404 설명은 "주소가 바뀌었거나 없어진 곳일 수 있어요." 로 남겼다. `navItems.test.ts` 추가(`/placesX` 에서 불 꺼짐). 「확인」: 빌드 후 `out/places/index.html` 있음(폴백 링크 포함) · dev `/places` → `/places/stay/` · `/placesX` 에서 켜진 탭 0개. 문서는 `app-shell-and-state.md` v17.

---

## P2 — 정밀화

### [x] T4.1 경고 글자 대비 — "챙길 것" 박스를 4.5:1 로

- 근거: D2 — yellow-600 on yellow-50 ≈ 2.9:1, 팔레트 밖 Tailwind 기본 yellow.
- 읽을 것: `src/styles/theme.css` 의 `--color-text-warning-primary`·`--color-fg-warning-primary` 매핑 · `src/components/missingItemsNote.tsx`
- 단계: `theme.css` 에서 두 토큰을 한 단계 진한 값(또는 cond 배지가 쓰는 앰버/오렌지 계열)으로 재매핑. 컴포넌트 클래스는 그대로.
- 확인: 대비 계산(배경·글자 hex 로 WCAG 식) 4.5:1 이상을 커밋 메시지 본문에 적는다. warning 토큰을 쓰는 다른 곳(`grep -rn "warning-primary" src`)도 눈으로 본다.
- 문서: ADR-003 팔레트 표에 한 줄.
- 커밋: `style - 경고 글자 대비를 4.5:1 로 올린다`

### [x] T4.2 "켜짐" 스타일을 하나로 — `FilterChip`

- 근거: D6 — 칩은 brand-solid, "어려운 곳 숨기기" 는 워시. 토글 파일 주석의 규칙과도 어긋난다.
- 읽을 것: `src/screens/placesPageFilters.tsx`(101·119·153행) · `src/screens/placesPageEligibilityToggles.tsx` 주석 · `src/screens/placeDetailNearby.tsx`(57행)
- 단계: `src/components/filterChip.tsx` 신설(`pressed` prop, 켜짐 = `bg-brand-primary text-brand-secondary border-brand`, 44px). 위 세 곳을 이걸로. 지도 칩은 제외(T4.3).
- 커밋: `refactor - 필터 칩의 켜짐 모양을 FilterChip 하나로 모은다`

> 메모: T2.4 의 `placesPageActiveChips.tsx`(켜진 조건 ✕ 줄)도 옮겼다 — 켜진 모양만 빌리고 `aria-pressed` 는 달지 않는 `toggle={false}`. 꺼짐도 같은 두께 테두리(`border-primary`)라 켜질 때 폭이 안 흔들린다. `filterChip.test.tsx`(renderToStaticMarkup) 추가. 문서 줄이 없어 문서는 그대로 — ADR-003 v5 "켜짐은 워시" 에 코드가 맞춰진 것.

### [x] T4.3 지도 종류 칩이 켜져도 종류 색을 잃지 않게

- 근거: D8
- 읽을 것: `src/screens/mapPage.tsx` 294~303행 · `src/lib/places.ts` 의 `TYPE_COLOR` · `theme.css` 종류 색
- 단계: 켜진 칩에서도 흰 원 안에 종류 색 점을 유지. **색 값은 새로 만들지 않는다**(두 곳 동기화 규칙).
- 커밋: `style - 지도 종류 칩이 켜져도 종류 색 점을 남긴다`

> 메모: 켜짐은 흰 원(`bg-primary`, size-3.5) 안에 `TYPE_COLOR` 점, 꺼짐도 같은 자리를 차지한다. 「확인」: dev 390×844 에서 칩 셋의 켜짐/꺼짐 모양을 봤다 — 샌드박스에선 네이버 지도 인증이 안 돼 지도 캔버스·핀은 못 봤다.

### [x] T4.4 필터 시트에 결과 수 버튼

- 근거: D7 — 시트가 목록을 덮어 즉시 반영이 안 느껴진다.
- 읽을 것: `src/screens/placesPageFilterSheet.tsx`
- 단계: 시트 하단 고정 줄에 주 버튼 "N곳 보기"(누르면 닫기만) + 보조 "모두 지우기". 즉시 반영 설계는 그대로. 시트 하단 고정은 시트 내부 sticky 로(`fixed` 금지).
- 커밋: `feat - 필터 시트에 지금 결과 수를 보이는 닫기 버튼을 둔다`

> 메모: 하단 줄은 `sticky` 대신 이미 있던 세로 flex 의 마지막 칸(스크롤 줄 밖, BUG-003 구조)에 뒀다 — 효과가 같고 `fixed` 도 아니다. 숫자는 `results.length`(검색어 포함, 목록 머리 숫자와 같다). 보조 "모두 지우기" 는 켜진 조건이 있을 때만 보인다(예전 "필터 모두 지우기" 를 옮김). 「확인」: 식당 시트 "34곳 보기" → 동쪽 켜면 "15곳 보기" + "모두 지우기".

### [x] T4.5 몸무게 칸에 보이는 라벨과 kg 접미

- 근거: D11
- 읽을 것: `src/screens/dogProfileDogRows.tsx`(41·57행) · `src/components/base/input.tsx` 의 prop(수정 금지, 읽기만)
- 단계: 칸 위에 보이는 라벨 "이름"·"몸무게". 몸무게 칸 오른쪽에 고정 "kg" (base Input 이 접미를 지원하면 prop, 아니면 감싸는 래퍼에서 absolute 텍스트).
- 커밋: `style - 몸무게 칸에 라벨과 kg 단위를 늘 보인다`

> 메모: base Input 에 접미 prop 이 없어 감싸개에서 absolute "kg"(에러 아이콘이 뜨면 그 왼쪽으로 비킨다). 라벨은 Input 의 `label` prop + aria-label 은 "N번째 강아지" 만 — 읽히는 이름이 "1번째 강아지 이름/몸무게" 가 된다. 자리표시 글자는 "kg" → "예: 7". 칸 위 라벨 때문에 ✕ 가 라벨 줄에 서서 빈 라벨 줄을 받쳐 입력 칸 높이에 맞췄다. 데스크톱 숫자 스피너는 kg 와 겹쳐 숨겼다. 「확인」: `/dog` 두 마리·몸무게 0 에러 상태를 390×844 로 봤다.

### [x] T4.6 문구 정리 — 내부어·띄어쓰기

- 근거: D12
- 읽을 것: `src/screens/placeDetailEligibilityCard.tsx`(52행) · `src/screens/dogProfileSizeOverride.tsx`(39~41행) · `grep -rn "판정" src/screens src/components --include=*.tsx` 의 **사용자에게 보이는 문자열만**
- 단계:
  - "우리 강아지를 등록하면 여기서 바로 판정을 볼 수 있어요" → "우리 강아지를 등록하면 여기서 갈 수 있는지 바로 알려 드려요"
  - "크기 수정 — 자동 계산: 소형견" → "크기: 소형견(몸무게로 정했어요) · 바꾸기"
  - 화면 문자열의 "판정" → "갈 수 있는지"/"우리 강아지 기준" 등 문맥에 맞게. 주석·변수명은 그대로.
- 커밋: `style - 화면 문구에서 내부 용어를 걷어 낸다`

> 메모: 화면 문자열의 "판정" 은 상세 배너 하나뿐이었다(나머지는 주석). 크기 접힘은 직접 고른 값이 있으면 "크기: 중형견(직접 골랐어요)" — 몸무게 값을 계속 보이면 고친 게 안 먹은 것처럼 읽혀서. 같은 접힘 안의 "자동 계산값 사용"·"자동 계산으로 되돌리기" 도 "몸무게로 정한 크기 쓰기/로 되돌리기" 로 맞췄다. 문서 줄은 없지만 `dog-profile.md` 가 옛 배너 문구를 인용하고 있어 v7 로 고쳤다.

### [x] T4.7 스와이프 일방통행을 푼다

- 근거: D10 — 홈 → 지도는 밀리는데 지도에서는 스와이프가 시작 안 된다.
- 읽을 것: [ADR-014](../decisions/ADR-014-shell-owned-swipe-pager.md) · `src/lib/appRoutes.ts:82`(`canStartSwipeAt(pathname)` — 지금은 경로만 받는다) · `src/components/layout/appShellSwipe.ts`(218행 부근 `if (event.clientX < BACK_SWIPE_EDGE_PX) return;`) · `src/lib/swipePager.ts:65`(`BACK_SWIPE_EDGE_PX = 24` — **iOS 뒤로가기 제스처와 겹치지 않게 왼쪽 24px 는 일부러 막혀 있다**) · `appRoutes.test.ts`(110행 부근 `/map` false 케이스)
- 단계:
  1. `canStartSwipeAt(pathname, clientX, viewportWidth)` 로 바꾼다. `/map` 은 `24 < x < 48`(왼쪽 iOS 뒤로가기 띠를 피한 두 번째 띠) 또는 `x > viewportWidth - 24`(오른쪽 끝)에서만 참. 다른 경로는 기존과 같다.
  2. `appShellSwipe.ts` 의 pointerdown 에서 새 시그니처로 호출. 왼쪽 24px 가드는 그대로 둔다.
  3. `appRoutes.test.ts` 의 `/map` 케이스를 좌표별로 갈라 고친다(가운데 false · 30px true · 오른쪽 끝 true · 10px false). 주석의 "카카오" 는 "네이버" 로.
- 확인: 모바일 에뮬레이션에서 지도 오른쪽 끝 → 왼쪽 끌기로 다음 탭, 왼쪽 30px → 오른쪽 끌기로 이전 탭.
- 문서: ADR-014 에 한 줄(지도 가장자리 예외).
- 커밋: `feat - 지도 화면 가장자리에서도 좌우로 넘길 수 있게 한다`

> 메모: 옛 `canStartSwipeAt(path)` 가 하던 두 일(핸들러를 달지·`touch-action: pan-y` 를 걸지)을 `hasSwipeSurface`·`takesHorizontalPan` 으로 떼었다 — 지도엔 핸들러는 달되 pan-y 는 여전히 안 건다. 「확인」: 390×844 모바일 에뮬레이션(CDP 터치)에서 지도 가운데 ← 는 그대로 · 오른쪽 끝 ← → `/places/stay/` · 왼쪽 30px → → `/` · 왼쪽 10px 는 셸이 안 받음(브라우저 뒤로가기 몫). 샌드박스에선 네이버 지도 캔버스가 안 떠 **실제 지도 끌기와 가장자리 띠가 겹칠 때**는 못 봤다 — 실기기 확인 필요.

### [x] T4.8 준비물의 기내용 가방 ↔ 프로필 이동 수단을 한 번 잇는다

- 근거: 지수 N5 — 준비물에서 "기내용 가방" 을 체크했는데 프로필은 `none` 이라 식당 판정이 그대로다.
- 읽을 것: `src/screens/checklistPageItemRow.tsx`(props: `item, checked, provided, expanded, onToggleChecked, onToggleExpanded` — 강아지 정보가 없다) · 부모 `src/screens/checklistPageGroupList.tsx` · `src/lib/places.ts` 의 `ITEMS`(items.json 의 "(5kg 이하)"·"(5kg 이상)" 두 줄을 이름 `강아지 기내용 가방` 하나로 합친다) · `src/store/useAppStore.ts`(`dog`, `setDog`) · ADR-009
- 단계: 항목은 `item.name === '강아지 기내용 가방'` 으로 찾는다(id 로 찾지 않는다). 행 안에서 스토어의 `dog`·`setDog` 를 읽는다. 그 항목을 **체크하는 순간** `dog?.carrier === 'none'` 이면 행 아래에 한 번 "우리 강아지 이동 수단도 '이동가방' 으로 바꿀까요? [바꾸기] [괜찮아요]". [바꾸기] → `setDog({...dog, carrier: 'bag'})`. 판정 로직·`ITEM_NEEDS` 무변경.
- 문서: `docs/features/checklist.md` — "준비물이 프로필을 바꾸자고 **묻기만** 한다(ADR-009 의 반대 방향은 여전히 금지)".
- 커밋: `feat - 준비물에서 가방을 챙기면 프로필 이동 수단도 바꿀지 묻는다`

> 메모: `items.json` 두 줄은 이미 `ITEM_VARIANTS` 로 `강아지 기내용 가방` 하나로 합쳐져 있어 데이터는 안 건드렸다. 조건은 `lib/checklist.ts` 의 `shouldAskCarrierBag`(테스트 6개). [바꾸기] 뒤 셸 상태 줄 "이동 수단을 이동가방으로 바꿨어요"(T3.1 포털). `ITEM_NEEDS`·판정 로직 무변경. 「확인」: `/checklist` 에서 carrier none 프로필로 체크 → 물음 → [바꾸기] 후 localStorage carrier = bag.

---

## P2 — 프로세스 부채

### [x] T0.4 문서 정책 충돌 해소

> 메모: 2026-10-10 — `.mdc` 머리 문단을 "동작·설계·기능이 바뀌면 · 리팩토링·스타일·오타·한 줄·테스트만은 건너뛴다" 로. 표는 그대로

- 근거: S8 — CLAUDE.md "동작·설계·기능이 바뀔 때만" vs `.cursor/rules/docs-update-policy.mdc:8` "src·scripts 를 수정한 즉시". docs 커밋 39% 의 한 원인.
- 단계: `.mdc` 8~9행을 CLAUDE.md 기준으로 — "`src/`·`scripts/` 수정이 **동작·설계·기능**을 바꾸면 같은 작업에서 docs 를 고친다. 리팩토링·스타일·오타·테스트만 추가는 건너뛴다." 표는 그대로.
- 커밋: `docs - 문서 갱신 정책을 CLAUDE.md 기준 하나로 맞춘다`

### [ ] T0.5 실제 사용자 5명 테스트 키트

- 근거: S1 — 이번 리뷰도 AI 가 연기한 사용자다. 07 P0 의 5명 테스트가 "반나절" 인데 키트가 없어 시작되지 않는다.
- 단계: `docs/reviews/templates/user-test.md` 신설 —
  1. 모집 조건 표(소형 2 · 중형 1 · 대형 2, 제주 여행 계획 있음/최근 다녀옴)
  2. 진행 대본(인사 → 생각 소리 내기 설명 → 과제 3개 → 사후 질문 3개), 각 과제의 **성공 정의**:
     ① "이번 주말 애월에서 강아지랑 점심 먹을 곳 찾기" — 앱 안에서 한 곳을 고름
     ② "숙소 하나 저장하고 준비물 보기" — `/checklist` 도달
     ③ "친구에게 이 숙소 보내기" — 링크가 앱 밖으로 나감
  3. 관찰표(참가자 × 과제: 성공/도움받아 성공/실패 · 걸린 시간 · 멈춘 화면 · 앱 밖으로 나간 순간 · 한 말 인용)
  4. 결과 문서 뼈대(`docs/reviews/YYYY-MM-DD-user-test.md`) — 맨 위 「반영 현황」 표 포함(T0.3 규칙).
  5. 이 페르소나 리뷰의 가설 목록(검증할 것): 이동 수단 기본값 · "케이지 필요" 해석 · 공유 버튼 · 홈 숫자 해석.
- 07 P0 의 5명 테스트 줄에 "키트: `reviews/templates/user-test.md`" 링크.
- 커밋: `docs - 실제 사용자 5명 테스트 키트를 만든다`

### [ ] T0.6 미push 경고를 사람 기억에서 훅으로

- 근거: S5 — "미push 커밋 N개" 가 하루 세 번. 트래커에 적어 두는 것으로는 막히지 않았다.
- 읽을 것: `.claude/settings.json`(있다 — 기존 `permissions.deny` 는 **한 글자도 건드리지 않는다**)
- 단계:
  1. 새 디렉터리 `scripts/dev/` 를 만들고 `scripts/dev/warn-unpushed.sh`(실행 권한) — `git rev-parse --abbrev-ref @{u}` 가 있으면 `git log --oneline @{u}..HEAD | wc -l` 이 0 이 아닐 때 `⚠️ push 안 된 커밋 N개` 를 stderr 로. 항상 exit 0(작업을 막지 않는다). 업스트림이 없으면 조용히 exit 0.
  2. `.claude/settings.json` 의 `hooks` 에 `Stop` 훅으로 이 스크립트를 건다(기존 키 보존, JSON 병합).
  3. 트래커(T0.1 이후 README)에서 "잠그기 전 `git log origin/main..HEAD` 확인" 류 문단을 지우고 "훅이 경고한다" 한 줄로.
- 확인: 로컬 커밋 하나 만든 상태에서 스크립트 직접 실행 → 경고 한 줄, exit 0.
- 커밋: `chore - 세션이 끝날 때 push 안 된 커밋을 경고한다`

### [ ] T0.7 ADR 머리를 "지금의 결정" 으로 — ADR-008 부터

- 근거: S6 — ADR-008 428줄·v14, 지금의 결정을 읽으려면 판 14개를 헤친다.
- 읽을 것: `docs/decisions/ADR-008-map-provider.md` 전체
- 단계:
  1. H1 아래를 `> 최종 수정` **한 줄** + `## 지금의 결정`(5줄 이하, 현재 유효한 것만)로.
  2. 기존 `> 이전 (v…)` 줄들은 파일 끝 `## 이력` 절로 **그대로** 옮긴다. 본문 결정 내용은 지우지 않는다.
  3. `.cursor/rules/docs-update-policy.mdc` 에 규칙 한 줄: "ADR 은 머리에 `## 지금의 결정`, 판 이력은 파일 끝 `## 이력`".
  4. ADR-016·ADR-010 은 이 태스크에서 하지 않는다(다음 태스크로 복제).
- 커밋: `docs - ADR-008 머리를 지금의 결정으로 바꾸고 이력을 끝으로 옮긴다`

### [ ] T0.8 `/next` 커밋이 세션끼리 섞이지 않게
- 근거: 스킬은 "경로를 지정해 `git add`" 라 하는데 인덱스는 작업 트리 하나에 하나다 — add 와 commit 사이 틈에 다른 세션의 `git commit` 이 내 스테이징까지 싣는다(09 T6.9 의 대부분이 남의 `d3ecd38` 에 실렸고, 남의 hunk 가 섞인 파일은 그 세션이 덮어써 빠졌다 → `88fd0b2`).
- 단계: `.claude/skills/next/SKILL.md` 의 커밋 줄을 `git add <새 파일> && git commit -- <경로>` **한 명령**으로(pathspec 커밋은 인덱스의 다른 것을 안 싣는다). 남의 hunk 가 섞인 파일은 `GIT_INDEX_FILE=<scratch>` 개인 인덱스(`read-tree HEAD` → `update-index --cacheinfo` → commit → 공유 인덱스는 `git reset -q -- <경로>`).
- 커밋: `docs(next) - 커밋은 pathspec 한 명령으로 — 공유 인덱스에서 남의 커밋에 실리지 않게`

### [ ] T0.9 `pnpm lint` 가 `claim.mjs` 때문에 빨갛다
- 근거: `.claude/skills/next/claim.mjs:44,84` 의 빈 `catch {}`(`no-empty`) 두 개로 exit 1 — src 는 깨끗한데 린트 전체가 실패라 진짜 실패가 묻힌다.
- 단계: 빈 catch 에 이유 주석 한 줄씩(잠금 해제 실패·파일 없음은 무시해도 되는 까닭). eslint 범위에서 `.claude/` 를 빼지는 않는다 — 훅·스킬 스크립트도 린트를 받는 편이 낫다.
- 커밋: `chore(next) - claim.mjs 빈 catch 에 이유 — pnpm lint 를 초록으로`

---

## P3 — 나중에 (설계가 먼저, Sonnet 단독 실행 금지)

- [ ] T5.1 **요금 단위** — "6만원" 이 1박인지 숙박 전체인지. 원문에 "1박·박당" 이 없으면 "(1박 기준인지는 원문에 없어요)" 를 붙이는 문구 쪽은 S 크기지만, `feeUnit` 데이터 칸(운영자 입력)은 스키마·`/admin`·`data:pull` 이 함께 움직인다 → Opus 설계 후.
  > 메모: 2026-10-07 문구 쪽 끝 — `feeUnitNote`(`dogFee.ts`)가 상세 요금 줄 밑에 "1박 기준인지는 원문에 없어요"(호텔 핀코 붙음 · 그리너리 "숙박일 관계없이" 안 붙음, 실측). 카드엔 안 붙인다(숙소 15/16 이라 소음). **`feeUnit` 데이터 칸은 남았다** — 그래서 `[ ]` 그대로.
- [ ] T5.2 **이동 방식(비행기/배)** 입력 — 배면 준비물의 "기내용 가방" 을 **접는다**(빼는 쪽 — ADR-009 준수). 퍼시스트 필드가 늘어 `useAppStore` `merge` 와 함께.
- [x] T5.3 어려움 곳을 목록 끝에 **접기**("어려움 14곳 보기") — 프로필이 있을 때 기본. `hideHard` 와의 관계를 정해야 한다.
  > 메모(2026-10-08): 들어갔다 — `placesPageHardFold`(순수) + `PlacesPageResults` 끝의 "어려움 N곳 보기/접기"(aria-expanded). 엿보기도 같은 컴포넌트라 늘 접힌 채로 같은 모양. **`hideHard` 와의 관계(권고로 정함)**: 숨기기는 조건(칩·곳 수·빈 상태), 접기는 기본 보기(머리 곳 수 그대로) — 숨기기를 켜면 접을 것이 없다. 전부 어려우면 접지 않는다(빈 목록 위 버튼 하나가 되므로, T2.5 상자가 말한다). 가까운 순·가격순에서도 어려운 곳은 끝으로 간다. 실측(콩이 25kg, 식당): 34곳 · 가능 3 · 확인 필요 3 · 어려움 28 → 카드 6 + 접힘 28, 숨기기 켜면 접기 줄 없음. 토글을 없앨지는 NOW 「기다림」 🙋
- [ ] T5.4 저장 목록을 방향(동/서)으로 묶고 네이버 길찾기로 보내기 — 07 P3 「여행 단위」 와 합친다.
- [ ] T5.5 다크모드 — `theme.css` 프리미티브만 덮는 방식(ADR-003 방침). 밤 사용 비중을 5명 테스트에서 먼저 묻는다.
- [ ] T5.6 데스크톱 2열(07 U10 과 합침) — 상세는 판정 카드 + CTA 를 오른쪽 sticky 열로.
  > 메모(2026-10-08): 앞 절반(둘러보기 목록 2열·칩 줄바꿈)은 07 U10 으로 끝났다. 남은 것은 상세의 오른쪽 sticky 열
- [x] T5.7 다두 프로필에서 이동 수단·크기 수정이 프로필 전체에 하나뿐 — 문구로 "가장 큰 아이 기준으로 봐요" 만 먼저(S), 마리별 모델은 설계 후.
  > 메모(2026-10-06): 문구만 — 몸무게를 정한 아이가 둘 이상이면 크기 접힘 머리가 "크기: 중형견(가장 큰 아이 기준으로 봐요)"(`DogProfileSizeOverride` 의 `multiDog`). 직접 고른 크기는 그대로 "(직접 골랐어요)". 근거는 ux-eval 2026-10-06 junhyuk(콩 2.5kg + 해피 → 중형견). 마리별 크기 표시·"이번 여행엔 OO만" 은 [14](14-weekly-ux-eval.md) ↪ 줄 그대로 설계 뒤
- [x] T5.8 dev 콘솔의 404 리소스 — 다음 캡처 때 `page.on('response', r => r.status() === 404 && console.log(r.url()))` 로 URL 을 받아 확정. 프로덕션 영향 미확인.
  > 메모(2026-10-07): **`/favicon.ico` 다**(r1-first-visit 이 적은 것과 같다). 12개 경로(홈·둘러보기·지도·준비물·저장·설정·등록·상세·/admin)를 390px 로 돌며 4xx 를 모두 받았더니 dev(7727)·프로덕션 모두 **앱 리소스 404 는 0건** — 페이지는 `layout.tsx` 의 `icons` 로 `/icons/icon-192.png` 를 선언해 그쪽을 쓴다. 콘솔 404 는 `<link rel="icon">` 이 없는 문서(`/manifest.webmanifest` 를 직접 연 탭)에서만 하나 났고, 그때 브라우저가 관례 경로 `/favicon.ico` 를 찾는다(`page.on('response')` 엔 안 잡히는 브라우저 요청이라 curl 로 확인: dev·`zgnn.vercel.app` 둘 다 404, `/apple-touch-icon.png` 도 404). 사용자 화면 영향 없음. 파일을 둘지는 T5.9
- [x] T5.9 관례 경로 아이콘 두기 — `/favicon.ico`·`/apple-touch-icon.png` 가 404(T5.8). 탭 아이콘은 선언된 PNG 로 이미 뜨므로 **잡음 줄이기**뿐이다: 링크를 안 읽는 클라이언트(일부 크롤러·북마크·Safari 기록)용. `pnpm icons` 가 두 파일도 만들게 하고 `public/` 루트에 둔다 — 지우면 안 되는 프리캐시 목록(`next.config.mjs` 의 `additionalPrecacheEntries`)에는 넣지 않아도 된다
  > 메모(2026-10-07): `pnpm icons`(`scripts/make-icons.mjs`)가 `public/favicon.ico`(PNG 를 담은 ICO, 16·32px — sharp 가 ICO 를 못 써서 봉투만 손으로)와 `public/apple-touch-icon.png`(180px)를 더 쓴다. 기존 4장은 바이트 그대로. dev 에서 두 경로 200 확인. 프리캐시 목록은 손대지 않았다

## 🧑 사람 손 (에이전트가 할 수 없는 것)

| # | 무엇 | 왜 사람인가 |
|---|---|---|
| H.1 | **실제 5명 테스트** 진행(T0.5 키트) — 결과로 이 문서의 P1 이하 순서를 다시 매긴다 | 사람이 필요하다 |
| H.2 | 요호르기 스테이 좌표·주소 채우기(서쪽 "가능" 숙소 2곳 중 1곳이 지도에서 빠진다) — `/admin` 또는 DB 후 재빌드 | 데이터 원본이 Supabase — `data:*` 는 사용자 터미널 몫(ADR-016) |
| H.3 | 숙소 "정보 없음" 5곳 조건 채우기(07 P2 와 같은 항목) — 민준 기준 서쪽 선택지가 2 → 4 | 같음 |
| H.4 | 07 의 🙋 두 줄(제보를 어디로 · 측정) | 외부 서비스 계정·개인정보 판단 |

## 07 과의 관계

| 07 항목 | 08 에서 |
|---|---|
| P0 전화 버튼 · 카테고리 제보 | 가져오지 않는다 — 07 그대로(데이터·결정이 걸려 있다) |
| P0 5명 테스트 | **T0.5 가 키트**, 진행은 H.1 |
| P1 홈 첫 화면(U2) | T2.2 가 숫자 부분만. 인사말 접기는 07 에 남는다 |
| P1 탭 간 필터 유지(U3) | 07 그대로. T2.4 는 **켜진 것을 보이는** 쪽이라 겹치지 않는다 — 둘 다 할 때 T2.4 를 먼저 |
| P2 what-if | **T2.5 로 당겼다** |
| P2 문구 U4 | **T1.4 에서 닫는다** |
| P2 배지 U5 · 준비물 진행률 U6 · 지도 필터 U7 · 읍면 U8 · 설치 U9 | 07 그대로 |
| P3 여행 단위 · 데스크톱 | T5.4 · T5.6 에서 합친다 |

### [ ] T0.10 로컬 `vercel build --prod` 가 설치에서 멈춘다

- 로컬 `vercel build --prod`(CLAUDE.md 가 말하는 배포 설정 검증)가 설치에서 멈춘다 — 로컬 pnpm 12.8 이 `package.json` 의 `pnpm.onlyBuiltDependencies` 를 안 읽어 `ERR_PNPM_IGNORED_BUILDS`(esbuild·unrs-resolver). `npm_config_strict_dep_builds=false` 로도 안 풀린다. Vercel 은 pnpm 10 이라 배포는 무관. 설정을 `pnpm-workspace.yaml`(`allowBuilds`)로 옮길지 — 출처: todo/20 T6
