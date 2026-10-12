# 21. 블로그 문장이 사이트에 그대로 나가지 않게 · 추출 모델을 Sonnet 으로

> 최종 수정: 2026-10-13 (v18: S6 끝 — `/admin` 세 화면에 「사이트에 나갈 문장」 미리보기(쓰기 경로가 "뒤" 를 만든다) · 사이트 값 칸 `지금 사이트` + 출처 칩은 원문 공개 칸으로. S8 을 「지금」 에)
> 이전 2026-10-13 (v17: S5.3 끝 — AI 판단의 실내 근거 줄을 판단별 근거 단어로, 블로그 9곳 근거만 바뀌고 판정 0)
> 이전 2026-10-13 (v16: S4.1 끝 — 임시 공개 짐작을 걷었다 · 채움 토스트가 칸 이름을 사람 말로 · 새 행이 안내 칸 키를 null 로라도 싣는다)
> 이전 2026-10-13 (v15: 🙋 H3·H4·백필 결정(사용자, 권고대로) — H3 넣는다(S7 에 확정) · H4 비운다(원격 update 는 권한 분류기가 막아 🧑 명령으로) · S9 신설(게시된 블로그 38곳은 판단을 고정한 채 문장만 다시 쓴다 — "백필 0회" 를 바꾼다) · 🧑 H7)
> 이전 2026-10-13 (v14: 🧑 H2 끝 — 원격 실측을 H2 메모에, S4.1 이 열렸다)
> 이전 2026-10-13 (v13: S5 가 원문을 걷으며 드러난 판독 구멍 둘을 S5.1(`개모차`)·S5.2(근거 문장 밖의 가방)로 — 전엔 원문이 옆에서 메웠다)
> 이전 2026-10-12 (v12: S5 끝 — 근거 칸은 `policyEvidence` 하나가 정한다(원문 공개면 원문, 아니면 템플릿 줄 + 안내/notes + 「원문 보기」). C7 은 고치지 않고 링크를 「원문 보기」 로 — 판정이 공개 플래그를 모르게. S6 을 「지금」 에)
> 이전 2026-10-12 (v11: G1.1 끝 — `N마리가 포함` 이 기본 마릿수 근거, Sonnet 의 숫자 없는 `추가 반려견 마리당` 도 산다)
> 이전 2026-10-12 (v10: G1.2 끝 — label 의 `N박째` 는 계산하지 않는다. 저장분은 앱이 다시 대조해 저절로 빠진다)
> 이전 2026-10-12 (v9: S4 끝 — 플래그는 원문 글자가 바뀔 때만 false · 안내만 다르면 안내 하나 · 제안 가드는 남을 원문으로. fallback 제거는 S4.1(H2 뒤). 「발견」 셋을 S5(먼저 스냅샷)·S7(안내 가드의 대조군)·H6(anon select)으로)
> 이전 2026-10-12 (v8: S3 끝 — 마이그레이션 `20261012120000`(원격 미적용, 🧑 H2) · JSON 은 공개일 때만 키 · fallback 은 마이그레이션 조건 그대로. S4 를 NOW 「지금」 에)
> 이전 2026-10-12 (v7: S2 끝 — 템플릿은 배지와 같은 `TPetPolicy` 에서, 지문은 저장된 판단 그대로. S3 를 NOW 「지금」 에)
> 이전 2026-10-12 (v6: D1 수정 — 템플릿 줄 밑에 **AI 가 자기 말로 쓴 안내 1~2문장**(판단 지문이 맞을 때만, 판단 칸 주제 금지). S2 에 가드·지문 `.mjs` · S3 에 안내 칸 · S4 제안이 안내를 씀 · S7 추출이 안내를 씀(S2 뒤) · S6 에 「짱구누나」 라벨. 근거에 담소요)
> 이전 2026-10-12 (v5: H1 — M1 뒤 워커를 먼저 한 번 배포(서버 추출도 Sonnet), S7 뒤 한 번 더)
> 이전 2026-10-12 (v4: S1 끝 — ADR-017 v9 결정 13 · ADR-002 v6)
> 이전 2026-10-12 (v3: M1 끝 — 추출 Sonnet · 교차점검·제안 Opus 고정. 서버 워커 env 에 `ANALYZE_MODEL` 없음)
> 이전 2026-10-12 (v2: G1 끝 — BUG-018. 남은 갈래를 G1.1(일랑일랑 기본 마릿수) · G1.2(`N박째부터` 금액이 산다) · G1.3(`/admin` 칠하기가 새 판독과 어긋남) 으로)
> 이전 2026-10-12 (v1: 신설 — 2026-10-12 세션의 실측 셋(블로그 문장 베낌 · Opus↔Sonnet 비교 · 원문 대조가 맞는 요금을 지움)과 사용자 결정 둘(B · Sonnet)을 태스크로)

**한 줄:** 조건 원문(`petPolicyText`)은 블로그 문장을 **글자 그대로** 옮기도록 설계돼 있고(원문 대조의 대조군), 그 문장이 공개 상세 화면에 그대로 나간다.
원문은 대조군으로만 남기고, 사이트에는 **판단(`petPolicy`)에서 만든 템플릿 줄 + AI 가 자기 말로 쓴 안내 1~2문장(없으면 가드를 거친 notes 한 줄) + 출처 글 링크**를 보인다(B, v6 에서 안내를 더함).
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
- 예: 담소요(`e552ee96`, `source = 'blog'`) — `/admin` 사이트 비교의 「짱구누나 → 바뀔 값」 이 **양쪽 다 블로거 문장**이다. 왼쪽 "강아지는 실내는 안되는거 같더라구요" 는 10-01 글이 병합된 값,
  오른쪽은 제안이 없을 때 대표 후보(confidence 최대 — 09-17 글 0.9 가 최신 09-21 글 0.85 를 이긴다)의 원문 그대로다. 제안이 있어도 `proposePlaces.mjs:75` "원문 표현을 살려" 라 원문 이어 붙이기다.
  사용자가 이것을 "짱구누나 분석에 블로그 멘트가 그대로 들어간다" 로 읽었다 — 칸 이름이 출처를 안 본다(S6).
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
- **D1·D2 수정 — 사용자 2026-10-12(2차)**: "어느 정도 멘트를 다듬어서 새롭게 만드는 것도 괜찮다" → 세 안(템플릿만 · 템플릿 + 다듬은 안내 · AI 가 문장 전체) 중 **템플릿 + 다듬은 안내**.
  - 템플릿 줄은 그대로(판정 칸 → 판정과 갈릴 수 없다). 그 밑에 AI 가 원문을 읽고 **자기 말로** 쓴 안내 1~2문장 — 이용 절차·준비 팁·자리·분위기. 해요체, 추측을 단정으로 올리지 않는다.
  - **안내는 판단 칸 주제를 말하지 않는다**(실내·야외 · 무게 · 마릿수 · 대형/소형견 · 케이지 · 목줄 · 요금 · 접종 · 전화 · 요일) — 말하면 배지와 문장이 갈린다. 사용자에게 보인 담소요 예시의
    "주문할 때 예방접종 날짜를 물어봐요" 는 이 규칙으로 빠진다(그 제안의 판단은 `vaccineRequired: false` — 필요하면 판단을 고칠 일).
  - (a)를 버린 이유(판단을 고치면 문장이 낡는다)는 **판단 지문**(`basis`)으로 막는다 — 쓴 시점의 판단을 정규화해 해시, `{text, basis}` 로 운반, 지금 판단과 다르면 숨는다.
  - 저장은 `places.pet_policy_guide jsonb` 한 칸 더(D2). 백필 0회 — 게시된 블로그 38곳은 다시 분석될 때까지 템플릿 줄 + notes 로 보인다. → **2026-10-13 S9 로 바뀌었다**(아래).
- **백필 — 사용자 2026-10-13(3차)**: "블로그 글을 차용한 게 많은데 AI 로 말을 재생성하려면 전부 다시 분석해야 하나" → 아니다. 게시된 블로그 **38곳(출처 글 46편)** 만 **판단을 고정한 채** 안내·소개를 다시 쓴다(S9).
  - 전체 재분석(분석한 글 7,618편)을 하지 않는 이유: 구독 한도를 여러 번 넘고, 추출이 Sonnet 으로 바뀌어 **판단까지 다시 뽑히면** 판정이 흔들려 대기 3,013건을 다시 검수해야 한다. 원하는 것은 표현이지 판정이 아니다.
  - 가장 많이 옮긴 조건 원문(95~97%)은 이미 AI 없이 템플릿 줄로 바뀌었다(S5). notes 는 가드가 베낌을 숨긴다. AI 가 필요한 것은 새 칸인 안내와, 카드에 보이는 소개뿐이다.
  - 대기 후보는 사이트에 안 나가므로 다시 쓰지 않는다 — 옛 프롬프트로 뽑힌 후보가 승인돼 게시되면 S9 명령의 다음 회차가 같은 조건으로 잡는다.
  - 판단을 고정한 채 문장만 써도 되는 것은 지문(`basis`) 덕이다 — 쓴 시점의 저장된 판단에 묶여, 나중에 `/admin` 에서 판단을 고치면 그 안내는 저절로 숨는다.
