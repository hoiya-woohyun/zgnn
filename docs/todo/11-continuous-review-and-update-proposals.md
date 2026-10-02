# 11. 검수가 쌓일 때 — 신규 · 보강 · 갱신을 가르고, 갱신은 제안으로 받는다

> 최종 수정: 2026-10-02 (v1: 신설 — 사용자(운영자)의 지적에서 출발했다: "지금 `/admin` 은 블로그 1개 → 업체 1개 꼴인데 수집을 계속하면 같은 가게를 쓴 다른 글이 온다.
> 검수 대기에 **신규인지 아닌지** 표기가 있어야 하고, 기존 장소를 고치는 쪽은 **어떤 블로그의 어떤 글들이 참고됐고, 지금은 이런 설명인데 앞으로 어떻게 바뀌는 게 좋은지** 제안받는 자리여야 한다."
> 그 기획을 2026-10-02 코드와 대 봤다 — 방향은 맞고 **구멍이 열둘**(§3) 있다. 가장 큰 것: 지금 코드는 그 갱신 신호를 **만들기 전에 버린다.**
> **기능 기획까지만** 다룬다 — 화면 자리·문구·색은 §8 "디자인에 넘기는 질문" 으로만. 결정 U1~U8 은 **제안**이고 🙋 가 닫히면 [ADR-020](../decisions/ADR-020-pipeline-stages-and-blocklist.md) D6·D7 을 고치는 것으로 옮긴다)
> 상태: **계획만**. 태스크 전부 `[ ]`. 형식·실행 규약은 [10](10-user-feedback-personas.md)·[08](08-usability-and-process-plan.md) 과 같다(한 태스크 = 한 커밋, `pnpm data:analyze` 는 부르지 않는다, 마이그레이션은 파일만).

관련: [09](09-admin-pipeline-stages.md)(다섯 칸 · D6 "등록 완료는 새 글로 후보가 되지 않는다" · D7 "출처 글 재분석 → 갱신 제안" — **이 문서가 D6·D7 을 넓힌다**) ·
[features/admin-review.md](../features/admin-review.md)(화면 정본 — 「덮어쓰기」·「펼친 줄」) · [ADR-017](../decisions/ADR-017-ai-structured-pet-policy.md)(AI 판단은 원문 근거가 있어야 판정에 닿는다) ·
[ADR-019](../decisions/ADR-019-ai-cross-check-and-address-rules.md)(Claude 를 두 번 부른다 · 주소 대조는 AI 가 아니다 — **셋째 호출을 더하는 문서다**) · [ADR-018](../decisions/ADR-018-in-app-admin-review.md)(승인이 곧 반영 · `/admin` 은 Claude 를 못 부른다) ·
[ADR-021](../decisions/ADR-021-place-reports.md)(사용자 제보 `policy` — 같은 가게에 대한 **또 하나의 갱신 신호**) · [data-pipeline 「수집 · 분석 · 승인」](../architecture/data-pipeline.md)(`alreadyHave` · 재분석).

## 0. 한 줄 요약

**사용자 직감은 맞다 — 그런데 지금 코드는 그 갱신 신호를 만들기 전에 버린다.** 이미 게시된 장소를 쓴 새 글은 `skipAsExisting`(`scripts/analyze/analyzeCandidates.mjs`)이 후보를 만들지 않고
`blog_posts.analysis.excluded` 에 `alreadyHave` 로만 남긴다 — `/admin` 어디에도 안 보인다. 그래서 "신규/기존 표기" 는 **이미 있지만**(`기존 · 확인 · 신규` 칩, `TIER_LABEL`)
검수 대기는 **구조적으로 거의 전부 신규**다(첫 160건: 일치 8 · 신규 134). 수집이 쌓일수록 같은 가게를 쓴 글의 비율은 오르는데, 그 글들이 가진 "달라진 조건" 은 지금 길로는 운영자에게 닿지 않는다.

갱신을 받으려면 넷이 필요하다 — (1) 버리는 자리에 **차이 게이트**를 두어 "사이트와 다른 말을 하는 글만" 후보로 만든다(같은 말이면 지금처럼 버린다 — 그래야 v14 가 막은 소음이 돌아오지 않는다),
(2) 그 후보를 **지금 사이트 값 ↔ 글들이 말한 것(글마다, 날짜) ↔ 제안** 세 칸으로 보여 준다, (3) **제안은 터미널의 분석이 만들어 후보에 실어 둔다** — 화면은 Claude 를 부를 수 없다(ADR-016·018),
(4) **덮어쓰기를 칸 단위로** 고른다 — 지금은 바뀌는 칸 전부가 한 번에 덮인다.

## 1. 사용자가 말한 것 (2026-10-02)

1. `/admin` 을 보니 **블로그 1개에 업체 1개**가 분석된 꼴이다. 수집을 계속하면 더 많아진다 — **지속적인 관점**에서 지금 UI 가 맞나.
2. 원문을 AI 가 읽어 "지금 게시하고 싶은 조건" 으로 꺼낸 것인데, 다른 블로그가 **같은 매장의 정보를 덧붙일 수도, 다른 정보를 말할 수도** 있다.
3. 그러니 검수 대기에 **신규인지 아닌지**가 표기돼야 한다.
4. 신규는 지금과 같되, **기존을 업데이트하는 관점**에서는 어떤 블로그의 어떤 글들이 참고됐고, **기존에는 이런 설명이었지만 앞으로는 어떻게 바뀌는 게 좋은지** 제안해 주는 자리여야 한다.

## 2. 코드와 대 본 결과

