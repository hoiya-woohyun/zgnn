# 21. 블로그 문장이 사이트에 그대로 나가지 않게 · 추출 모델을 Sonnet 으로

> 최종 수정: 2026-10-12 (v1: 신설 — 2026-10-12 세션의 실측 셋(블로그 문장 베낌 · Opus↔Sonnet 비교 · 원문 대조가 맞는 요금을 지움)과 사용자 결정 둘(B · Sonnet)을 태스크로)

**한 줄:** 조건 원문(`petPolicyText`)은 블로그 문장을 **글자 그대로** 옮기도록 설계돼 있고(원문 대조의 대조군), 그 문장이 공개 상세 화면에 그대로 나간다.
원문은 대조군으로만 남기고, 사이트에는 **판단(`petPolicy`)에서 만든 문장 + 가드를 거친 notes 한 줄 + 출처 글 링크**를 보인다(B).
같은 세션의 모델 비교로 추출은 Sonnet 으로 바꾸고(교차점검·제안은 Opus 고정), 비교 중에 찾은 모델과 무관한 결함(원문 대조가 맞는 요금을 지움)을 고친다.

규약은 [15](15-ops-dashboard.md)·[20](20-vercel-remote-worker.md) 와 같다 — 한 태스크 = 한 커밋, 태스크마다 파일·수용 기준·검증. `🧑` 는 사용자 터미널 몫, `🙋` 는 사용자가 정할 것.
**각 태스크의 「끝나면」 이 NOW 「지금」 에 다음 줄을 넣는다** — 처음엔 서로 파일이 겹치지 않는 넷(G1 · M1 · S1 · S2)만 올려 세션 여럿이 동시에 집어도 된다.

## 근거 — 2026-10-12 실측

원자료(본문·모델 응답·비교표)는 이 머신의 `data/raw/eval/model-compare/`(gitignored)에 있다 — 결론은 `04-결론.md`.

### 블로그 문장을 그대로 옮기는 정도

| 칸 | 본문 그대로(8자+ 연속 일치로 덮인 글자) | 어디에 보이나 |
|---|---|---|
| 조건 원문 `petPolicyText` | 95~97% — **설계**(`extractPlaces.mjs:220` "본문 문장을 거의 그대로", `proposePlaces.mjs:75` "원문 표현을 살려") | **공개 상세**(`placeDetailPage.tsx:57-66`) |
| 근거 인용 `evidence` | 100% — 설계 | `/admin` 만 |
| 소개 `features` | 평균 16~21%(해요체로 어미가 바뀌어 끊기므로 하한), 절반 이상 옮긴 곳 대기 표본의 15% | 공개 카드·상세·지도 시트 |

- **식약처 명단글**(`mialove89` 글 5편 → 대기 후보 **137건**): 본문은 상호 나열뿐이라 소개가 전부 "식약처 반려동물 동반 가능 업소 현황에 … 올라 있는 ○○이에요". 소개 칸 지시에 "없으면 null" 출구가 없다. **Sonnet 도 똑같이 쓴다** — 모델이 아니라 프롬프트 문제.
- 업주 블로그(`jejuangelhouse` 글 324편 → 후보 111건)는 소개가 거의 한 문장 — 베낌보다 업주 블로그 문제(13 §5.3 묶음 종합 · `singlePlaceBlogs`).
- 예: 일기초록 — 사이트 값 "반려동물동반가능 / 접종정보만 있으면 동반가능" 은 `ysj-1017` 글 그대로, 사이트 비교 제안은 이를 `nury_life` 글(카페 입구 이용수칙을 옮겨 적은 것) 그대로로 바꾸자고 한다.
- **레포가 PUBLIC 이다**(`gh repo view`). 블로그 출처로 게시된 38곳의 원문이 화면만이 아니라 git 의 `src/data/places.json` 과 클라이언트 번들에도 있다 — 화면에서만 빼면 절반(S8). git 이력은 재작성하지 않는 한 남는다.

### Opus ↔ Sonnet(같은 프롬프트 `25f0a64c`)