- **추출 모델 = `claude-sonnet-5-5`**, 교차점검(`VERIFY_MODEL`)·제안(`PROPOSE_MODEL`)은 **`claude-opus-5` 고정**(지금은 둘 다 `ANALYZE_MODEL` 을 따라간다 — 이 연결을 끊는다). 근거는 위 표. README 「🙋 사용자가 정할 것」 의 03 AI 모델 줄을 닫는다.

## 순서와 의존

```
G1 원문 대조 요금 ─────────────────────────────────────────────┐
M1 모델 ──▶ S7 프롬프트 묶음(같은 파일) ──▶ 🧑 H1 워커 배포 ──▶ 🧑 H5 시드 채점(두 모델)
S1 ADR ─┐                                     ▲
S2 순수 함수 ──┬──────────────────────────────┘ (안내 칸 — 지문·가드를 쓴다)
              └──▶ S3 칸(🧑 H2 db push) ──▶ S4 쓰기 경로·제안 안내 ──▶ S5 공개 화면 ──▶ S6 /admin 미리보기 ──▶ S8 번들에서 빼기
H3 "동반 가능" 한마디 = 넣는다 ──▶ S7 에 싣는다 · 🧑 H4 명단글 137건 소개 비우기
S7 ──▶ S9 게시 38곳 문장만 다시 쓰기 ──▶ 🧑 H7 실행(미리보기 → --apply)
```

G1 · M1 · S1 · S2 는 파일이 겹치지 않는다(동시에 집어도 된다 — S2 의 새 `.mjs` 는 G1.1·G1.2 의 `petPolicyFacts.mjs` 와 다른 파일). S7 은 M1 과 같은 `extractPlaces.mjs` 라 M1 뒤, 안내 칸이 S2 의 지문·가드를 부르므로 **S2 뒤**. [13 §5.3 A1](13-ai-analysis-audit-2026-10-04.md)(묶음 종합 소개)의 프롬프트도 S7 의 소개 규칙을 따른다.

## 태스크

### G1. 원문 대조가 맞는 요금·마릿수를 지운다
- [x] `scripts/lib/petPolicyFacts.mjs`(`correctFeeRules` · `mentionsKg` · `mentionsDogs` · `amountsInWon`) + 테스트.
  > 메모: 2026-10-12 고침 → [BUG-018](../bugs/BUG-018-fee-grounding-drops-correct-amounts.md). 실패 지점은 다섯 — 구간 하한(`mentionsKgFrom`, minKg 에만) · `N마리를 초과`(`mentionsDogsOver` + `shapeMatchesLabel`) · `4견`(`mentionsDogs`) ·
  > `1만5천원` 을 5000 으로 읽음(`feeLine.mjs` 의 `AMOUNT_RE` — `petPolicyFacts` 밖) · `첫 1박` 을 1박마다로 읽어 `perNight: false` 거절(`shapeMatchesLabel`, 명세에 없던 것 — 두 모델 다 그렇게 냈다).
  > 「끝나면」 판단: **재추출 안 함** — 원격 조회로 대기 후보 적어도 6곳(요금 3 · `N견` 3 — 줄째 빠진 것은 안 잡힌다), 게시된 곳 0. 요금 줄은 label 로 남아 틀린 말은 없고 계산만 빠진다. 「기다림」 줄을 만들지 않았다.
- [x] **G1.1** `기본 요금에는 … 반려견 1마리가 포함` 을 `기본 N마리` 와 같은 근거로(`mentionsBaseDogs`) — 일랑일랑 `추가 1마리 5,000원`(fromDog 2)이 두 모델 다 맞는데 여전히 계산에서 빠진다.
  - 수용: `N마리(가) (기본) 포함` 이 fromDog N+1 의 근거. `1마리당` 은 여전히 아니다(마리당 요금). "추가 N마리" 자체를 근거로 넓히지 않는다 — 프롬프트 규칙("기본 마릿수를 본문이 말하지 않으면 null")을 대조가 통과시키게 된다.
  - 파일: `scripts/lib/petPolicyFacts.mjs` + 테스트(재현 `data/raw/eval/model-compare/224406783458.*.json`).
  > 메모: 2026-10-12 고침 → [BUG-018](../bugs/BUG-018-fee-grounding-drops-correct-amounts.md) v4. 명세에 없던 갈래 하나 — Sonnet label `추가 반려견 마리당 5,000원` 은 숫자가 없어 모양 검사(`EXTRA_DOG_RE`)에서 먼저 떨어졌다.
  > 정규화는 같은 줄을 `추가 1마리당` 으로 저장해 앱은 받으니, 모양 검사가 정규화한 모양으로도 본다(`EXTRA_DOG_RE` 는 그대로 — 정규화의 캡처가 숫자를 다시 쓴다). 저장분은 이미 지워진 값이라 안 돌아온다 — 대기 후보 2 · 게시 0, 재추출 안 함.
- [x] **G1.2** `N박째부터 1박당 1만원` 의 금액을 대조가 남긴다 — "몇째 박부터" 는 칸(`perNight` 하나)으로 표현 못 하는 조건이라 프롬프트상 `amountWon: null` 인데, Opus 가 10000 을 내면 그대로 산다(Sonnet 은 null).
  안녕감귤처럼 `첫 1박` 줄과 함께 있으면 앱이 '적힌 요금' 으로 물러나 괜찮지만, 이 줄이 **혼자** 있으면 1박 손님에게 "1박 1만원" 을 확정 문장으로 낸다.
  - 수용: `shapeMatchesLabel` 이 label 의 `\d\s*박\s*째` 를 칸에 없는 조건으로 보고 계산에서 뺀다. `첫 1박` · `1박당` 은 그대로. `petPolicyFacts.test.mjs` 의 안녕감귤 테스트에 둘째 줄 `null` 단언을 되살린다.
  > 메모: 2026-10-12 고침 → [BUG-018](../bugs/BUG-018-fee-grounding-drops-correct-amounts.md) v3. 줄 혼자 있는 테스트를 더했다. 저장분은 G1 과 달리 **코드만으로 돌아온다** — 지워진 값이 아니라 남은 값을 빼는 쪽이라 `withPolicyFacts` 가 읽을 때 뺀다.
  > 원격 조회로 `N박째` 가 든 곳은 대기 후보 1 · 게시 0. 「기다림」 줄 없음.
- [x] **G1.3** `/admin` 의 원문 칠하기(`CORRECTION_CUES` 의 `amount`·`dogs`)를 새 판독에 맞춘다 — `1만5천원` 에서 `5천원` 만 칠하고, `4견` 은 못 칠한다. 파일 주석이 "이 표 하나가 정본" 이라 한 표가 대조와 다른 말을 한다.
  - 수용: `adminCorrection.test.ts` 에 `1만5천원` 한 덩어리 · `4견` 칠하기. 새 정규식에 lookbehind 리터럴을 더하지 않는다(`feeLine.mjs` 머리 주석).
  > 메모(2026-10-13): 금액은 `feeLine.mjs` 가 `AMOUNT_RE` 의 토큰으로 만든 `AMOUNT_CUE` 를 표가 그대로 쓴다(따로 적지 않는다). 숫자 단서 셋(kg·dogs·amount)을 앞 글자 캡처 + `w` 그룹으로 — 있던 lookbehind 리터럴 셋도 걷혔다(이 모듈은 `petPolicy.ts` 를 거쳐 **사이트 번들**에도 들어간다). 칠하기(`matchesOf`)는 `d` 플래그로 `w` 구간만 칠한다(`/admin` 은 PC). 아래 수용 줄들(구간 하한 · `초과` · `4견` · `1만5천원` · FEE_EX 계약)은 G1 의 것이고 G1 에서 이미 끝났다(`dogFee.test.ts` 「프롬프트 예시 계약」). 화면 확인은 못 했다 — `/admin` 은 로그인이 필요하고 Chrome 확장이 연결돼 있지 않았다.
  - 수용: 아래 원문·판단 쌍에서 금액·구간·`fromDog`·`maxDogs` 가 **남는다** — "1~5kg 1만원"(minKg 1·maxKg 5·10000) · "6~10kg 1.5만원" · "4마리를 초과할 경우 1견당 3,000원"(fromDog 5) · "최대 인원은 4인 4견"(maxDogs 4) · "첫 1박 기준 1만5천원"(15000, label 정규화 뒤 "1만5,000원" 도).
    지어낸 숫자는 여전히 지운다(원문에 없는 10kg 등 — BUG-009 테스트 그대로 초록).
  - **`FEE_EX` 전부를 label 을 원문 삼아 `correctPetPolicyFacts` 에 넣어 금액이 사는지** 계약 테스트(지금은 `dogFee.test.ts` 가 `sumByRules` 만 본다).
  - 재현 자료: `data/raw/eval/model-compare/{223444269811,224396433545,224406783458,224387462382}.*.json` 의 `raw[].petPolicy.fees`(모델 원응답) → `normalized`(지금 코드 결과).
  - 검증: `pnpm test scripts/lib scripts/analyze src/lib/dogFee` · 문서: [pet-policy-and-eligibility](../architecture/pet-policy-and-eligibility.md) 원문 대조 절 한 줄 · 버그 문서(새 BUG 번호 — 증상: 요금 계산 칩이 안 뜨고 label 만).
  - 끝나면: 「기다림」 🧑 "요금이 지워진 대기 후보 다시 대조" 가 필요한지 판단 — 저장된 후보는 이미 지워진 값이라 코드만으로는 안 돌아온다(앱이 `withPolicyFacts` 로 다시 대조해도 지워진 칸은 없다). 재추출 대상 수를 `select` 로 세어 적는다.