| 사용자 기획 | 지금 코드 | 판정 | 왜 |
|---|---|---|---|
| ③ 신규/기존 표기 | 칩 셋 `기존`(auto ≥0.85) · `확인`(ask 0.4~0.85) · `신규`(`TIER_LABEL`, `src/lib/adminCandidates.ts`). 접힌 줄에 `블로그 글 N건`, 펼치면 글마다 제목·날짜·검색어·인용 | ✅ **있다** — 그런데 **`기존` 이 거의 안 뜬다** | `skipAsExisting` 이 `auto` + `published` 짝은 **후보를 만들지 않는다**(data-pipeline v14, 2026-09-29). 그 뒤 `기존` 칩이 서는 경우는 짝이 `draft`·`archived` 일 때뿐. 즉 지금 검수 대기는 "신규 + 애매한 것" 의 목록이고, 사용자가 말한 "기존을 업데이트" 는 **입구가 닫혀 있다** |
| ② 같은 매장을 쓴 다른 글이 덧붙이거나 다른 말을 한다 | 같은 가게의 pending 후보는 `groupCandidates` 가 한 묶음으로(`match_place_id` 또는 `nameKey`). 승인하면 **대표(confidence 최고) 한 건의 값**을 쓰고 나머지 글은 빈 칸 채우기 + `place_sources` 만(`approveGroup`, `adminApply.ts`) | ⚠️ **묶이지만 합쳐지지 않는다** | 글 셋이 서로 다른 조건을 말하면 confidence 가 높은 글이 이기고 나머지는 **근거로만** 남는다. 날짜(`posted_at`)는 검수 순서(`reviewPriority`)에도 승인에도 안 쓰인다 — 2024년 글이 2026년 글을 이길 수 있다 |
| ④ 기존에는 이렇고 → 앞으로는 이렇게 (전·후) | `덮어쓰기`(`overwriteWithLatest` + `adminLatest.ts`) 가 `지금 장소 값 → 새 분석 값` 목록을 버튼 위에 그린다. `합치기`(`mergeIntoExisting`) 는 빈 칸만 | ⚠️ **전·후는 있는데 "제안" 이 아니다** | 셋이 빠져 있다. (a) **전부 아니면 전무** — 바뀌는 칸을 하나만 받을 수 없다(받으려면 `고치기` 로 후보를 먼저 손봐야 한다). (b) 값이 **대표 후보의 추출값 그대로**다 — 기존 설명과 새 글을 **같이 읽고** 쓴 문장이 아니다(AI 는 추출 때 기존 장소를 모른다). (c) 펼친 줄의 비교표는 `원문 ↔ 나갈 값` 두 칸이고 **지금 사이트 값**은 결정 레일의 한 줄(`합칠 곳`)뿐이다 |
| ④ 어떤 글들이 참고됐나 | 펼친 줄에 글 목록 + 인용(`adminPageGroupDetail`), 승인 때 `place_sources` upsert. 사이트는 `review_url` 하나만 그린다 | ✅ 운영자에겐 보인다 · 사이트엔 첫 글만 | 여러 출처 표시는 [03](03-analyze-and-review.md) 이 "앱 코드 변경 — 범위 밖" 으로 둔 것. 이 문서도 사이트 쪽은 건드리지 않는다(§6) |
| ① 지속적 관점 | 수집 3,360건은 **저수지**([README v18](README.md)), `data:analyze --limit 30` 을 반복해 시간을 거슬러 읽는다. 등록 장소는 86 → 승인마다 늘어난다 | ✅ 직감이 맞다 | 장소가 늘수록 새 글이 **이미 있는 가게**를 칠 확률이 오른다. 그 글들은 지금 전부 `alreadyHave` 로 사라지고, 그 수는 `blog_posts.analysis` JSON 안에만 있다 — 수집 완료 칸(`adminPosts.ts`)은 전체·미분석·제외 셋만 센다 |

한 가지 더 — **제안을 "해 주는" 주체가 화면일 수 없다.** `/admin` 은 브라우저이고 Claude 는 운영자 터미널의 구독(`claude -p`)으로만 돈다(ADR-016 v5, ADR-018 결정 1).
그래서 ④ 의 제안은 `pnpm data:analyze` 가 만들어 `candidates.extracted` 에 **실어 두고**, 화면은 그것을 **읽기만** 한다. 운영자가 "다시 제안해 줘" 를 누르면 그것은 재분석(수집 완료로 되돌리기)이고 다음 터미널 실행이 답한다 — 09 D5 와 같은 모양.

## 3. 구멍 — 기획이 전제하는 것 중 지금 코드가 보장하지 않는 것

전부 코드에서 읽었다. 각 줄의 끝이 §5 의 어느 결정이 메우는지다.

| # | 구멍 | 어디서 | 메우는 결정 |
|---|---|---|---|
| **G1** | **게시된 장소를 쓴 새 글은 후보가 안 된다.** 조건이 바뀌었다는 글(대형견 불가로 바뀜 · 요금 인상 · 실내 금지)이 와도 `alreadyHave` 로 버려진다. 09 D6 은 이것을 "맞다, 블랙리스트와 무관" 으로 **확정**해 두었고 D7 은 출처 글 재분석에만 예외를 뚫는다(T5.1, 미구현) | `analyzeCandidates.mjs` `skipAsExisting` · `analyze-candidates.mjs:477` | U1 |
| **G2** | 그렇다고 `skipAsExisting` 을 그냥 끄면 **v14 가 막은 소음이 돌아온다** — 시드 86곳은 칸이 다 차 있어 "같은 가게를 쓴 글" 하나당 할 일 없는 줄이 하나씩 선다(첫 분석에서 같은 펜션 13건) | data-pipeline v14 | U1 (차이 게이트) |
| **G3** | **묶음에 글이 여럿이어도 대표 한 건의 값만 쓰인다.** 날짜·일치 수·충돌은 보지 않는다. "덧붙이는 글" 은 빈 칸 채우기로 일부 들어가지만 "다른 말을 하는 글" 은 confidence 가 낮으면 사라진다 | `approveGroup` 의 `lead` · `reviewCandidates.mjs` `groupCandidates` | U3 · U5 |
| **G4** | **AI 는 추출 때 기존 장소를 모른다.** 그래서 "기존 설명을 고려한 제안" 이 나올 자리가 없다 — 지금 `덮어쓰기` 의 '새 값' 은 그 글 하나의 추출값이다 | `extractPlaces.mjs` 시스템 프롬프트(본문만 받는다) | U3 |
| **G5** | **덮어쓰기는 전부 아니면 전무.** `overwriteWithLatest` 가 다른 칸 전부를 patch 에 넣고 `adminLatest` 는 그것을 보여 줄 뿐 고르게 하지 않는다. 조건은 받고 소개는 두고 싶으면 `고치기` 로 후보를 먼저 바꿔야 한다 | `applyApproved.mjs` `overwriteWithLatest` · `adminLatest.ts` · `adminChangeList.tsx` | U7 |
| **G6** | **소개(`features`)는 사람 글이다.** 와이프가 쓴 문장을 블로그에서 뽑은 문장으로 덮으면 사이트의 목소리가 바뀐다 — `mergeIntoExisting` 머리 주석이 이것을 "조용히 썩는다" 로 적었는데 `덮어쓰기` 는 `features` 도 덮는다 | `applyApproved.mjs:74` 주석 · `overwriteWithLatest` | U4 |
| **G7** | **시간이 없다.** 수집 창이 1년이라 2024년 글이 2026년에 분석될 수 있고, 운영자가 어제 확인한(`verified_at`) 장소를 작년 글이 "바꾸자" 고 할 수 있다. 시드 86곳은 `verified_at` 이 null 이라 모든 글이 "새 글" 이다 | `blog_posts.posted_at` · `places.verified_at`(ADR-021 R5) | U5 |
| **G8** | **완화와 강화가 같은 무게다.** "대형견 불가 → 가능" 과 "가능 → 불가" 는 틀렸을 때의 값이 다르다 — 전자가 틀리면 사용자가 강아지를 데리고 가서 거절당한다([BUG-008](../bugs/BUG-008-empty-pet-policy-judged-ok.md) 의 정신). 지금은 둘 다 `덮어쓰기` 한 번이다 | 판정 쪽 원칙만 있고 검수 쪽엔 없다 | U6 |
| **G9** | **"사이트가 맞아요" 를 말할 길이 없다.** 갱신 후보를 반려하면 `candidates` 만 바뀌고 장소는 그대로 — 운영자가 글과 사이트를 대 보고 "지금 값이 맞다" 고 확인한 사실이 어디에도 안 남아, 같은 옛 사실을 쓴 다음 글이 또 올라온다. 반려 사유 칩도 신규용(목록글 · 홍보 · 폐업 · 제주 아님 · 중복 · 동반 불가 · 정보 부족)이라 "옛 정보" 가 없고, `중복` 을 고르면 뜻이 다르다 | `rejectGroup` · `REJECT_REASONS` | U8 |
| **G10** | **버려진 글의 수가 운영자에게 안 보인다.** `alreadyHave` 는 요약 줄(터미널)과 JSON 에만 있다. "이번 실행에서 기존 가게를 쓴 글 N건을 봤고 그중 M건이 같은 말이었다" 를 화면이 말해야 차이 게이트가 **일하고 있다는 것**을 알 수 있다 | `adminPosts.ts` `countPosts` | T2.4 |
| **G11** | **사용자 제보 `policy`(조건이 달라요)와 블로그 갱신 후보가 다른 칸에 선다.** 같은 가게의 같은 사실에 대한 신호 둘이 등록 완료 칸(제보)과 검수 대기 칸(후보)으로 갈린다 | ADR-021 · `adminPagePlaceReports.tsx` | T3.2 (P2) |
| **G12** | 09 v3 가 "덮어쓰기는 `place_sources` 를 안 쓴다"(T5.3) 고 적었는데, 지금 `approveGroup` 은 갈래를 가리지 않고 `linkSource` 를 부른다 — **문서와 코드가 어긋나 보인다**(일괄 경로 포함 재확인 필요). 갱신에 쓴 글이 출처로 남는지는 이 문서의 전제라 먼저 확인한다 | `adminApply.ts` `approveGroup` 끝부분 | H.4 |