| 묶음 | 판정(강아지 5마리)이 갈림 | 내용 |
|---|---|---|
| 새로 3+10편(43곳, 요금 구간·추가 마리·야외만·접종·목록글·명단글) | 2 | 일랑일랑 — Opus 가 수영장·교통 "문의하는 편이 좋아요" 를 `callFirst` 로 → 전부 조건부(Sonnet 이 맞다). 호결카페 — "지정 실내" 를 Opus `free`(가능) / Sonnet `unknown` |
| DB 의 Opus 40편 ↔ 새 Sonnet(짝 50곳) | 12 | 10곳은 한 갈래 — "동반 가능" 한마디뿐인 글에서 Opus 는 원문 null(→ 정보 없음), Sonnet 은 그 한마디를 원문으로(→ C9 확인). 스테이모루티 — Opus 가 "대형견 운동장이 나뉘어 있다" 를 `largeDogOk: true` → 28kg '가능'. 보롬왓 — Sonnet 이 관광지로 `other` |

- '가능' 쪽으로 잘못 간 것(가장 비싼 방향): **Opus 2 · Sonnet 0**. 규칙을 지어낸 notes 도 Opus 쪽(PLANT827 "족욕장은 함께 이용할 수 없어요" ← 글쓴이가 안 들어간 것).
- Opus 가 낫다: 글쓰기 칸 — 조건 원문을 조건마다 한 줄로, 수다·편의시설을 덜 섞고, 한정어를 지킨다(아우아우 "단독 대관 시간대에는"). Sonnet 의 notes 는 해요체가 아니다. 벵가스테이 `petAllowed` 는 Opus(yes)가 맞다.
- Opus 가 더 뽑은 9곳은 전부 Opus 자신의 교차점검(`noPetEvidence`)·`other` 로 빠진 곳 — Sonnet 은 처음부터 안 뽑아 교차점검 호출이 준다.
- 속도: Sonnet 글당 5~6초, Opus 13~38초. 베낌 정도는 같다(소개 18%/19%, 조건 원문 95%/94%).
- **재지 않은 것**: 같은 모델 두 번의 흔들림(소음) · 교차점검·제안 패스의 모델 차이 · 시드 정답 채점의 Opus 짝(Sonnet 30편만 `25f0a64c-claude-sonnet-5-5` 캐시에 있다 — 사용자가 Opus 재실행을 멈췄다). → H5.

### 모델과 무관한 결함(두 모델 다 같다)

- `correctPetPolicyFacts`(`scripts/lib/petPolicyFacts.mjs:187-211`)가 **모델이 맞게 낸 금액·구간을 지운다** — 솔숲 "1~5kg 1만원 / 6~10kg 1.5만원"(두 모델 다 10000·15000·1~5·6~10 을 냈다), 아우아우 "4마리를 초과할 경우 1견당 3,000원"(fromDog 5), 일랑일랑 "4인 4견"(maxDogs 4), 안녕감귤 "첫 1박 기준 1만5천원".
  재현: "5kg 이하 1만원" 은 살고 "1~5kg 1만원" 은 죽는다 — 구간 하한 1 을 `mentionsKg` 가 원문 근거로 못 알아본다. **프롬프트 자신의 예시 `FEE_EX.range` 도 지워진다.** → G1.
- notes 에 반려견과 무관한 숙소 규칙(화분 물 주기 · 종량제 봉투) → S7.
- "동반 가능" 한마디를 원문으로 넣을지 프롬프트가 정하지 않아 모델·실행마다 갈린다(Opus 후보의 48% 가 원문 null) → H3 · S7.

## 결정 — 사용자 2026-10-12

- **B**: 원문은 그대로 저장(대조군 · `/admin` 검수), 공개 화면은 **판단에서 만든 문장**. 설계 검토(Opus 계획 에이전트)의 권고를 요약안으로 승인:
  - D1 표시문 = 판단(`place.policy`)의 템플릿 문장 + AI notes 한 줄(가드) + 출처 글 링크. 판정과 어긋날 수 없고 `claude -p` 백필 0회. (AI 가 쓴 문장을 저장하는 (a)는 `/admin` 에서 판단을 고치면 문장이 조용히 낡는다)
  - D2 저장 = 문장 칸이 아니라 `places.pet_policy_text_public boolean not null default false`(기본 숨김 — 쓰기 경로가 칸을 빠뜨려도 새지 않는 쪽으로 넘어진다). `source` 는 신호가 못 된다 — 기본값이 `'notion'` 이고 블로그로 채우거나 덮어써도 그대로다.
  - D3 시드 84곳 = 원문 그대로 공개(true). 가족이 쓴 문장이고 판단이 없어 정규식이 유일한 판독기다.
  - D4 features = 프롬프트 수정 + 목록글 가드(S7). 대량 재분석은 하지 않는다.
  - D5 번들·`places.json` 에서도 비공개 원문을 뺀다 — 마지막 단계(S8).