### M1. 추출 모델을 Sonnet 으로, 교차점검·제안은 Opus 고정
- [x] `scripts/analyze/extractPlaces.mjs:30` `resolveModel` 기본 `claude-sonnet-5-5` · `verifyPlaces.mjs:25` · `proposePlaces.mjs:23` 은 `env.X_MODEL || 'claude-opus-5'`(ANALYZE_MODEL 을 따라가지 않게) · 주석(`:29` "haiku 로 비교") · 테스트(`extractPlaces.test.mjs:74-77` 과 verify·propose 의 resolve 테스트).
  - 수용: `pnpm data analyze` 시작 줄(`analyze-candidates.mjs:233`)이 추출 sonnet · 교차점검 opus · 제안 opus 를 찍는다. `ANALYZE_MODEL=claude-opus-5` 로 되돌릴 수 있다.
  - 문서: [03](03-analyze-and-review.md) 의 모델 줄(:84 · 🙋 :100 닫기) · [README](README.md) 「🙋 사용자가 정할 것」 03 AI 모델 줄 닫기 · [data-pipeline](../architecture/data-pipeline.md) · [ADR-019](../decisions/ADR-019-ai-cross-check-and-address-rules.md) :85("기본은 추출과 같다" → Opus 고정) · [11](11-continuous-review-and-update-proposals.md) :121 · `.env.example` 예시.
  - 서버 워커: 번들에 실리므로 🧑 배포 전까지 서버는 Opus 로 뽑는다(후보 `meta.model` 이 섞인다 — 괜찮다). Vercel 프로젝트 env 에 `ANALYZE_MODEL` 이 있으면 지운다(`vercel env ls` 로 **이름만** 본다).
  - 끝나면: S7 줄을 NOW 「지금」 의 13 §5.3 A1 위에.
  > 메모: 2026-10-12 끝. 시작 줄 첫 줄을 `추출 모델 …` 로 바꿔 셋(추출·교차점검·제안)이 이름으로 갈린다. 서버 워커 env 에 `ANALYZE_MODEL` 은 **없다**(`vercel env ls` 이름만 — 2026-10-12) → 지울 것 없음,
  > 🧑 H1 배포 뒤 서버도 Sonnet. `pnpm data eval extract|score` 의 기본 캐시 폴더도 `<프롬프트>-claude-sonnet-5-5` 로 바뀐다(Opus 짝은 `ANALYZE_MODEL=claude-opus-5`).

### S1. ADR-017 v9 — 원문은 대조군, 공개 문장은 판단에서
- [x] [ADR-017](../decisions/ADR-017-ai-structured-pet-policy.md) 에 결정 13 추가 + 결정 1(원문 = 표시용) 수정, 상태: 채택(2026-10-12 사용자). 위 「결정」 의 D1~D5 와 그 이유(템플릿은 판단과 갈릴 수 없다 · 기본 숨김 · 레포 PUBLIC). [ADR-002](../decisions/ADR-002-no-place-photos.md) 에 링크 한 줄("사진과 같은 이유로 블로그 문장도").
  - 수용: ADR 만 읽고 S2~S8 의 이유가 서야 한다. 코드는 바꾸지 않는다.
  - 끝나면: 없음(S2 와 독립).
  > 메모: 2026-10-12 ADR-017 v9(결정 13 = D1~D5 + 화면 자리·`/admin` 미리보기의 이유, 결정 1·결과 첫 줄 고침, 상태에 "결정 13 만 채택·구현 전") · ADR-002 v6 결과 한 줄.

### S2. 공개 조건 문장 순수 함수
- [x] 파일 둘 + 테스트(v6 — 가드·지문은 분석 시점(스크립트)에도 돌아야 해서 `.mjs` 로 가른다. 스크립트는 TS 를 못 읽고, 레포 관례는 TS 가 `.mjs` 를 import 하는 쪽이다):
  - **`scripts/lib/petPolicyGuide.mjs`**(새 파일 — G1.1·G1.2 가 고치는 `petPolicyFacts.mjs` 에 넣지 않는다, 파일 비겹침):
    - `POLICY_TOPICS` — 판단 칸 ↔ 주제 표 **하나**. 템플릿과 가드가 같이 읽는다. 낱말로 잡는 주제: 실내·야외·실외 · 대형견·소형견 · 케이지·이동가방·켄넬·유모차 · 목줄·리드줄 · 요금·입장료 · 접종 · 전화·문의 · 요일.
      **요금·마릿수·무게는 낱말이 아니라 이미 있는 숫자 패턴**으로 잡는다(금액 토큰 `amountsInWon` · `N마리`·`N견` · `N kg`) — **한 글자 부분 일치(`원`·`견`)는 쓰지 않는다**:
      `정원`·`공원` 이 요금으로, `반려견` 이 마릿수로 잡혀 거의 모든 안내가 빠진다.
      > 메모(의도): `야외`·`실외` 가 주제라 실외만 받는 곳에서 "한라산이 보이는 야외 테라스석" 같은 자리 안내도 빠진다 — 템플릿이 이미 "실외에서만" 이라 말하므로 받아들인다. 테스트 실패가 아니라 설계다.
    - `guardPublicText(text, rawText)` → `{ ok, reasons }` — 공백을 뺀 원문과 **15자 이상** 같은 이음(베낌) · 원문에 없는 숫자 · `GROUNDS` 근거 단어가 원문에 없음 · (안내만) `POLICY_TOPICS` 낱말. 이유는 S6 미리보기용 한국어.
    - `policyFingerprint(policy)` — 키 정렬 · null·undefined·빈 배열 제거 뒤 해시. 칸이 늘어도(새 칸은 null) 지문이 그대로, 그 밖의 차이는 숨김 쪽(안전한 쪽)으로 넘어진다.
  - **`src/lib/petPolicyPublic.ts`**(새 파일):
    - `publicPolicyLines(policy)` — 칸마다 해요체 한 줄(키 붙임). `readNothing` 과 같은 짝 규칙: 칸 목록은 `POLICY_TOPICS` 에서 — 칸을 더하고 템플릿을 빠뜨리면 테스트가 깨지게.
    - `publicNotes(notes, rawText)` — 가드(주제 검사 없이)를 지난 notes 한 줄, 아니면 null + 이유.
    - `publicGuide(guide, policy, rawText)` — `guide.basis === policyFingerprint(policy)` 이고 가드(주제 검사 포함)를 지나면 문장, 아니면 null + 이유(`판단이 바뀌어 숨김` · 베낌 · 없는 숫자 · 판단 주제).
  - 수용(예): 일기초록 판단 → "예방접종을 마친 강아지만 들어갈 수 있어요" 를 포함 · 원문 문장이 그대로 들어간 줄이 없다 · 템플릿 문장은 `correctPetPolicyFacts` 를 거친 판단에서만 나온다.
    안내 "주문할 때 예방접종 날짜를 물어봐요" 는 판단 주제로 빠진다 · "정원 산책로까지 같이 걸을 수 있어요" 는 남는다 · **반려견·정원·공원이 든 안내는 주제 검사를 지난다** · 원문 15자를 베낀 안내는 빠진다 ·
    **지문 왕복** — 후보 판단(`petDays: null` 이 있는 모양)의 지문 = `fromPlaceRow`/`toPlace` 를 거친 판단(`petDays` 가 없는 모양, 담소요 `places.json`)의 지문 · 판단 칸 하나를 바꾸면 지문이 바뀐다.
  - 끝나면: S3 줄을 「지금」 에.
  > 메모: 2026-10-12 끝. 입력이 함수마다 다르다 — **템플릿은 배지와 같은 `TPetPolicy`**(`entry.policy`)에서 만든다: facts 로 짜면 경계(이하/미만 — `withPolicyFacts` 가 원문에서 얹는다)와
  > 챙길 물건(가방/유모차 — `sources.indoor`)이 칩과 갈린다. 크기·요금·전화 줄을 고르는 규칙도 `toPetBadges` 와 같다. **지문은 저장된 판단 그대로**(`place.petPolicy`) — 런타임 대조를 다시 돌린 값을
  > 해시하면 G1.x 가 규칙을 고치는 순간 안내가 전부 숨는다. 정규형은 재귀 키 정렬(jsonb 가 `fees[]` 안 키도 섞는다) · `false` 는 남긴다(`largeDogOk` 불가 ≠ 언급 없음) · `notes` 도 지문에 든다(고치면 숨김 쪽).
  > 근거 단어 검사는 `CORRECTION_CUES` 를 빌리되 `feeFree`(맨 `없`)·`indoorFree`(`자유롭게`·`안에서`)는 뺐다 — 산문에서 흔해 멀쩡한 안내가 빠진다. 해시는 동기 cyrb53(브라우저 번들 — `node:crypto` 불가).
  > 운반 타입 `TPetPolicyGuide = { text, basis }` 는 `src/types.ts` 에 두었다(S3·S7 이 쓴다). 칸 짝은 둘로 잡힌다: 추출 스키마 `required` ↔ `POLICY_TOPICS`(테스트) · `POLICY_TOPICS` ↔ 템플릿(`satisfies` + "모든 칸이 줄을 만든다" 테스트).