## 4. 제안하는 모델

### 4-1. 후보의 종류 넷 — 지금의 `tier`(짝의 확신)와 다른 축이다

`tier` 는 "짝이 맞나" 를 말하고, 종류는 "**승인하면 무슨 일이 일어나나**" 를 말한다. 둘은 다른 축이라 칩도 따로 선다(지금 `기존` 칩은 그 둘을 한 자리에 뭉갠 것이다).

| 종류(`match.kind`) | 뜻 | 어떻게 정하나(분석 시점, 순수 함수) | 기본 버튼 | 지금과의 관계 |
|---|---|---|---|---|
| **신규** `new` | 짝이 없다 | `tier === 'new'` | 등록 | 그대로 |
| **보강** `fill` | 짝이 있고 **빈 칸만** 채운다 — 덧붙이는 글 | `mergeIntoExisting(짝, extracted)` 가 patch 를 내고 `overwriteWithLatest` 와의 차이가 그 칸들뿐 | 합치기 | 지금 `기존` 의 본래 뜻. 시드 86곳은 거의 안 생기고 블로그로 등록한 장소(숙소 요금·홈페이지·환경이 빈 곳)에 생긴다 |
| **갱신** `update` | 짝이 있고 **이미 찬 칸과 다른 말**을 한다 | `overwriteWithLatest(짝, extracted)` 의 patch 에 빈 칸 채우기 밖의 칸이 있다 | 덮어쓰기(칸 고르기) | **지금은 생기지 않는다**(G1). 사용자가 말한 "기존을 업데이트" 가 여기다 |
| **확인** `ask` | 짝이 애매하다(0.4~0.85) | `tier === 'ask'` | 사람이 고른다 | 그대로 |

표식(종류 위에 얹는다, 지금 것 유지): `등록 해제된 가게의 새 글`(짝 `archived`, 09 D6) · `출처 글 다시 읽음`(09 D7 — 아래 4-2 로 특례가 없어진다) · `동반 근거 없음`(ADR-019).

**묶음의 종류**는 행 중 가장 센 것(갱신 > 보강 > 신규 > 확인 순이 아니라 **갱신이 하나라도 있으면 갱신**) — 다른 말을 하는 글이 하나라도 있으면 그 묶음은 "볼 일" 이다.

### 4-2. 갱신 후보가 생기는 규칙 — 차이 게이트 (U1)

`skipAsExisting` 의 자리에서, 짝이 `published` 일 때:

```
fill   = mergeIntoExisting(짝 행, extracted)            // 빈 칸 채우기 patch 또는 null
diff   = overwriteWithLatest(짝 행, extracted)?.patch     // 다른 칸 전부 또는 undefined
change = diff 에서 fill 의 칸을 뺀 것                    // "이미 찬 칸을 바꾸는" 부분

change 가 비어 있지 않다  → 후보 kind='update'  (갱신)
change 비고 fill 있다     → 후보 kind='fill'    (보강)
둘 다 없다               → 지금처럼 후보 없음, excluded reason 'sameAsSite' (옛 'alreadyHave' 를 둘로 가른다)
```

세 가지가 **게이트 앞**에서 걸러 후보를 만들지 않는다(근거가 약한 글이 사이트를 바꾸자고 하지 않게):
- `visited === false`(목록글) — 이름만 나열한 글은 조건의 근거가 아니다(지금도 `목록글` 표식·반려 사유).
- 교차점검이 `동반 근거 없음`·`동반 불가 정황` 인 후보 — 그 글은 그 가게에 강아지를 데려간 글이 아니다(ADR-019 결정 2·3). 단 **불가 정황**은 버리지 않고 `update` 로 올린다 — "이제 안 받는다" 가 가장 중요한 갱신이다.
- 글 날짜가 그 장소의 `verified_at` **보다 오래됐다** → excluded reason `stale`(U5). `verified_at` 이 null(시드)이면 이 줄은 안 걸린다.

**`archived`·`draft` 짝은 지금처럼 늘 후보다**(재개업 신호 · 초안을 게시로 올리는 유일한 길 — `skipAsExisting` 주석). 종류 칩만 붙는다.

**09 D7 의 특례가 없어진다.** "출처 글이면 `skipAsExisting` 을 건너뛴다" 는 **차이가 있을 때만 후보**라는 같은 규칙으로 흡수된다 — 프롬프트를 고쳐 출처 글을 다시 읽혔는데 결과가 사이트와 같으면 할 일이 없는 것이 맞다(`sameAsSite`).
T5.1 의 "출처 글은 블랙리스트도 건너뛴다" 는 그대로 살린다(일부러 다시 읽힌 글이 차단보다 우선).

규칙은 전부 **이미 있는 두 순수 함수**(`mergeIntoExisting` · `overwriteWithLatest`)의 결과만 읽는다 — 덮어쓰기 화면의 전·후 목록(`adminLatest`)과 같은 patch 라 "게이트가 올린 것과 화면이 보여 주는 것" 이 어긋날 수 없다.
비용은 **줄지 않는다**(추출·네이버 조회 뒤의 판정) — v14 가 아낀 것은 DB 쓰기와 운영자의 줄 하나였고, 그것은 그대로 아낀다.

### 4-3. 제안 패스 — 셋째 Claude 호출 (U3 · U4)