- **추출 모델 = `claude-sonnet-5-5`**, 교차점검(`VERIFY_MODEL`)·제안(`PROPOSE_MODEL`)은 **`claude-opus-5` 고정**(지금은 둘 다 `ANALYZE_MODEL` 을 따라간다 — 이 연결을 끊는다). 근거는 위 표. README 「🙋 사용자가 정할 것」 의 03 AI 모델 줄을 닫는다.

## 순서와 의존

```
G1 원문 대조 요금 ─────────────────────────────────────────────┐
M1 모델 ──▶ S7 프롬프트 묶음(같은 파일) ──▶ 🧑 H1 워커 배포 ──▶ 🧑 H5 시드 채점(두 모델)
S1 ADR ─┐
S2 순수 함수 ──▶ S3 칸(🧑 H2 db push) ──▶ S4 쓰기 경로 ──▶ S5 공개 화면 ──▶ S6 /admin 미리보기 ──▶ S8 번들에서 빼기
🙋 H3 "동반 가능" 한마디 ──▶ S7 에 싣는다 · 🙋 H4 명단글 137건 소개
```

G1 · M1 · S1 · S2 는 파일이 겹치지 않는다(동시에 집어도 된다). S7 은 M1 과 같은 `extractPlaces.mjs` 라 M1 뒤. [13 §5.3 A1](13-ai-analysis-audit-2026-10-04.md)(묶음 종합 소개)의 프롬프트도 S7 의 소개 규칙을 따른다.

## 태스크

### G1. 원문 대조가 맞는 요금·마릿수를 지운다
- [ ] `scripts/lib/petPolicyFacts.mjs`(`correctFeeRules` · `mentionsKg` · `mentionsDogs` · `amountsInWon`) + 테스트.
  - 수용: 아래 원문·판단 쌍에서 금액·구간·`fromDog`·`maxDogs` 가 **남는다** — "1~5kg 1만원"(minKg 1·maxKg 5·10000) · "6~10kg 1.5만원" · "4마리를 초과할 경우 1견당 3,000원"(fromDog 5) · "최대 인원은 4인 4견"(maxDogs 4) · "첫 1박 기준 1만5천원"(15000, label 정규화 뒤 "1만5,000원" 도).
    지어낸 숫자는 여전히 지운다(원문에 없는 10kg 등 — BUG-009 테스트 그대로 초록).
  - **`FEE_EX` 전부를 label 을 원문 삼아 `correctPetPolicyFacts` 에 넣어 금액이 사는지** 계약 테스트(지금은 `dogFee.test.ts` 가 `sumByRules` 만 본다).
  - 재현 자료: `data/raw/eval/model-compare/{223444269811,224396433545,224406783458,224387462382}.*.json` 의 `raw[].petPolicy.fees`(모델 원응답) → `normalized`(지금 코드 결과).
  - 검증: `pnpm test scripts/lib scripts/analyze src/lib/dogFee` · 문서: [pet-policy-and-eligibility](../architecture/pet-policy-and-eligibility.md) 원문 대조 절 한 줄 · 버그 문서(새 BUG 번호 — 증상: 요금 계산 칩이 안 뜨고 label 만).
  - 끝나면: 「기다림」 🧑 "요금이 지워진 대기 후보 다시 대조" 가 필요한지 판단 — 저장된 후보는 이미 지워진 값이라 코드만으로는 안 돌아온다(앱이 `withPolicyFacts` 로 다시 대조해도 지워진 칸은 없다). 재추출 대상 수를 `select` 로 세어 적는다.