### S3. `places.pet_policy_text_public` 칸
- [x] 마이그레이션 `supabase/migrations/2026101x_places_pet_policy_text_public.sql`: `add column pet_policy_text_public boolean not null default false` ·
  `add column pet_policy_guide jsonb`(`{text, basis}`, null = 안내 없음 — v6) + 시드 행 `update … set … = true where source = 'notion' and pet_policy is null`(먼저 `select` 로 그 집합이 84인지 — 블로그 값이 들어간 시드 행이 있으면 그 행은 false).
  GRANT 는 표 단위라 새 grant 없음 — [05](05-security.md) 에 한 줄 확인.
  - 코드: `scripts/lib/placeFields.mjs`(`fromPlaceRow`·`toPlace`) · `scripts/normalize.mjs` · `scripts/seed-db.mjs` · `src/types.ts`. push 전 원격에서는 `row.pet_policy_text_public ?? (row.source === 'notion')` 로 넘어간다(push 뒤 지운다 — S4 끝에서).
  - 수용: `pnpm data pull` 뒤 `git diff src/data` 가 칸 하나 더해진 것만.
  - 끝나면: 「기다림」 에 🧑 H2(`db push` + 재빌드 한 번). S4 를 「지금」 에.
  > 메모: 2026-10-12 끝 — `20261012120000_places_pet_policy_public.sql`. 원격 실측(`select`): `source='notion' and pet_policy is null` = **86**(게시 84 + 내림 2) · 판단 붙은 시드 0 · 판단 없는 블로그 0.
  > `begin; <마이그레이션>; select …; rollback;` 실측으로 블로그 38 false · 시드 86 true, 롤백 뒤 칸 없음 · `rebuild_log` 새 줄 없음. update 에 `and not pet_policy_text_public` 를 붙여 다시 돌려도 재빌드가 안 걸린다.
  > fallback 은 명세의 `source === 'notion'` 이 아니라 **마이그레이션 조건 그대로**(`&& pet_policy == null`) — push 전후 `pull` 이 같게. JSON 은 **true 일 때만 키**(없으면 숨김 — 칸을 빠뜨린 입구가 새지 않는다).
  > `seed-db` 는 스냅샷 값을 옮긴다(지금 스냅샷엔 블로그 38행도 있어 '전부 true' 면 뒤집힌다). 수용 `pnpm data pull`: 시드 84행에 `"petPolicyTextPublic": true` 한 줄씩 —
  > 그 밖에 **중문보말칼국수**(10-12 04:37 `/admin` 수정: 소형견만·케이지·소개)가 스냅샷에 아직 없어 `areaGroups` 고정 수 1건이 바뀐다 → 스냅샷은 커밋하지 않았다(「발견」). S5 전에 `pull` 이 필요하다(지금 스냅샷엔 플래그가 없어 로컬에선 시드도 숨김).

### S4. 쓰기 경로가 플래그를 지킨다
- [x] 블로그 값으로 원문을 채우거나 덮으면 플래그를 false — `applyApproved.mjs:93·187·231(OVERWRITE_PAIRS 를 세 칸 짝으로)·289` · `src/lib/adminPlaceEdit.ts:190` · `/admin` 편집 폼(`adminPagePlaceEditForm.tsx`)에 「우리가 쓴 문장 — 그대로 내보내기」 체크박스.
  - `proposePlaces.mjs:75` 를 "근거 원문(사이트에 안 나감) — 원문 그대로" 로(`PROPOSE_PROMPT_VERSION` 이 바뀐다).
  - **안내 운반**(v6): 신규 승인은 후보의 `extracted.petPolicyGuide` 를 그대로 `pet_policy_guide` 로 · 덮어쓰기는 원문·판단과 **한 짝**(`OVERWRITE_PAIRS`)으로. 어디서도 지문을 다시 찍지 않는다(옮기기만 —
    승인 때 찍으면 운영자가 고친 판단의 지문이 낡은 안내에 붙는다). `/admin` 에서 판단만 고쳐도 안내는 지우지 않는다 — 지문이 어긋나 저절로 숨는다.
  - **제안이 안내를 쓴다**(v6, 같은 `PROPOSE_PROMPT_VERSION` 변경 안에서): 제안 칸에 `pet_policy_guide` — 근거 글들을 읽고 **자기 말로** 1~2문장, 해요체, 판단 칸 주제 금지, 글쓴이의 추측을 단정으로 올리지 않는다.
    `basis` 는 제안 패스가 찍는다 = 승인 뒤 남을 판단(조건 원문이 change 면 제안 판단, keep 이면 사이트 판단)의 지문. `guardPublicText` 를 못 지나면 keep(`why` 에 이유). `withProposal` 이 옮긴다.
  - 수용: 테스트 — 시드 행을 블로그 원문으로 덮으면 false, 운영자가 체크하면 true. 임시 fallback(`source`) 제거. 덮어쓰기 뒤 `publicGuide` 가 문장을 낸다(지문 일치) · 덮은 뒤 판단을 고치면 null.
  - 끝나면: S5 를 「지금」 에. S7 도 끝났으면 「기다림」 에 🧑 H1(워커 재배포 — 제안·추출 프롬프트 둘 다 번들에).
  > 메모: 2026-10-12 끝(임시 fallback 제거만 빼고 → S4.1). 명세와 다르게 간 것 넷: ① 플래그는 **원문 글자가 바뀔 때만** false — 판단만 바뀐 덮어쓰기에서 원문은 여전히 가족 문장이다.
  > ② 원문·판단이 같고 안내 **문장**만 다르면 안내 하나만 덮는다(지문만 다른 안내는 덮지 않는다 — 전·후 목록이 문장만 보여 목록에 안 서는 칸이 patch 에 실린다). 후보에 안내가 없으면 그때는 지우지 않는다.
  > ③ 빈 칸 채우기는 안내가 **있을 때만** 싣는다(null 을 쓰지 않는 원칙). ④ 제안 가드의 대조군은 **승인 뒤 남을 원문** — 런타임 `publicGuide` 와 같은 글이라 "제안 때 통과 → 화면에서 숨음" 이 없다(넓은 대조군은 S7 의 v8 발견).
  > 그 밖: `OVERWRITE_PAIRS` 조건 짝 넷(원문·판단·원문 공개·이용 안내) · `adminLatest` 줄 「원문 공개」·「이용 안내」 · 안내만 change 이고 원문이 완화로 꺼졌으면 안내가 짝을 다시 켜지 않는다(`proposalPick`) ·
  > `guideOf` 는 `basis` 없는 안내를 없는 것으로 본다(S7 은 `{text, basis}` 를 함께 낸다) · `PROPOSE_PROMPT_VERSION` `6f96326f` → `a0be9600`(🧑 H1 전까지 서버 홉은 옛 프롬프트).
  > 체크박스는 칸이 있는 원격에서만 그려져 H2 전엔 화면 확인 거리가 없다 — S4.1 에서. 테스트: 왕복(제안 → `withProposal` → 덮어쓰기 → `fromPlaceRow` → `publicGuide` 문장 · 판단 칸 하나 고치면 `판단이 바뀌어 숨겼어요`).