추출(1)·교차점검(2) 뒤, **이번 실행에서 `update` 가 하나라도 생긴 장소마다 한 번**. 입력은 본문이 아니라 **구조값**이다 — 비용이 작고(수백 토큰) 지어낼 재료가 적다.

- **입력**: 짝 장소의 지금 값(`pet_policy_text` · `pet_policy` · `features` · 숙소 칸 · `verified_at`) + 그 장소의 **pending·이번 후보 전부**의 `extracted`(조건 원문 · 판단 · `evidence` · 글 날짜 · `visited` · 교차점검 결과). 글이 여럿이면 **한 번에** 준다 — 그래야 "글 A(2026-08)는 불가, 글 B(2025-11)는 가능" 을 모델이 같이 본다(G3).
- **출력**(`--json-schema`): 칸마다 `{ keep | change, value, basedOn: [post_url…], quote, why }` 와 전체 한 줄 `summary`, `conflicts: [{ field, posts }]`. **`basedOn` 이 빈 `change` 는 코드가 `keep` 으로 되돌린다**, `quote` 는 `quoteInBody`(`verifyPlaces.mjs` 에 이미 있다)로 그 글의 `evidence` 안에 있는지 대 보고 없으면 `keep` — ADR-017 v2 "지어내지 않는다" · ADR-019 결정 8 과 같은 어법.
- **제안이 손댈 수 있는 칸**(U4): 조건 원문 + 판단(짝으로) · 요금(`fees`) · 숙박 요금 · 시설 · 숙소 환경 · 카테고리. **소개(`features`)는 "덧붙일 한 문장" 만** 제안하고 기본은 `keep` — 사람 글을 다시 쓰지 않는다(G6). **주소 · 좌표 · 이름 · 종류 · 네이버 id 는 제안 밖**이다 — 주소 대조는 규칙이고(ADR-019 결정 4·5) 이름·종류·id 는 대조의 열쇠다(features/admin-review v25).
- **저장**: 그 장소 묶음의 **가장 새 글의 후보 행** `extracted.proposal` 에. 새 표를 만들지 않는다 — 후보는 (글, 가게) 한 쌍이고 제안은 "그 시점의 묶음" 에 대한 것이라, 다음 실행에서 같은 가게의 새 후보가 생기면 **다시 계산해 새 행에 싣고 옛 행의 `proposal` 은 `superseded: true`** 로 표시한다(지우지 않는다 — `candidates` 에 DELETE 없음, 옛 제안과 새 제안을 대 본다).
- **끄는 스위치** `--no-propose`, 모델 `PROPOSE_MODEL`(교차점검의 `VERIFY_MODEL` 과 같은 꼴). 계량기도 따로(README v13 의 "무엇이 5시간 한도를 태웠나").
- 화면은 **읽기만**. 제안이 없는 갱신 묶음(패스를 끈 실행 · 실패 · 패스 전의 후보)은 **`제안 없음`** 으로 그린다 — `verify` 의 null 과 같은 함정이다(CLAUDE.md "`null` 은 안 봤다"). 그때도 4-4 의 세 칸 중 둘(사이트 값 · 글들이 말한 것)은 그대로 보이고, `덮어쓰기` 의 기본값은 가장 새 글의 추출값이다.

### 4-4. 화면 — 갱신 묶음의 펼친 줄 (U7 · U8)

기능이 요구하는 것만 적는다(모양은 §8).

1. **세 칸 비교** — 항목 · **지금 사이트 값** · **글들이 말한 것** · **제안**. 둘째 칸은 글마다 한 줄(날짜 · 블로그 · 인용), 가장 새 글이 위. 셋째 칸은 `proposal` 의 `change` 만, `keep` 은 "그대로" 로. 지금 비교표(`원문 ↔ 나갈 값`)에 **왼쪽 칸이 하나 더** 서는 것이다 — `pairPlace` 는 이미 카드에 넘어온다(`덮어쓰기` 의 전·후를 그리려고).
2. **충돌 표식** — 같은 칸에 글들이 다른 말을 하면 그 줄에 `글마다 달라요`(날짜가 다르면 "최신 글은 …" 한마디). 운영자가 글을 열어 볼 자리를 그 줄에 둔다.
3. **칸 고르기 덮어쓰기** — 전·후 목록의 줄마다 체크. 기본 체크는 제안이 `change` 라 한 칸(제안이 없으면 전부). 짝 칸(조건 원문+판단 · 좌표 · 플레이스 id+url · 홈페이지 셋)은 **한 체크**로 묶인다. 쓰기는 `overwriteWithLatest(짝, extracted, { only: 고른 칸 })` — 함수에 인자 하나가 늘 뿐 규칙은 그대로다(G5).
4. **`사이트가 맞아요`** — 갱신 묶음의 둘째 결정 버튼. `places.verified_at = now`(이미 `markPlaceVerified` 가 있다) + 후보 전부 `rejected` + `reviewer_note` `[admin] 사이트 확인`(반려 집계와 다른 머리표) + **블랙리스트 없음**(가게가 아니라 글이 틀린 것). 그 뒤 같은 옛 사실을 쓴 글은 4-2 의 `stale` 이 걸러 다시 안 올라온다. **새 글**(날짜가 `verified_at` 뒤)이 또 다른 말을 하면 다시 올라온다 — 그것이 맞다(G9).
5. **반려 사유** — 갱신 묶음에서는 칩이 바뀐다: `사이트가 맞아요`(위 버튼이 대신한다) · `글이 더 오래됨` · `다른 가게예요`(= 짝이 틀림 → 지금의 `새 장소로`) · `홍보·협찬` · `정보 부족`. `폐업`·`동반 불가` 는 갱신에서는 반려가 아니라 **덮어쓰기/등록 해제의 입구**다 — 그 글이 맞다면 사이트를 바꿔야 한다.
6. 접힌 줄에 종류 칩(`신규 · 보강 · 갱신 · 확인`)과 걸러 보기(`?kind=`). **갱신을 여섯째 탭으로 빼지 않는다**(🙋 1 권장) — 개체가 같은 `candidates` 라 09 D4 "칸 = 개체" 를 지키고, 숫자가 작은 동안 탭이 하나 더 있으면 빈 탭이 된다.

### 4-5. 시간 규칙 (U5 · U6)

- **글 날짜 < `verified_at`** → 그 글은 사이트를 바꾸자고 할 수 없다(`stale`, 후보 없음). 운영자가 본 뒤의 글만 "새 소식" 이다. `verified_at` 이 null(시드 86곳)이면 모든 글이 새 소식 — 그래서 시드에 **첫 갱신 물결**이 한 번 온다(§7 H.1 로 크기를 먼저 잰다).
- **묶음 안 충돌**은 가장 새 글이 제안의 기본값, 나머지는 표식. 모델이 날짜를 뒤집어 고르면(옛 글이 더 자세하다는 이유로) 코드가 `why` 에 그 사실을 남기되 기본값은 바꾸지 않는다.
- **강화는 글 하나로, 완화는 글 둘 또는 운영자 확인으로**(U6, 🙋 2). "불가로 바뀜" · "요금 인상" · "무게 제한 추가" 는 제안의 기본 체크가 켜지고, "가능으로 바뀜" · "제한 해제" 는 **체크를 끄고** `전화로 확인해 주세요` 한마디(07 P0 전화의 자리). 틀린 방향의 값이 다르다(G8). 어느 쪽이 강화인지는 `TPetPolicyFacts` 칸별 순수 함수(`policyDirection(before, after)`) — 테스트로 박는다.