### M1. 추출 모델을 Sonnet 으로, 교차점검·제안은 Opus 고정
- [ ] `scripts/analyze/extractPlaces.mjs:30` `resolveModel` 기본 `claude-sonnet-5-5` · `verifyPlaces.mjs:25` · `proposePlaces.mjs:23` 은 `env.X_MODEL || 'claude-opus-5'`(ANALYZE_MODEL 을 따라가지 않게) · 주석(`:29` "haiku 로 비교") · 테스트(`extractPlaces.test.mjs:74-77` 과 verify·propose 의 resolve 테스트).
  - 수용: `pnpm data analyze` 시작 줄(`analyze-candidates.mjs:233`)이 추출 sonnet · 교차점검 opus · 제안 opus 를 찍는다. `ANALYZE_MODEL=claude-opus-5` 로 되돌릴 수 있다.
  - 문서: [03](03-analyze-and-review.md) 의 모델 줄(:84 · 🙋 :100 닫기) · [README](README.md) 「🙋 사용자가 정할 것」 03 AI 모델 줄 닫기 · [data-pipeline](../architecture/data-pipeline.md) · [ADR-019](../decisions/ADR-019-ai-cross-check-and-address-rules.md) :85("기본은 추출과 같다" → Opus 고정) · [11](11-continuous-review-and-update-proposals.md) :121 · `.env.example` 예시.
  - 서버 워커: 번들에 실리므로 🧑 배포 전까지 서버는 Opus 로 뽑는다(후보 `meta.model` 이 섞인다 — 괜찮다). Vercel 프로젝트 env 에 `ANALYZE_MODEL` 이 있으면 지운다(`vercel env ls` 로 **이름만** 본다).
  - 끝나면: S7 줄을 NOW 「지금」 의 13 §5.3 A1 위에.

### S1. ADR-017 v9 — 원문은 대조군, 공개 문장은 판단에서
- [ ] [ADR-017](../decisions/ADR-017-ai-structured-pet-policy.md) 에 결정 13 추가 + 결정 1(원문 = 표시용) 수정, 상태: 채택(2026-10-12 사용자). 위 「결정」 의 D1~D5 와 그 이유(템플릿은 판단과 갈릴 수 없다 · 기본 숨김 · 레포 PUBLIC). [ADR-002](../decisions/ADR-002-no-place-photos.md) 에 링크 한 줄("사진과 같은 이유로 블로그 문장도").
  - 수용: ADR 만 읽고 S2~S8 의 이유가 서야 한다. 코드는 바꾸지 않는다.
  - 끝나면: 없음(S2 와 독립).

### S2. 공개 조건 문장 순수 함수
- [ ] `src/lib/petPolicyPublic.ts`(새 파일 — G1 의 `petPolicyFacts.mjs` 와 겹치지 않게) + 테스트.
  - `publicPolicyLines(policy)` — `TPetPolicy` 의 칸마다 해요체 한 줄(키 붙임). `readNothing` 과 같은 짝 규칙: 칸을 더하면 여기도 더하지 않으면 테스트가 깨지게(칸 목록을 한 곳에서).
  - `publicNotes(notes, rawText)` — notes 를 가드에 통과시켜 남길지: 숫자가 원문에 없으면 뺀다 · `GROUNDS` 근거 단어(대형·케이지·접종…)가 원문에 없으면 뺀다 · 공백을 뺀 원문과 **15자 이상** 똑같이 이어지면 베낌으로 뺀다. 뺀 이유를 돌려준다(S6 미리보기용).
  - 수용(예): 일기초록 판단 → "예방접종을 마친 강아지만 들어갈 수 있어요" 를 포함 · 원문 문장이 그대로 들어간 줄이 없다 · 템플릿 문장은 `correctPetPolicyFacts` 를 거친 판단에서만 나온다.
  - 끝나면: S3 줄을 「지금」 에.