- [x] **S4.1**(🧑 H2 뒤) `scripts/lib/placeFields.mjs` 의 임시 fallback(`row.pet_policy_text_public ?? (source === 'notion' && pet_policy == null)`)을 걷고 테스트(「칸이 없는 원격」)를 "칸이 없으면 숨김" 으로.
  - push 여부는 `pull` 로 못 가린다(fallback 이 같은 값을 낸다) — 원격 조회로: `information_schema.columns` 에 두 칸 · `count(*) filter (where pet_policy_text_public)` = 86.
  - 화면: Chrome 확장으로 `/admin` 등록 완료 → 시드 한 곳 `고치기` 에 「원문 공개」 체크가 켜진 채 서는지, 블로그 한 곳은 꺼진 채인지.
  - 같이(S4 executor 가 범위 밖으로 넘긴 것): `adminPage.tsx` 의 채움 토스트가 `patchKeys` 를 영문 키 그대로 잇는다 — H2 뒤엔 `pet_policy_text_public`·`pet_policy_guide` 가 운영자 화면에 영문으로 선다(라벨 표로) ·
    새 장소의 형제 후보가 `fillBlanks` 를 지날 때 메모리 행에 칸 키가 없어 안내가 조용히 빠질 수 있다(실패는 없다 — `'pet_policy_guide' in row` 가드가 메모리 행을 모른다).
  - 끝나면: 없음.
  > 메모: 2026-10-13 끝. 원격 다시 실측(`select`): 공개 86(게시 84) · 블로그 false 38 · 안내 0 — 호출처(`pull-db` · 대조 corpus 셋)가 전부 `select('*')` 라 걷어도 시드가 숨지 않는다.
  > 화면(Chrome, 7727 `/admin` 등록 완료 → `고치기`, 저장 안 함): 솔숲펜션(시드) 체크 켜짐 · 고바치(블로그) 꺼짐 「지금 값 · 숨김」.
  > 토스트는 `filledColumnLabels`(`adminLatest.ts` — `COLUMNS` 를 빌리고 채우기 전용 칸(좌표 두 칸·`naver_url`·`homepage_name`·`review_url`·`status`)만 더한다, 모르는 키는 영문 그대로).
  > 메모리 행 구멍은 `toNewPlaceRow` 한 곳에서 — 칸이 있으면 안내가 없어도 `pet_policy_guide: null` 키를 싣는다. `/admin`(`places.push`)과 CLI(`rowById`)가 같은 구멍이라 둘 다 닫혔다.

### S5. 공개 상세가 표시문을 그린다
- [x] `src/screens/placeDetailPolicyText.tsx`(owner-prefix) — 공개면 원문 + 강조(지금 그대로), 아니면 `publicPolicyLines` + **`publicGuide` 가 낸 안내, 없으면 `publicNotes`** + 「블로그 글을 읽고 정리했어요 · 글 보기」(`reviewUrl`).
  - `PetBadges sourceText` 에는 **표시문**을 넘긴다 — 원문을 넘기면 요금 칩이 "본문에 이미 있다" 로 숨는데 그 본문은 화면에 없다(테스트는 통과한다). 라벨 「원문」(`placeDetailEligibilityCard.tsx:124`) · C7 문구(`eligibility.ts:363`) · 판정 이유의 인용(`quote` = 원문 조각)이 화면에 나가는지 보고 비공개 행에선 숨긴다.
  - 원칙 주석 고치기: `petPolicy.ts:8-10` · `extractPlaces.mjs:17`.
  - 검증: Chrome 확장으로 일기초록(블로그) · 시드 한 곳. 문서: [pet-policy-and-eligibility](../architecture/pet-policy-and-eligibility.md) · ADR-017 상태 · CLAUDE.md 「조용히 깨지는 것들」 한 줄(새 칸을 더하면 템플릿에도).
  - **🧑 H2 와 순서**: 어느 쪽이 먼저여도 해가 없다 — H2 가 먼저면 `/admin` 의 「원문 공개」 체크와 그 밑 안내 문구("블로거의 문장이라 사이트에 그대로 내지 않아요")가 서지만, 이 태스크 전까지는 문구가 사실이 아니다(상세는 아직 원문을 낸다).
  - **먼저 스냅샷**(v8 발견): 커밋된 `src/data/places.json` 엔 공개 플래그가 없어 로컬에선 시드도 숨김으로 그려진다 → `pnpm data pull` 하고 `chore(data)` 로 따로 커밋.
    그 pull 에는 중문보말칼국수(10-12 04:37 `/admin` 수정: 소형견만·케이지·소개)가 함께 들어와 `areaGroups.test.ts` 「콩 2.5kg + 해피 12kg · 유모차」 고정 수 1건이 바뀐다 — 같은 커밋에서 맞춘다.
  - 끝나면: S6 를 「지금」 에.
  > 메모: 2026-10-12 끝 — 스냅샷 `9057f0e`(플래그 84 · 중문보말칼국수, `areaGroups` 콩+해피 식당 남부 3 → 2). 고르는 일은 순수 함수 `policyEvidence`·`evidenceText`(`petPolicyPublic.ts`)가 맡고 화면은 그리기만 —
  > 근거 칸과 그 이름표(「원문」/「정리한 조건」)가 같은 값을 본다. 명세와 다르게 간 것: ① 링크는 「글 보기」 가 아니라 **「원문 보기」** — C7("원문을 확인해 주세요")·배지 `원문 확인 필요` 를 그대로 두고
  > 그 "원문" 이 링크를 가리키게 했다(판정에 공개 플래그를 끌어들이면 목록·지도·홈까지 번진다). ② 템플릿 줄이 0개인 곳(동반 불가·못 읽음·일반 허용뿐)은 빈 칸 대신 상태 한 줄(`emptyLine`) —
  > 지금 비공개 38곳은 전부 줄이 1개 이상이라 화면엔 안 드러난다. ③ `feeUnitNote` "1박 기준인지는 원문에 없어요" → "적혀 있지 않아요"(판포현·협재현 같은 비공개 숙소에도 선다).
  > 인용(`quote`)은 `HighlightedPolicyText`(새 파일로 옮김)에서만 쓰여 비공개 행에선 저절로 안 나간다. 수용의 기계판: 스냅샷 비공개 행 전부의 화면 글에 원문 15자 이음이 없다(테스트).
  > 안내 분기는 스냅샷에 안내가 0곳이라 단위 테스트로만(지문이 맞으면 안내 · 판단이 바뀌면 notes). 화면은 **Playwright** 로 봤다(Chrome 확장 미연결): 일기초록(강아지 있음·없음) · 판포현스테이(요금 칩이 문장에 있어 숨음) · 솔숲펜션(시드, 원문 그대로).

- [x] **S5.1** `개모차` 를 유모차로 읽는다 — `STROLLER_ALLOWED`(`src/lib/petPolicy.ts`)가 `유모차` 만 본다. 쇠소깍한끼 "강아지는 개모차, 가방 출입 가능" 에서
  템플릿·배지는 "이동가방" 만 말하고, 유모차 강아지는 C3 "케이지라고 적혀 있어요. 유모차도 되는지 확인해 주세요"(원문은 된다고 한다 — 2026-10-13 실측). S5 전엔 원문이 옆에서 메웠다.
  - 단계: `STROLLER_ALLOWED` 를 `(유모차|개모차)` 로(뒤 16자 거절 가드 그대로) — 판정 C3·배지 `cageBadge`·템플릿 `cageLine` 이 같은 식을 본다. `parsePetPolicy` 의 실내 규칙 표에도 `개모차` 가 케이지 갈래로 들어가는지 확인.
  - 수용: 쇠소깍한끼 유모차 강아지 '갈 수 있어요' · 템플릿 "이동가방이나 유모차가 있어야 해요" · 시드 86곳 판정 그대로(고정 수 테스트). 문서: [pet-policy-and-eligibility](../architecture/pet-policy-and-eligibility.md).
  > 메모(2026-10-13): `STROLLER_ALLOWED`·실내 규칙 표(`/유모차|개모차/` — 이제 정규식도 `cage` 로 읽어 근거 문장이 AI 판단과 맞는다)·`RESTRICTION_HINT`·근거 단어 `GROUNDS.indoorCage`·안내 가드 주제(`petPolicyGuide.mjs`)에 `개모차`. 시드 판정 그대로, 바뀐 것은 동네 카드 고정 수 하나(콩+해피·유모차 남부 식당 2 → 3, 쇠소깍한끼). `펫모차` 같은 다른 구어는 데이터에 없어 넣지 않았다.