## 5. 결정 U1~U8 (제안)

**U1. 갱신 후보는 차이 게이트가 만든다 — `skipAsExisting` 을 "사이트와 같은 말" 로 좁힌다.** 제외 이유 `alreadyHave` 는 `sameAsSite`(같은 말) · `stale`(옛 글) 로 갈라 세고, 다른 말을 하는 글은 `update`, 덧붙이는 글은 `fill` 후보가 된다. 09 D6 의 "등록 완료는 새 글로 후보가 되지 않는다" 는 **"같은 말을 하는 새 글로는"** 으로 좁아지고, D7 의 출처 특례는 이 규칙에 흡수된다.

**U2. 종류(`kind`)는 짝의 확신(`tier`)과 다른 축이다.** 신규 · 보강 · 갱신 · 확인. 묶음은 갱신이 하나라도 있으면 갱신. 칩·걸러 보기·기본 버튼이 이 축을 읽는다.

**U3. 제안은 터미널의 분석이 만든다 — Claude 를 세 번 부른다.** 셋째 패스는 갱신이 생긴 장소마다 한 번, 입력은 구조값(본문 아님), 글이 여럿이면 한 번에. 결과는 가장 새 글의 후보 행 `extracted.proposal`. 화면은 읽기만 하고 **없으면 `제안 없음`** 으로 말한다.

**U4. 제안이 손대는 칸은 사실 칸이다.** 조건 원문+판단 · 요금 · 숙박 요금 · 시설 · 환경 · 카테고리. 소개는 덧붙일 한 문장만(기본 유지). 주소 · 좌표 · 이름 · 종류 · 네이버 id 는 제안 밖. 근거 없는 `change` 는 코드가 `keep` 으로 되돌린다.

**U5. 시간은 `posted_at` 과 `verified_at` 둘로 본다.** 확인 날짜보다 오래된 글은 후보가 아니다. 묶음 안에서는 새 글이 기본값. 시드(`verified_at` null)는 첫 물결을 받는다.

**U6. 강화는 한 글로, 완화는 두 글 또는 운영자 확인으로.** 기본 체크의 켜짐이 다르다. 막지는 않는다 — 운영자가 체크를 켜면 된다.

**U7. 덮어쓰기는 칸 단위다.** 전·후 목록의 줄마다 체크, 짝 칸은 한 체크, `overwriteWithLatest(…, { only })`. 일괄 덮어쓰기(`bulkLatestTargets`)는 **제안이 켠 칸만** 쓴다(제안 없으면 지금처럼 전부).

**U8. "사이트가 맞아요" 는 반려가 아니라 확인이다.** `verified_at` 을 찍고 후보를 `[admin] 사이트 확인` 으로 눕힌다. 블랙리스트에 넣지 않는다. 다음 `stale` 규칙이 같은 옛 글을 걸러 준다.

## 6. 하지 않기로 제안하는 것

| 요구·떠오르는 것 | 왜 안 하나 | 대신 |
|---|---|---|
| 화면에서 "AI 에게 다시 제안받기" 버튼 | `/admin` 은 Claude 를 못 부른다(ADR-016 · 018). 버튼이 있으면 운영자가 그것이 분석을 돌린다고 믿는다(09 D5) | `재분석`(수집 완료로 되돌리기) + 다음 `pnpm data:analyze` — 결과 줄이 그렇게 말한다 |
| 제안 전용 새 표(`place_updates`) | 후보는 이미 (글, 가게) 쌍이고 묶음이 가게다. 표가 늘면 세 쓰기 경로(CLI · 화면 · Studio)가 또 하나를 알아야 한다 | `extracted.proposal` + `superseded` |
| 소개(`features`) 를 AI 가 다시 쓰기 | 사람 글이다(G6). 블로그 문체로 바뀐 소개는 틀린 것보다 나쁘다 | 덧붙일 한 문장 제안, 기본 유지 |
| 주소·좌표 갱신 제안 | ADR-019 결정 4·5 — 주소 대조는 규칙이고 검증 축은 상호 검색 하나다 | 지금의 `주소 다름` 흐름을 **후보 ↔ 사이트 주소**에도 걸어 사람이 고른다(T2.3 안에 한 줄) |
| 완화(더 허용)를 글 하나로 자동 체크 | 틀렸을 때 사용자가 거절당한다(G8) | U6 |
| 사이트에 출처 글 여러 개 보이기 | 앱 코드 변경 — 03 이 범위 밖으로 둔 것. 이 트랙은 운영자 쪽이다 | 07 로 |
| 갱신 전용 여섯째 탭 | 개체가 같다(09 D4). 숫자가 작은 동안 빈 탭 | 종류 칩 + `?kind=update` (🙋 1) |
| `AUTO_APPROVE` 로 보강(`fill`)을 자동 반영 | 03 의 원칙 그대로 — 좌표·주소·카테고리는 "빈 칸" 이라 틀린 값이 그대로 들어간다 | 보강도 검수 대기에, 기본 버튼 `합치기` 한 번 |

## 7. 🙋 사용자가 정할 것

| # | 무엇 | 선택지 | 권장 |
|---|---|---|---|
| 1 | 갱신 묶음을 어디에 | (a) 검수 대기 안 종류 칩 + 걸러 보기 · (b) 여섯째 탭 `갱신 제안` | **(a)** — 개체가 같고(09 D4), 숫자가 작다. 쌓이면 (b) 로 옮기는 비용은 작다 |
| 2 | 완화 제안의 기준(U6) | (a) 글 하나면 체크 · (b) 글 둘 이상 또는 운영자 확인(전화) · (c) 완화는 제안하지 않는다 | **(b)** — 틀린 값이 비대칭이다(G8). (c) 는 "다시 받기 시작한 가게" 를 영영 못 고친다 |
| 3 | 소개(`features`) 를 제안이 건드리나 | (a) 덧붙일 한 문장만 · (b) 아예 밖 · (c) 다시 쓰기 허용 | **(a)** — 새 사실(테라스 생김)은 소개에 들어갈 자리가 있고, 문장은 운영자가 다듬는다 |
| 4 | 셋째 패스를 기본으로 켜나 | (a) 켠다(`--no-propose` 로 끈다) · (b) 끈다(`--propose` 로 켠다) | **(a)** — 갱신 묶음에만 돌고 입력이 구조값이라 싸다. 첫 실측(H.2)에서 토큰을 보고 바꾼다 |
| 5 | 보강(`fill`)도 검수에 올리나 | (a) 올린다(기본 `합치기`) · (b) 자동 반영 | **(a)** — §6 마지막 줄. 블로그로 등록한 장소가 늘수록 보강이 늘지만 한 번 누르기다 |
| 6 | 시드 86곳의 첫 갱신 물결 | (a) 그대로 받는다 · (b) 시드에 `verified_at` 을 시드 날짜(2026-09-20)로 한 번 채워 그 전 글은 `stale` | H.1 로 크기를 재고 정한다. 크면 **(b)** — 2025년 글이 시드를 전부 고치자고 하는 것은 소음일 가능성이 크다 |