### S3. `places.pet_policy_text_public` 칸
- [ ] 마이그레이션 `supabase/migrations/2026101x_places_pet_policy_text_public.sql`: `add column pet_policy_text_public boolean not null default false` + 시드 행 `update … set … = true where source = 'notion' and pet_policy is null`(먼저 `select` 로 그 집합이 84인지 — 블로그 값이 들어간 시드 행이 있으면 그 행은 false).
  GRANT 는 표 단위라 새 grant 없음 — [05](05-security.md) 에 한 줄 확인.
  - 코드: `scripts/lib/placeFields.mjs`(`fromPlaceRow`·`toPlace`) · `scripts/normalize.mjs` · `scripts/seed-db.mjs` · `src/types.ts`. push 전 원격에서는 `row.pet_policy_text_public ?? (row.source === 'notion')` 로 넘어간다(push 뒤 지운다 — S4 끝에서).
  - 수용: `pnpm data pull` 뒤 `git diff src/data` 가 칸 하나 더해진 것만.
  - 끝나면: 「기다림」 에 🧑 H2(`db push` + 재빌드 한 번). S4 를 「지금」 에.

### S4. 쓰기 경로가 플래그를 지킨다
- [ ] 블로그 값으로 원문을 채우거나 덮으면 플래그를 false — `applyApproved.mjs:93·187·231(OVERWRITE_PAIRS 를 세 칸 짝으로)·289` · `src/lib/adminPlaceEdit.ts:190` · `/admin` 편집 폼(`adminPagePlaceEditForm.tsx`)에 「우리가 쓴 문장 — 그대로 내보내기」 체크박스.
  - `proposePlaces.mjs:75` 를 "근거 원문(사이트에 안 나감) — 원문 그대로" 로(`PROPOSE_PROMPT_VERSION` 이 바뀐다).
  - 수용: 테스트 — 시드 행을 블로그 원문으로 덮으면 false, 운영자가 체크하면 true. 임시 fallback(`source`) 제거.
  - 끝나면: S5 를 「지금」 에.

### S5. 공개 상세가 표시문을 그린다
- [ ] `src/screens/placeDetailPolicyText.tsx`(owner-prefix) — 공개면 원문 + 강조(지금 그대로), 아니면 `publicPolicyLines` + 가드 통과 notes + 「블로그 글을 읽고 정리했어요 · 글 보기」(`reviewUrl`).
  - `PetBadges sourceText` 에는 **표시문**을 넘긴다 — 원문을 넘기면 요금 칩이 "본문에 이미 있다" 로 숨는데 그 본문은 화면에 없다(테스트는 통과한다). 라벨 「원문」(`placeDetailEligibilityCard.tsx:124`) · C7 문구(`eligibility.ts:363`) · 판정 이유의 인용(`quote` = 원문 조각)이 화면에 나가는지 보고 비공개 행에선 숨긴다.
  - 원칙 주석 고치기: `petPolicy.ts:8-10` · `extractPlaces.mjs:17`.
  - 검증: Chrome 확장으로 일기초록(블로그) · 시드 한 곳. 문서: [pet-policy-and-eligibility](../architecture/pet-policy-and-eligibility.md) · ADR-017 상태 · CLAUDE.md 「조용히 깨지는 것들」 한 줄(새 칸을 더하면 템플릿에도).
  - 끝나면: S6 를 「지금」 에.

### S6. `/admin` 에 「사이트에 나갈 문장」 미리보기
- [ ] 검수·편집·사이트 비교 화면에 같은 함수로 미리보기 + 「사이트에 안 나가는 notes 와 이유」. 문서: [admin-review](../features/admin-review.md).
  - 끝나면: S8 을 「지금」 에.