- [x] **S5.2** 실내 케이지 근거 문장 밖에 적힌 이동가방을 읽는다 — 광복이네 원문의 실내 근거(`sources.indoor`)는 "…실내에서 식사할 수 있었어요" 이고 가방은 다음 문장
  "짱아는 이동가방에 넣어 의자 위에 두었고요" 다. `BAG_ALLOWED` 를 근거 문장 하나에만 대 봐서 템플릿·배지는 "케이지", 이동가방 강아지는 C2 "이동가방도 되는지 확인해 주세요"(notes 는 "이동가방에 넣어" — 한 화면이 두 말).
  - 정할 것: 근거 문장 + 바로 다음 문장까지 볼지 · `indoor: 'cage'` 일 때 원문 전체에서 볼지("가방" 이 짐 가방을 말하는 글이 있다 — 오탐 쪽이 '갈 수 있어요' 라 더 비싸다) · AI 판단에 수단 칸을 둘지(스키마 변경 = 재추출). 권고: 다음 문장까지, 거절 가드 그대로.
  - 수용: 광복이네 이동가방 강아지 '갈 수 있어요' · 시드 판정 그대로. 판정이 넓어지는 쪽이라 [BUG-009](../bugs/BUG-009-unread-and-denied-policy-judged-ok.md) 같은 지어낸 '갈 수 있어요' 가 없는지 블로그 38곳을 전·후로 대 본다.
  > 메모(2026-10-13): 권고대로 **다음 한 문장까지 · 거절 가드 그대로**. `TPetPolicy.indoorGearText`(근거 + 다음 문장, 없으면 비움)를 파서·`withPolicyFacts` 가 채우고 C2·C3·`cageBadge`·`cageLine` 이 `cageGear` 하나를 본다 — `sources.indoor` 는 그대로(인용·칠하기). 122곳 × 강아지 4마리 × needsIndoor 전·후 대조: 바뀐 곳은 **광복이네 하나**, 레벨이 바뀐 판정 0 — 배지 '케이지 필요' → '이동가방 필요' · 템플릿 '케이지' → '이동가방' · 가방 강아지 `cond[C2,C6]` → `cond[C6]`. 수용의 "'갈 수 있어요'" 는 원문의 "방문 전 한 번 확인"(C6)이 남아 '확인' 이 맞다. 다음 문장을 가진 다른 cage 곳 6(무거버거·신창해물라면·협재고기부엌·부가네얼큰이·제주라면 2호점·열두달정원카페)은 가방·유모차 말이 없어 그대로.
- [x] **S5.3** AI 판단의 실내 근거가 **첫 줄**로 떨어진다 — `withPolicyFacts` 의 `keep('indoor', …)` 만 근거 단어(`re`)가 없어, 정규식이 실내 갈래를 못 읽은 곳은 판단과 무관하게 첫 줄이 근거다(S5.2 실측).
  열두달정원카페(cage) 근거가 "애견동반 가능 카페."(진짜 근거는 둘째 줄 "단 실내 입장의 경우 소형견+케이지+접종이력 강아지만 가능") · 광복이네는 가방 줄이 아니라 "실내에서 식사할 수 있었어요".
  - 단계: 판단별 근거 단어로 줄을 고른다 — cage → `GROUNDS.indoorCage` · free → `indoorFree` · outdoorOnly → `indoorOutdoor`(`petPolicyFacts.mjs`, `correctPetPolicyFacts` 가 이미 그 말이 원문에 있어야 판단을 남긴다). `indoorGearText`(S5.2)는 근거에서 만들어지므로 같이 따라온다.
  - 수용: 열두달정원카페 실내 근거가 둘째 줄 · 122곳 전·후 대조(S5.2 의 스크립트 모양)로 판정 레벨이 바뀌는 곳 0 — 바뀌면 그곳을 메모에. 인용(quote)과 `/admin` 칠하기가 이 문장을 쓴다.
  - 출처: 21 S5.2 전·후 대조(2026-10-13).
  > 메모: 2026-10-13 끝 — 판단별 근거 단어 표 `INDOOR_GROUNDS`(`petPolicyFacts.mjs`, 보정과 같은 `GROUNDS`)를 `keep('indoor', …)` 에 물렸다. 122곳 × 강아지 4 × needsIndoor 전·후 대조:
  > 근거 줄이 바뀐 곳 **9**(블로그만) · 판정 레벨·규칙·배지 변화 **0**. 열두달정원카페 → "단 실내 입장의 경우 소형견+케이지+접종이력 강아지만 가능." · 광복이네 → 가방 줄("짱아는 이동가방에 넣어 …")
  > · 나머지 7(마씸 성산점·서린고기국수·구둠·터틀락·먼슬리브·명월반점·선흘안)도 첫 줄 대신 `외부`·`내부`·`야외`·`실내`·`자유롭게` 가 든 줄. 사이트 화면엔 변화 없다 — 근거는 `quote` 로만 쓰이고, 원문 문단(`<mark>`)은 공개 원문(시드)에만 그려진다.

### S6. `/admin` 에 「사이트에 나갈 문장」 미리보기
- [x] 검수·편집·사이트 비교 화면에 같은 함수로(`policyEvidence`·`evidenceText` — S5) 미리보기 + 「사이트에 안 나가는 notes·안내와 이유」(베낌 · 없는 숫자 · 판단 주제 · 판단이 바뀌어 숨음). 문서: [admin-review](../features/admin-review.md).
  - **사이트 값 칸 이름이 출처를 따른다**(v6, 담소요): `짱구누나 → 바뀔 값`(`adminPageGroupSiteCompare.tsx:114·169`) · `짱구누나 · 지금 사이트`(`adminPageGroupDetail.tsx:33`)는 출처를 안 보고 붙는다 —
    블로그에서 온 값(`source = 'blog'` 또는 `pet_policy_text_public = false`)을 「짱구누나」 로 부르면 블로거의 문장이 운영자의 문장처럼 보인다. 「지금 사이트」 + 출처 칩(시드 = 짱구누나 · 블로그).
  - 사이트 비교(`adminPageGroupSiteCompare`)의 `proposalFieldOf` 가 「원문 공개」 줄을 조건 원문의 제안 이유와 잇지 않아 그 줄의 이유 칸이 빈다(S4 뒤) — 원문 짝의 why 를 같이 보이게.
  - 끝나면: S8 을 「지금」 에.
  > 메모: 2026-10-13 끝. 순수 함수 `src/lib/adminPublicText.ts` 하나를 세 화면이 쓴다 — 행 → `fromPlaceRow` → `toPlaceEntry`(`places.ts` 에서 꺼낸 사이트 정책 조립) → `policyEvidence`.
  > `places.json` 전부에서 미리보기 = 상세(테스트). 명세와 다르게 간 것: ① "뒤" 는 쓰기 경로가 만든다 — 등록 `toNewPlaceRow` · 덮어쓰기 체크한 칸의 `latestPlan` patch · 고치기 `placeEditPatch` patch
  > (등록은 `toNewPlaceRow` 가 거절하는 종류·이름·지역 세 칸만 무해한 값으로 바꿔 같은 길 — 지역을 고르기 전에도 문장이 보이게). `evidenceText` 는 쓰지 않았다 — `/admin` 칩은 원문으로 요금 칩을 숨기지 않는다(`previewPolicy`).
  > ② 출처 칩은 `source` 가 아니라 **원문 공개 칸 하나**로(공개 = 짱구누나, 아니면 블로그 원문) — 칸 이름은 `지금 사이트`, 칩은 조건 원문 위에만(소개·이름은 시드여도 블로그로 채워졌을 수 있다).
  > ③ 숨은 이유는 가드·지문 넷 외에 둘 — `이용 안내가 대신 나가요` · `원문을 그대로 내보내는 곳이라 안 나가요`. 「이용 안내」 줄의 제안 이유는 자기 why 가 없으면 조건 원문의 why.
  > 화면은 Chrome 확장이 연결되지 않아(`/admin` 은 로그인이 필요해 Playwright 로도 못 들어간다) **서버 렌더 스모크**로 봤다: 솔숲펜션 고치기 「원문 그대로」 · 담소요(+어긋난 안내) 「정리한 조건」 + `판단이 바뀌어 숨겼어요` ·
  > 사이트 비교 체크 켬 「덮으면 →」 정리한 줄 / 끔 「지금 · 그대로」 · 칩 짱구누나/블로그 원문. 칩 색·밀도·폰 폭은 눈으로 못 봤다(S6.1). 원격·스냅샷에 안내가 0곳이라 안내 분기는 단위 테스트로만.