## 8. 디자인·UI/UX 에 넘기는 질문 (이 문서는 답하지 않는다)

| 자리 | 제약(기능 쪽) | 디자인이 정할 것 |
|---|---|---|
| 종류 칩 | 넷(신규 · 보강 · 갱신 · 확인), 두 자, 세로로 훑을 수 있게(`TIER_LABEL` 의 교훈) · `tier` 칩과 **같은 줄에 둘** 수 있나 | 두 축을 한 칩으로 합치나(`갱신·확인`), 색을 가르나 |
| 세 칸 비교 | 지금 비교표에 왼쪽 칸이 하나 더 · 글마다 한 줄, 새 글이 위 · 충돌 줄 표식 | 폰(grid 꺼짐)에서 세 칸의 순서 · 글이 5건일 때의 접기 |
| 칸 고르기 | 짝 칸은 한 체크 · 기본 체크는 제안이 정한다 · 완화는 꺼져 있다 | 체크의 자리(전·후 목록 줄 앞) · "왜 꺼져 있나" 를 어떻게 말하나 |
| `사이트가 맞아요` | 반려 옆의 둘째 결정 · 장소에 날짜를 찍는다(되돌릴 수 없다) | 반려와 어떻게 가르나 · 확인 한 줄의 말 |
| `제안 없음` | null 은 "안 봤다" 다 — 초록이면 안 된다 | 뱃지인가 셋째 칸의 빈 상태인가 |
| 수집 완료 칸 | `이미 있는 곳 N · 같은 말 M · 옛 글 K` 세 수 | 어디에(머리글 vs 명령 줄 옆) |

## 9. 태스크 (08 실행 규약 · 전부 `[ ]`)

순서 한눈에: **P0 는 게이트와 화면의 최소**(제안 없이도 갱신 묶음이 서고 운영자가 칸을 골라 덮을 수 있다) → **P1 이 제안 패스와 시간 규칙** → P2 는 이어 붙이기.
P0 만 끝나도 사용자 요구 ③과 ④의 "어떤 글들이 참고됐고 지금은 이런데 이렇게 바뀐다" 는 선다 — ④의 "어떻게 바뀌는 게 좋은지" 만 P1 이다.

### P0 — 갱신 신호가 운영자에게 닿는다

#### [ ] T1.1 차이 게이트 — `skipAsExisting` 을 "같은 말" 로 좁히고 종류를 적는다

- 근거: G1·G2 · U1·U2.
- 읽을 것: `scripts/analyze/analyzeCandidates.mjs`(`skipAsExisting` · `toCandidateRow` · `formatSummary`) · `scripts/analyze-candidates.mjs:470-490`(제외 분기) · `scripts/analyze/applyApproved.mjs`(`mergeIntoExisting` · `overwriteWithLatest`) · data-pipeline v14 문단.
- 단계:
  1. 순수 함수 `kindOf(matched, extracted, placeRow, { verifiedAt, postedAt })` → `{ kind: 'new'|'fill'|'update'|'ask', exclude?: 'sameAsSite'|'stale' }`. 4-2 의 규칙 그대로. `visited === false` · 교차점검 `noEvidence` 는 `update`·`fill` 을 만들지 않는다(`notAllowed` 정황은 `update`).
  2. `skipAsExisting` 은 `kindOf(...).exclude === 'sameAsSite'` 의 얇은 래퍼로 남긴다(호출부·테스트가 그 이름을 안다). `stale` 은 새 분기.
  3. `toCandidateRow` 가 `extracted.match.kind` 를 싣는다. `stats.excluded` 에 `sameAsSite`·`stale`, 요약 줄 `· 같은 말 N · 옛 글 K`, 후보 줄에 `갱신`·`보강`.
  4. `analyze-candidates.mjs` 가 `places` 행을 이미 전부 읽으므로(`placeRows`) 짝 행은 거기서 찾는다 — 새 조회 없음. `verified_at` 은 칸이 없는 원격에서 undefined → 규칙이 안 걸린다(null 과 같다).
  5. 테스트: 같은 말 → 제외 · 빈 칸만 → fill · 찬 칸 다름 → update · 목록글 + 다름 → 제외 · 글 날짜 < verified_at → stale · verified_at null → update · archived 짝 → 늘 후보.
- 수용 기준: `pnpm test` 통과 · 기존 `skipAsExisting` 테스트가 그대로 초록(같은 말 케이스) · `--dry-run` 요약 줄에 두 수.
- 문서: data-pipeline v14 문단을 "같은 말을 하는 글만 건너뛴다" 로 · 제외 이유 둘 · 09 D6 에 한 줄 메모(→ T3.1 이 정리).
- 커밋: `feat(analyze) - 게시된 장소를 쓴 글은 사이트와 다른 말을 할 때만 후보가 된다 — 갱신·보강 종류`

#### [ ] T1.2 종류 칩·걸러 보기 — `tier` 와 다른 축

- 근거: U2 · 요구 ③.
- 읽을 것: `src/lib/adminCandidates.ts`(`TIER_LABEL` · `groupPending`) · `scripts/analyze/reviewCandidates.mjs`(`groupCandidates` — 묶음 필드 하나 더) · `src/screens/adminPageGroupCard.tsx` · `src/lib/adminUrlState.ts`(`?kind=`).
- 단계: `groupCandidates` 가 `g.kind`(갱신 > 보강 > 신규 > 확인 — 갱신 하나면 갱신; 옛 후보는 `match.kind` 없음 → `tier` 로 추정) · `KIND_LABEL` 두 자(`신규 · 보강 · 갱신 · 확인`) · 접힌 줄 칩 · 걸러 보기 드롭다운 다섯째 축 · 검수 순서(`reviewPriority`) 맨 앞에 **갱신 먼저**(사이트가 틀려 있는 시간이 비용이다).
- 수용 기준: 옛 후보(`match.kind` 없음)가 깨지지 않는다(테스트) · `?kind=update` 가 새로고침 뒤에도 산다.
- 커밋: `feat(admin) - 검수 대기에 종류 칩(신규·보강·갱신·확인)과 걸러 보기`

#### [ ] T1.3 갱신 묶음의 세 칸 비교 — 지금 사이트 값이 선다