### S7. 프롬프트 묶음 — 소개·notes·과잉 추론(M1 뒤, 같은 파일)
- [ ] `scripts/analyze/extractPlaces.mjs` 시스템 프롬프트(한 번에 — `PROMPT_VERSION` 이 한 번만 바뀌게):
  - **features**(`:258`): "본문에 그 가게를 설명하는 문장이 없으면 null. 글의 제목·출처·목록 이름(예: '식약처 현황에 올라 있는')을 소개로 쓰지 않는다. 본문 문장을 옮기지 말고 자기 말로."
  - **notes**: "반려견 이용 조건만(숙소 일반 규칙·쓰레기·화분 X) · 해요체 · 자기 말로 · 글쓴이가 하지 않은 일('못 들어가봤어요')을 금지 규칙으로 바꾸지 않는다."
  - **callFirst**: "반려견 동반 때문에 미리 연락하라는 말일 때만 — 영업시간·수영장·교통을 미리 물어보라는 권유는 아니다."
  - **largeDogOk**: "대형견이 그곳에 들어가거나 묵을 수 있다는 말일 때만 — '대형견 운동장이 따로 있다' 는 시설 설명이다."
  - **petPolicyText**: 조건이 아닌 수다·편의시설 문장은 넣지 않는다(원문 그대로 원칙은 유지). H3 의 답이 "넣는다" 면 "동반이 된다는 말뿐이면 그 문장을 넣는다(판정 C9)".
  - 코드 가드: `normalizePlace` 에서 `visited === false` 면 features null(협재 목록글처럼 쓸 만한 소개도 비워진다 — 소개는 다녀온 글·13 §5.3 묶음 종합에서 온다). 빈 소개면 카드·지도 시트 줄과 OG·공유 문구를 그리지 않는다.
  - 수용: `extractPlaces.test.mjs` 프롬프트 계약 · 위 다섯 글(명단글 · 일랑일랑 · 스테이모루티 · PLANT827 · 버니하우스)을 `claude -p` 한 번씩(5회)으로 확인 — 자료는 `data/raw/eval/model-compare/*.body.txt`.
  - `eval extract` 캐시가 무효가 된다. 끝나면: 「기다림」 에 🧑 H1(워커 배포) · 🧑 H5(시드 채점).

### S8. 번들·`places.json` 에서 비공개 원문 빼기
- [ ] `pull-db` 가 판정 입력(정책·환경·`feeUnitNote`)을 미리 계산해 싣고, 공개가 아닌 행은 원문과 `sources` 를 JSON 에서 뺀다 → `places.json` 모양·`places.ts` 가 바뀐다. `withPolicyFacts`·`correctPetPolicyFacts` 가 런타임에 원문을 읽는 자리를 빌드로 옮긴다.
  - 수용: 빌드 산출물(`out/`)과 `src/data/places.json` 에 블로그 출처 행의 원문 문장이 없다(`grep` 으로 일기초록 문장). 판정 결과는 바뀌기 전과 같다(122곳 × 강아지 5마리 스냅숏 테스트).
  - git 이력의 옛 원문은 남는다 — 재작성은 하지 않는다(포크·클론에 이미 있고, 지우는 것은 앞으로의 노출).

## 사람(🧑)·결정(🙋)

- **H1 🧑 워커 배포** — M1·S7 이 끝난 뒤 한 번: `pnpm worker:build && cd worker && vercel deploy --prod`(배포라 허락 먼저 — 루트에서 `--cwd worker` 는 실패한다). 그 전까지 서버 홉은 옛 모델·옛 프롬프트로 뽑는다.
- **H2 🧑 `db push`** — S3 의 마이그레이션. 게시된 84행을 바꾸므로 재빌드가 한 번 걸린다.
- **H3 🙋 "동반 가능" 한마디뿐인 글의 조건 원문** — 권고: **넣는다**. 판정 C9("조건이 적혀 있지 않아요, 가기 전에 확인해 주세요")가 바로 이 경우를 위해 있고 시드와 같은 모양이다. 지금은 Opus 후보의 48% 가 원문 null 이라 '정보 없음'. S7 이 답을 프롬프트에 싣는다.
- **H4 🙋 식약처 명단글 대기 후보 137건의 소개** — 권고: **소개만 비운다**(후보 자체는 식약처 등록이라는 근거가 있어 남긴다). "해도 돼" 하면 Claude 가 `candidates.extracted.features` 를 null 로 update(원격 쓰기라 허락).
- **H5 🧑 시드 정답 채점(두 모델)** — S7 뒤 새 프롬프트로: `ANALYZE_MODEL=claude-sonnet-5-5 pnpm data eval extract --limit 30` · `ANALYZE_MODEL=claude-opus-5 pnpm data eval extract --limit 30` → 각각 `pnpm data eval score`(report 파일이 프롬프트 버전 하나라 둘째 score 전에 첫 report 를 복사). 약 60회 — 구독 한도. 결과가 Sonnet 쪽 지어냄 증가면 M1 을 되돌린다.