- [ ] **S6.1** S6 화면을 눈으로 — Chrome 확장으로 7727 `/admin`(운영자 로그인 그대로): 담소요 갱신 묶음(칩 `블로그 원문` · 사이트 비교 끝 `사이트 문장` 이 체크를 따라 바뀌나) ·
  등록 완료 → 솔숲펜션 `고치기`(「원문 공개」 를 끄면 「저장하면」 이 정리한 줄로 — 저장하지 않는다) · 신규 묶음 하나의 `사이트 문장` 줄. 보라 칩이 분홍 주 버튼과 섞여 보이지 않는지 · 폰 폭에서 줄이 넘치지 않는지.
  - 고칠 것이 나오면 그 자리에서(그리기만 — `adminPublicTextPreview.tsx`·`adminSource.tsx`). 끝나면: 없음.

### S7. 프롬프트 묶음 — 소개·notes·과잉 추론·안내(M1 뒤, 같은 파일 · 안내 칸은 **S2 뒤**)
- [ ] `scripts/analyze/extractPlaces.mjs` 시스템 프롬프트(한 번에 — `PROMPT_VERSION` 이 한 번만 바뀌게):
  - **petPolicyGuide**(v6, 새 칸 — 스키마 `required`, 없으면 null): "판단 칸이 말하지 않는 이용 안내(절차·준비 팁·자리·분위기)를 **자기 말로** 1~2문장, 해요체. 실내·야외·무게·마릿수·대형견·케이지·목줄·요금·접종·전화·요일은
    쓰지 않는다(판단 칸이 말한다). 글쓴이가 추측한 것을 단정으로 쓰지 않는다. 본문 문장을 옮기지 않는다. 없으면 null."
    `normalizePlace` 가 `guardPublicText` 를 지난 것만 `{ text, basis: policyFingerprint(저장될 petPolicy) }` 로 싣는다(S2 함수). 계약 테스트에 **해요체**(근거 표: Sonnet 의 notes 는 해요체가 아니다).
  - **features**(`:258`): "본문에 그 가게를 설명하는 문장이 없으면 null. 글의 제목·출처·목록 이름(예: '식약처 현황에 올라 있는')을 소개로 쓰지 않는다. 본문 문장을 옮기지 말고 자기 말로."
  - **notes**: "반려견 이용 조건만(숙소 일반 규칙·쓰레기·화분 X) · 해요체 · 자기 말로 · 글쓴이가 하지 않은 일('못 들어가봤어요')을 금지 규칙으로 바꾸지 않는다."
  - **callFirst**: "반려견 동반 때문에 미리 연락하라는 말일 때만 — 영업시간·수영장·교통을 미리 물어보라는 권유는 아니다."
  - **largeDogOk**: "대형견이 그곳에 들어가거나 묵을 수 있다는 말일 때만 — '대형견 운동장이 따로 있다' 는 시설 설명이다."
  - **petPolicyText**: 조건이 아닌 수다·편의시설 문장은 넣지 않는다(원문 그대로 원칙은 유지). **H3 = 넣는다(사용자 2026-10-13)**: "동반이 된다는 말뿐이면 그 문장을 넣는다(판정 C9)".
  - 코드 가드: `normalizePlace` 에서 `visited === false` 면 features null(협재 목록글처럼 쓸 만한 소개도 비워진다 — 소개는 다녀온 글·13 §5.3 묶음 종합에서 온다). 빈 소개면 카드·지도 시트 줄과 OG·공유 문구를 그리지 않는다.
  - 수용: `extractPlaces.test.mjs` 프롬프트 계약 · 위 다섯 글(명단글 · 일랑일랑 · 스테이모루티 · PLANT827 · 버니하우스)을 `claude -p` 한 번씩(5회)으로 확인 — 자료는 `data/raw/eval/model-compare/*.body.txt`.
  - `eval extract` 캐시가 무효가 된다. 끝나면: 「기다림」 에 🧑 H5(시드 채점) · S4 도 끝났으면 🧑 H1(워커 재배포), 아니면 H1 은 S4 의 「끝나면」 이 넣는다 · **S9 를 「지금」 에**(안내 지시·분석 시점 대조군을 S9 가 그대로 쓴다).
  - **안내 가드의 대조군을 시점별로 정한다**(v8 발견, S2 뒤 실측): `publicGuide` 는 런타임에 조건 원문(`petPolicyText`) 하나에만 대 보는데, 안내는 정의상 판단 칸 밖(자리·분위기·절차)이라 재료가 **본문**에 있다.
    원문 "실내 동반 가능, 소형견만" 에서 "마당에서 공놀이를 할 수 있어요"(없는 조건 — 마당) · "2층 창가 자리가 조용해요"(없는 숫자 2) · "대형 주차장이 있어…"(없는 조건 — 대형) 가 전부 숨는다.
    거꾸로 본문을 베낀 안내는 베낌 검사가 못 본다. 이 절의 petPolicyText 규칙(수다·편의시설 문장을 빼라)이 들어가면 더 심해진다.
    정할 것: 분석 시점(`normalizePlace`)은 **본문**으로 베낌·숫자·근거 검사, 런타임(`publicGuide`)은 지문·주제만(본문이 없다) — 그러면 S4 의 제안 가드(지금은 남을 원문으로 본다)도 같은 규칙으로 맞춘다.

### S8. 번들·`places.json` 에서 비공개 원문 빼기
- [ ] `pull-db` 가 판정 입력(정책·환경·`feeUnitNote`)을 미리 계산해 싣고, 공개가 아닌 행은 원문과 `sources` 를 JSON 에서 뺀다 → `places.json` 모양·`places.ts` 가 바뀐다. `withPolicyFacts`·`correctPetPolicyFacts` 가 런타임에 원문을 읽는 자리를 빌드로 옮긴다. 안내·notes 가드(`publicGuide`·`publicNotes` — 원문이 필요하다)도 빌드가 돌려 통과한 문장만 싣는다(v6).
  - 수용: 빌드 산출물(`out/`)과 `src/data/places.json` 에 블로그 출처 행의 원문 문장이 없다(`grep` 으로 일기초록 문장). 판정 결과는 바뀌기 전과 같다(122곳 × 강아지 5마리 스냅숏 테스트).
  - git 이력의 옛 원문은 남는다 — 재작성은 하지 않는다(포크·클론에 이미 있고, 지우는 것은 앞으로의 노출).
  - 끝나면: 🙋 H6 을 「기다림」 에.
  > 메모(S6 뒤, 2026-10-13): `/admin` 미리보기(`src/lib/adminPublicText.ts`)는 **런타임에** DB 행(원문이 있다) → `fromPlaceRow` → `toPlaceEntry`(`places.ts`) → `policyEvidence` 를 부른다.
  > 이 태스크가 `toPlaceEntry` 를 "JSON 에 미리 계산된 칸을 읽는" 모양으로 바꾸면 미리보기만 조용히 사이트와 다른 길이 된다 — 동치 테스트(`adminPublicText.test.ts`)는 같은 함수를 양쪽에서 불러 이것을 못 잡는다.
  > 그래서 원문 → 판정 입력을 만드는 **조립 함수 하나를 빌드(`pull-db`)와 `/admin` 이 함께 부르게** 둔다(행에는 원문이 있고 JSON 엔 없다 — 입력이 다를 뿐 조립은 하나).
  > 메모(계획, 2026-10-13): **S7 커밋 뒤에 시작한다** — S7 이 `petPolicyPublic.ts`(`publicGuide` 가 원문 인자를 잃는다)·`adminPublicText.ts`·`placeDetailPage.tsx` 를 고치는 중이라 같은 파일이다.
  > opus 계획(이 머신 `.omc/plans/2026-10-13-21-s8-plan.md`, gitignored · 383줄 — 파일별 변경·시그니처·테스트·커밋 넷): 조립 함수 `derivePlace(place)`(`src/lib/placeDerive.ts`, TS — `pnpm data` 가 이미
  > `--experimental-strip-types` + `tsExtResolve.mjs` 로 앱 TS 를 부른다, `pull` 에 같은 한 줄) · 공개 84행은 바이트 그대로, 비공개 38행은 `petPolicyText`·`petPolicy`·`petPolicyGuide` 대신 `derived` 하나
  > (원문 조각 `sources`·`tiers[].source`·`indoorGearText`·`feeText` 를 지운 정책 + 근거 칸 밑 한 줄) · 판정 스냅숏(122곳 × `DOG_PROFILES` 5 × `needsIndoor`, `quote` 는 빼고)을 **먼저 따로 커밋** ·
  > JSON 은 원격 없이 `pull --offline` 으로 모양만 바꾼다 · 새 조용한 깨짐(규칙을 고쳐도 비공개 행은 다음 pull 까지 옛 값)은 gitignored 원문 캐시 + drift 테스트 + CLAUDE.md 한 줄 ·
  > `seed-db`·`eval golden` 이 원문 없는 행을 읽는 입구를 막는다. **H6 은 S8 로 풀리지 않는다**(빌드가 여전히 anon 으로 원문을 읽는다). 계획 파일이 없으면(다른 머신) 이 메모로 다시 계획한다.