- 근거: G3(날짜) · 요구 ④ 앞부분 · 4-4 ①②.
- 읽을 것: `src/screens/adminPageGroupDetail.tsx`(`CompareRow` — 칸이 셋이 되는 자리) · `adminPageGroupCard.tsx`(`pairPlace` 가 이미 온다) · `src/lib/adminLatest.ts`(`COLUMNS` 의 칸·표기 재사용).
- 단계: `kind === 'update' || 'fill'` 이고 `pairPlace` 가 있으면 `CompareRow` 에 `site` 칸(`adminLatest` 의 `COLUMNS.show` 로 표기). 글들이 말한 것은 **행마다**(날짜 내림차순 · 블로그 제목 · 그 칸의 값 · 인용). 같은 칸에 값이 둘 이상 다르면 줄 머리에 `글마다 달라요`. 순수 함수 `fieldVoices(rows, column)` → `[{ postedAt, title, value, quote }]`, 테스트.
- 수용 기준: 신규 묶음의 비교표는 **한 글자도 안 바뀐다**(스냅샷) · 갱신 묶음에서 세 칸.
- 커밋: `feat(admin) - 갱신 묶음은 지금 사이트 값 · 글들이 말한 것 · 나갈 값 세 칸으로 본다`

#### [ ] T1.4 덮어쓰기를 칸 단위로

- 근거: G5 · U7.
- 읽을 것: `scripts/analyze/applyApproved.mjs`(`overwriteWithLatest`) · `src/lib/adminLatest.ts` · `src/lib/adminApply.ts`(`approveGroup` 의 `opts.overwrite`) · `src/screens/adminChangeList.tsx` · `src/lib/adminBulk.ts`(`bulkLatestTargets`).
- 단계: `overwriteWithLatest(row, extracted, { only?: string[] })` — `only` 가 있으면 그 칸(과 짝 칸)만 patch. 짝 묶음은 함수 안 상수 `PAIRS`(원문+판단 · lat+lng · 플레이스 id+url · 홈페이지 셋). `TApplyOptions.overwriteColumns` · `AdminChangeList` 에 체크(`selectable`) · `latestPlan` 이 체크 상태를 받아 patch 를 다시 낸다. 일괄은 **전부**(제안이 생기는 T2.2 가 바꾼다).
- 수용 기준: `only` 에 `pet_policy_text` 만 줘도 `pet_policy` 가 같이 들어간다(테스트) · `only: []` 는 null · 체크를 다 끄면 버튼이 꺼진다.
- 문서: features/admin-review 「덮어쓰기」 에 "칸을 고른다" 한 줄.
- 커밋: `feat(admin) - 덮어쓰기에서 덮을 칸을 고른다 — 짝 칸은 함께`

#### [ ] T1.5 `사이트가 맞아요` — 확인은 반려가 아니다

- 근거: G9 · U8.
- 읽을 것: `src/lib/adminApply.ts`(`rejectGroup` · `markPlaceVerified`) · `src/lib/adminCandidates.ts`(`REJECT_REASONS`) · `src/screens/adminPageGroupActions.tsx`(결정 줄 — 갱신 묶음의 버튼 구성) · `adminPageRejectForm.tsx`.
- 단계: `confirmSite(client, group, place, nowIso)` — `markPlaceVerified` → 후보 전부 `rejected` + `[admin] 사이트 확인`(상수 `SITE_CONFIRMED_NOTE`, 반려 집계와 다른 문자열) · 블랙리스트 없음. 갱신 묶음의 결정 줄: `덮어쓰기(고른 N칸)` · `사이트가 맞아요` · `제외…`. 갱신용 사유 칩 `UPDATE_REJECT_REASONS`(4-4 ⑤) — 폼이 `kind` 로 칩 묶음을 고른다.
- 수용 기준: `사이트가 맞아요` 뒤 `verified_at` 이 찍히고 `place_blocks` 에 아무것도 없다(테스트) · 신규 묶음의 반려 칩은 그대로.
- 커밋: `feat(admin) - 갱신 묶음에 '사이트가 맞아요' — 확인 날짜를 찍고 블랙리스트는 건드리지 않는다`

### P1 — 제안과 시간

#### [ ] T2.1 제안 패스 — `scripts/analyze/proposePlaces.mjs`

- 근거: G3·G4 · U3·U4.
- 선행: T1.1.
- 읽을 것: `scripts/analyze/verifyPlaces.mjs`(둘째 패스의 틀 — CLI 인자 · 스키마 · `quoteInBody` · 계량기 · `--no-verify`) · `scripts/analyze-candidates.mjs:400-430`(패스 호출 자리) · `scripts/lib/petPolicyFacts.mjs`(`correctPetPolicyFacts` — 제안의 판단도 지난다).
- 단계:
  1. `PROPOSE_SCHEMA`(4-3 출력) · `PROPOSE_SYSTEM_PROMPT`(고정 문자열, 날짜 없음 → `PROPOSE_PROMPT_VERSION` sha256) · `buildProposePrompt(placeRow, candidateRows)` — 구조값만, 본문 없음.
  2. `sanitizeProposal(proposal, candidateRows)` 순수: `basedOn` 빈 `change` → `keep` · `quote` 가 어느 후보의 `evidence`/`petPolicyText` 에도 없으면 `keep` · U4 밖의 칸은 버린다 · `features` 는 `append` 만 · 판단은 `correctPetPolicyFacts(판단, 제안 원문)` 를 지난다 · `conflicts` 는 코드가 다시 센다(모델 값을 믿지 않는다).
  3. `analyze-candidates.mjs`: 교차점검 뒤, 이번 실행에서 `update` 가 생긴 장소를 모아 장소마다 한 번. 그 장소의 pending 후보(이미 있던 것)도 입력에 넣는다. 결과는 가장 새 글의 후보 행 `extracted.proposal`, 같은 장소의 옛 `proposal` 행은 `superseded: true` 로 update. `--no-propose` · `PROPOSE_MODEL` · 계량기 셋째.
  4. 테스트(가짜 run): 근거 없는 change → keep · 인용 불일치 → keep · features change → append · 두 글 충돌 → conflicts 1 · 주소 change → 버림.
- 수용 기준: `pnpm test` 통과 · `--dry-run` 요약에 `· 제안 N`. **실측은 H.2**.
- 문서: data-pipeline 「수집 · 분석 · 승인」 흐름도에 셋째 패스 · ADR-019 머리말에 "셋째 호출" 한 줄(결정 본문은 ADR-020 개정 때).
- 커밋: `feat(analyze) - 셋째 패스 '제안' — 갱신이 생긴 장소마다 지금 값과 글들을 같이 읽고 칸별 제안을 후보에 싣는다`

#### [ ] T2.2 제안을 보여 주고 기본 체크로 쓴다

- 근거: 요구 ④ 뒷부분 · 4-3 마지막 줄 · U6.
- 선행: T1.3 · T1.4 · T2.1.
- 단계: 세 칸의 셋째 칸이 `proposal` 을 읽는다(`change` 만 · `why` · 근거 글 링크). `제안 없음` 상태(null) 를 **따로** 그린다(`adminVerify.ts` 의 `verifyView` 와 같은 어법 — 순수 함수 `proposalView`). 체크 기본값 = `change` 칸, 완화 칸은 끈다(`policyDirection`, T2.3). 일괄 덮어쓰기(`bulkLatestTargets`)는 제안이 켠 칸만.
- 수용 기준: `proposal` 없는 갱신 묶음에 초록 표식이 없다(테스트) · `superseded` 행의 제안은 그리지 않는다.
- 커밋: `feat(admin) - 갱신 묶음의 셋째 칸에 제안 — 없으면 '제안 없음'`