### S9. 게시된 블로그 행은 문장만 다시 쓴다 — 판단 고정(S7 뒤, 2026-10-13 결정)
- [ ] `pnpm data rewrite`(진입점 `scripts/data.mjs`, 새 스크립트): 대상 = `places` 의 `status = 'published' and not pet_policy_text_public and pet_policy_guide is null` — 2026-10-13 실측 38곳 · 출처 글 46편.
  승인으로 새로 게시된 블로그 행도 다음 회차에 같은 조건으로 잡힌다(명령 하나가 백필과 이후 보충을 함께 한다).
  - 곳마다: `place_sources` 의 글을 `fetchPostText`(`scripts/analyze/naverPostBody.mjs`)로 다시 받는다 — 본문은 DB 에 없다(`blog_posts` 는 url·제목뿐), AI 0회.
    저장된 판단(`pet_policy`) + 본문을 `claude -p` **한 번**에 넘겨 안내·소개만 받는다. 판단 칸은 읽기만 한다 — 판정이 안 바뀌므로 재검수가 없다.
  - 안내: S7 의 `petPolicyGuide` 지시를 그대로 쓴다(지시 문장을 한 곳에 두고 둘이 import — 둘이 갈리면 분석된 곳과 백필된 곳의 안내 규칙이 다르다).
    가드는 S7 이 정한 분석 시점 대조군(본문)으로 `guardPublicText`(주제 검사 포함). `basis = policyFingerprint(저장된 pet_policy)` — 런타임 대조를 다시 돌린 값이 아니다(S2 메모).
  - 소개: 지금 `features` 가 본문과 `COPY_RUN`(15자) 이상 같을 때만 바꾼다 — 운영자가 `/admin` 에서 고친 소개는 본문 베낌이 아니라 남는다.
    새 소개도 가드를 지나야 하고, 못 지나면 그 곳 소개는 그대로 둔다(빈 값으로 덮지 않는다).
  - 기본은 미리보기 — 전·후 표를 `data/raw/rewrite/<날짜>.md` 에 쓰고 원격엔 안 쓴다. `--apply` 일 때만 `update`(안내·소개 두 칸 — patch 에 판단·원문이 없다). 재빌드는 트리거가 합쳐 한 번.
  - 수용: 테스트 — 대상 조건(원문 공개 행·안내 있는 행·내린 행은 안 잡힌다) · patch 키가 `pet_policy_guide`·`features` 뿐 · 베낌 소개만 바뀐다 · 가드를 못 지난 안내는 안 싣는다 ·
    쓴 안내가 `publicGuide` 를 지난다(지문 일치 — 왕복). 단계 스크립트라 `process.exit` 를 부르지 않는다(CLAUDE.md).
  - [13 §5.3 A](13-ai-analysis-audit-2026-10-04.md)(묶음 종합 소개)와 소개 칸이 겹친다 — A3 가 먼저 들어오면 S9 는 안내만 쓰고 소개는 A 에 맡긴다.
  - 끝나면: 「기다림」 에 🧑 H7.

## 사람(🧑)·결정(🙋)

- **H1 🧑 워커 배포** — M1·S7 이 끝난 뒤 한 번: `pnpm worker:build && cd worker && vercel deploy --prod`(배포라 허락 먼저 — 루트에서 `--cwd worker` 는 실패한다). 그 전까지 서버 홉은 옛 모델·옛 프롬프트로 뽑는다.
  > 메모: 2026-10-12 M1 뒤 **먼저 한 번** 배포했다(사용자, `dpl_J7tc2nKVrxUggHxvR5iCcoBquCHs`) — 번들의 추출 기본 `claude-sonnet-5-5` · 교차점검·제안 `claude-opus-5` 확인, 서버 추출도 Sonnet.
  > S7 이 프롬프트를 바꾸면 **한 번 더** 배포한다(그때까지 서버는 지금 프롬프트). 같은 배포에 20 T11 시간 마감(`d1d6a84`)도 실렸다.
  > v6: **S4 의 제안 프롬프트도 번들에 실린다**(서버 홉의 analyze 단계가 제안 패스까지 돈다 — `workerRemote.mjs` → `analyze-candidates.mjs`). 둘째 배포는 **S4·S7 이 둘 다 끝난 뒤 한 번** —
  > 한쪽만 끝났을 때 배포하면 서버는 안내 칸을 반만 쓴다(추출만 · 제안만). 어느 쪽이 나중에 끝나든 그 「끝나면」 이 이 줄을 「기다림」 에 넣는다.
- **H2 🧑 `db push`** — S3 의 마이그레이션. 게시된 84행을 바꾸므로 재빌드가 한 번 걸린다.
  > 메모: 2026-10-13 사용자가 push(`20261012120000`). 원격 실측 — `information_schema.columns` 두 칸 · `pet_policy_text_public` true 86(게시 84) · 블로그 false 38 · `pet_policy_guide` 0. `rebuild_log` 에 게시 84행 `queued`(합쳐서 훅 한 번). → S4.1 을 「지금」 에.
- **H3 🙋 "동반 가능" 한마디뿐인 글의 조건 원문** — 권고: **넣는다**. 판정 C9("조건이 적혀 있지 않아요, 가기 전에 확인해 주세요")가 바로 이 경우를 위해 있고 시드와 같은 모양이다. 지금은 Opus 후보의 48% 가 원문 null 이라 '정보 없음'. S7 이 답을 프롬프트에 싣는다.
  > 메모: 2026-10-13 사용자 — **넣는다**(권고대로). S7 의 petPolicyText 줄에 확정으로 적었다.
- **H4 🙋 식약처 명단글 대기 후보 137건의 소개** — 권고: **소개만 비운다**(후보 자체는 식약처 등록이라는 근거가 있어 남긴다). "해도 돼" 하면 Claude 가 `candidates.extracted.features` 를 null 로 update(원격 쓰기라 허락).
  > 메모: 2026-10-13 사용자 — **비운다**. 대상 실측: 대기 `mialove89` 글 3편 · 137건 전부 '식약처' 소개(그 밖의 대기 후보에 '식약처' 소개 0). 워커는 `status=approved` 갱신에만 깨어 이 update 에 반응하지 않는다(`workerRealtime.mjs`).
  > 지금 값은 `data/raw/backup/2026-10-13-h4-mfds-features.json`(137행, gitignored)에 떠 두었다. Claude 의 원격 update 는 권한 분류기가 막아 🧑 명령으로 넘겼다:
  > `./node_modules/.bin/supabase db query --linked "update candidates set extracted = jsonb_set(extracted, '{features}', 'null'::jsonb) where status = 'pending' and post_url like '%mialove89%' and extracted->>'features' like '%식약처%'"` — 확인(Claude, 원격 조회): 그 글들의 대기 후보 중 '식약처' 소개 0.
- **H6 🙋 블로그 원문을 anon select 에서도 닫을지**(v8 발견) — S8 은 번들·`places.json` 만 비운다. publishable 키가 번들에 있고 `places` 는 published 행 select 가 열려 있어(`20260922120000_narrow_grants.sql`)
  원문(`pet_policy_text`)은 S8 뒤에도 PostgREST 로 읽힌다. 닫으려면 열 단위 grant 인데 `pnpm data pull`(빌드)이 같은 키로 원문을 읽어 판정 입력을 만든다 — 빌드가 원문 없이 돌게(판정 입력을 칸으로 미리 계산)
  하는 것이 먼저다. 권고: **S8 뒤에 정한다** — 지금 더 큰 노출은 레포(PUBLIC)·번들이고, API 로 읽으려면 키를 찾아 직접 질의해야 한다. ADR-017 결정 13 D5 의 범위를 그때 적는다.
- **H5 🧑 시드 정답 채점(두 모델)** — S7 뒤 새 프롬프트로: `ANALYZE_MODEL=claude-sonnet-5-5 pnpm data eval extract --limit 30` · `ANALYZE_MODEL=claude-opus-5 pnpm data eval extract --limit 30` → 각각 `pnpm data eval score`(report 파일이 프롬프트 버전 하나라 둘째 score 전에 첫 report 를 복사). 약 60회 — 구독 한도. 결과가 Sonnet 쪽 지어냄 증가면 M1 을 되돌린다.
- **H7 🧑 S9 실행** — S9 뒤: `pnpm data login` → `pnpm data rewrite`(미리보기 · 약 38회 `claude -p` — 구독 한도) → 전·후 표를 Claude 와 함께 본다 → `pnpm data rewrite --apply`(원격 `places` 쓰기 · 재빌드 한 번). 확인(Claude): `pet_policy_guide is not null` 행 수와 상세 화면 한 곳.