#### [ ] T2.3 시간 규칙과 방향 — `stale` · 충돌 · 강화/완화

- 근거: G7·G8 · U5·U6.
- 선행: T1.1(`stale` 분기는 거기서 섰다 — 여기는 방향).
- 단계: `src/lib/policyDirection.ts`(순수) — `TPetPolicyFacts` 전·후를 받아 칸마다 `tighten | loosen | neutral`(무게 제한 생김/줄어듦 · 마릿수 줄어듦 · 실내 free→cage/outdoorOnly · largeDogOk true→false · 요금 인상 = tighten, 반대 = loosen, notes 변경 = neutral). `TPetPolicyFacts` 에 칸이 늘면 여기도 늘어야 한다 — `readNothing` 과 같은 함정이라 테스트가 칸 목록을 대 본다. 화면: 완화 줄에 `전화로 확인해 주세요`, 체크 기본 꺼짐(🙋 2). 후보 ↔ **사이트** 주소가 다르면 지금의 `주소 다름` 흐름(`addressConflictOf`)이 같은 자리에서 멈춘다 — AI 는 안 본다.
- 수용 기준: 테스트 — 15kg→10kg 은 tighten · 10kg→15kg 은 loosen · 칸 누락 테스트.
- 커밋: `feat(admin) - 조건 변화의 방향 — 강화는 바로, 완화는 확인 뒤`

#### [ ] T2.4 수집 완료 칸이 "기존 가게를 쓴 글" 의 수를 말한다

- 근거: G10.
- 읽을 것: `src/lib/adminPosts.ts` · `src/screens/adminPagePostsPanel.tsx` · `blog_posts.analysis.excluded[].reason`.
- 단계: `countExcludedReasons(client)` — 분석된 글의 `analysis->excluded` 를 `range` 로 나눠 받아 클라이언트에서 센다(09 T3.3 의 `fetchPromptVersions` 와 같은 길 — 두 칸만). 명령 줄 옆에 `기존 가게를 쓴 글 N · 같은 말 M · 옛 글 K`. 옛 `alreadyHave` 는 `같은 말` 에 합산.
- 커밋: `feat(admin) - 수집 완료 칸에 기존 가게를 쓴 글의 수 — 게이트가 일하는 것이 보인다`

### P2 — 이어 붙이기

#### [ ] T3.1 09 · ADR-020 의 D6·D7 을 이 문서의 U1 로 고친다

- 근거: 4-2 마지막 문단 — D7 의 특례(T5.1 "출처 집합을 넘긴다")가 필요 없어졌고 D6 의 문장이 좁아진다. 09 의 T5.1 은 **T1.1 로 대체**, T5.3 의 `갱신 제안` 칩은 T1.2 의 `갱신` 칩이다.
- 단계: 09 머리말 vN · D6·D7 · T5.1 에 "→ 11 T1.1" · ADR-020 D6·D7 개정(🙋 1~6 이 닫힌 뒤) · README 트래커.
- 커밋: `docs(todo/09, ADR-020) - D6·D7 을 차이 게이트로 — 출처 특례를 걷는다`

#### [ ] T3.2 사용자 제보 `policy` 와 갱신 묶음을 같은 자리에서

- 근거: G11. 등록 완료 칸의 제보(`조건이 달라요`)와 검수 대기의 갱신 묶음이 같은 가게를 가리키면 **서로 링크**(장소 줄에 `검수 대기에 갱신 1`, 갱신 묶음에 `사용자 제보 N`). 제보를 제안의 입력에 넣는 것은 하지 않는다 — 제보는 한 줄 메모라 인용 검증(`quoteInBody`)을 못 지난다.
- 커밋: `feat(admin) - 같은 가게의 제보와 갱신 묶음이 서로 보인다`

#### [ ] T3.3 사이트의 출처 여러 개 — 범위 밖, 07 로

- 근거: §6. 여기서는 `place_sources` 가 쌓이는 것만 보장한다(G12 · H.4).

## 10. 🧑 사람 손

| # | 무엇 | 언제 |
|---|---|---|
| H.1 | **첫 갱신 물결의 크기** — `blog_posts.analysis->'excluded'` 에서 `alreadyHave` 수를 세고(`supabase db query --linked`), 그중 몇이 사이트와 다른 조건을 적었는지 10건쯤 손으로 대 본다. 🙋 6 의 근거 | T1.1 전 |
| H.2 | 제안 패스 첫 실측 — `pnpm data:analyze --dry-run --limit 5` 로그에 `갱신 N · 제안 N`, 토큰 계량기 세 줄. `PROPOSE_MODEL` 결정 | T2.1 뒤 |
| H.3 | 🙋 1~6 답 | T1.2 전(1) · T2.2 전(2·3) · T2.1 전(4) · T1.1 전(5·6) |
| H.4 | G12 확인 — 등록 완료 장소 하나를 `덮어쓰기` 한 뒤 `place_sources` 에 그 글이 있는지(한 줄·일괄 둘 다). 없으면 09 T5.3 그대로, 있으면 09 v3 의 그 줄을 정정 | T1.4 전 |
| H.5 | 완화 제안 하나를 실제 전화로 확인해 보고 U6 의 "전화로 확인" 문구가 운영에서 성립하는지 | T2.3 뒤 |

## 11. 09 · 10 · ADR 과의 관계

- **09(파이프라인 다섯 칸)** 와 같은 화면·같은 개체다. 이 문서는 09 의 **검수 대기 칸 안**을 넓힌다 — 탭을 더하지 않고(🙋 1), D6·D7 두 결정을 **좁히고 흡수**한다(T3.1). 09 의 T5.1·T5.3 은 이 문서의 T1.1·T1.2 가 대신한다. 나머지 09 태스크(T1.5 블랙리스트 탭 · T3.2 수집 목록 · T6.x UX)와는 독립이다.
- **10(사용자 제보)** 의 `policy` 제보는 같은 가게에 대한 또 하나의 갱신 신호다(G11, T3.2). `verified_at`(ADR-021 R5)은 이 문서의 시간 축(U5·U8)이 **그대로 가져다 쓰는** 칸이다 — 새 칸을 만들지 않는다.
- **ADR-017**(AI 판단은 원문 근거) · **ADR-019**(두 번 부른다 · 주소는 규칙) 의 원칙을 셋째 패스에도 같은 모양으로 적용한다(4-3 의 `sanitizeProposal`). 결정이 확정되면 ADR-019 에 "셋째 호출" 절을 더하거나 ADR-020 개정에 묶는다 — 새 ADR 을 만들지 않는 쪽을 권장한다(둘 다 "분석이 무엇을 올리나" 의 결정이다).
- **ADR-018**(승인이 곧 반영 · 화면은 Claude 를 못 부른다)은 그대로다 — 이 문서가 더하는 쓰기는 `verified_at`(이미 있다)과 `extracted.proposal`·`superseded`(후보 jsonb) 뿐이고, 새 표·새 GRANT 가 없다.
