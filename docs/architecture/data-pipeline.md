# 데이터 파이프라인 — Supabase → src/data

> 최종 수정: 2026-10-01 (v24: `archived` 짝은 블랙리스트에 없을 때만 생긴다 — 등록 해제 폼이 `place_blocks` 를 같이 쓰므로(09 T1.4) 이름 축에서 먼저 걸리고, 되살리면 풀린다)
> 이전 (v23: 제외 넷째 이유 `blocked` — 분석이 `place_blocks` 를 읽어 걸린 가게는 후보를 만들지 않는다. 표가 없으면 차단 0건 + 경고 한 줄)
> 이전 (v22: 스키마 요약에 `place_blocks`(가게 차단 목록, 마이그레이션 `20261001120000`, 원격 미적용) 한 줄 — [ADR-020](../decisions/ADR-020-pipeline-stages-and-blocklist.md))
> 이전 (v21: 제외 이유 `edited` — 사람이 고친 pending 후보가 있는 같은 글·같은 가게는 다시 읽어도 새로 만들지 않는다. 고친 이름의 원래 키는 `extracted.editedFrom.nameKey`)
> 이전 (v20: 「재분석」 머리에 "지우지 않는다 — 수집 완료로 되돌린다" 한 줄)
> 이전 2026-09-30 (v19: **AI 판단의 요금이 구조가 됐다** — `feeLines: string[]` → `fees: TFeeRule[]`(금액·마리당/정액·몸무게 경계·몇째 마리부터·1박당),
> 앱이 칸으로 계산한다. 그리고 AI 판단이 있으면 앱은 정규식으로 메우지 않는다([ADR-017](../decisions/ADR-017-ai-structured-pet-policy.md) v5). `PROMPT_VERSION` 이 바뀌었다 — 요금 계산을 받으려면 재분석)
> 이전 (v18: 재분석 1·2단계(후보 눕히기 · `analyzed_at` 비우기)가 `/admin` 의 버튼이 됐다 — 손으로 할 일은 3단계 `data:analyze` 뿐)
> 이전 (v17: 재분석 값을 기존 장소에 반영하는 길 — `/admin` 의 **최신본으로 저장하기**(합치기는 빈 칸만 채워 새 판단이 안 들어간다))
> 이전 (v16: **공식 홈페이지 카드** — `places.homepage_url·homepage_name·homepage_image`(마이그레이션 `20260930120000`) →
> `TPlace.homepage`. 채우는 길은 `data:analyze`(새 후보)·`data:homepage`(쌓인 pending 후보) → 승인. 사진은 URL 만([ADR-002](../decisions/ADR-002-no-place-photos.md) v3))
> 이전 (v15: **AI 판단의 요금이 목록이 됐다** — `TPetPolicyFacts.feeText`(문장 하나) → `feeLines: string[]`(기준마다 한 줄).
> `PROMPT_VERSION` 이 바뀌었다 — 옛 프롬프트로 분석된 글을 다시 읽히려면 `analyzed_at` 을 비우고 그 글의 `pending` 후보를 눕힌다(아래 「재분석」))
> 이전 (v14: **이미 게시된 곳은 후보를 만들지 않는다** — 짝짓기 결과가 `auto`(≥0.85)이고 그 짝이
> `published` 면 `candidates` 행을 넣지 않고 `analysis.excluded` 에 `alreadyHave` 로만 남긴다(`skipAsExisting`).
> 승인해도 하는 일이 기존 행의 **빈 칸 채우기**뿐인데 검수 목록에서는 신규와 같은 무게로 한 줄을 먹었다.
> ⚠️ **`draft`·`archived` 짝은 막지 않는다** — 전자는 초안을 게시로 올리는 유일한 길이고, 후자는 내린 가게가 다시
> 열렸다는 유일한 신호다. **비용은 줄지 않는다**(추출·네이버 조회가 끝난 뒤의 판정이라 DB 쓰기만 아낀다))
> 이전 (v13: **분석이 Claude 를 두 번 부른다** — 추출 뒤 「교차점검」 패스([ADR-019](../decisions/ADR-019-ai-cross-check-and-address-rules.md)).
> 동반 조건 문장이 **없는** 후보만 묶어 글당 한 번, "강아지를 데리고 들어간 근거가 본문에 있나" 를 다시 묻는다 — 추출 패스는
> "반려견 동반 여행기" 를 전제로 읽어 강아지를 두고 들른 일반 카페도 장소로 뽑았다. ⚠️ **`--limit` 을 절반으로 본다**(`--no-verify` 로 끈다).
> 함께: 후보의 두 주소 대조가 문자열 비교에서 규칙(`src/lib/addressMatch.ts`)으로 — 실측 43쌍 중 39쌍이 `제주특별자치도`↔`제주` 뿐이었다)
> 이전 (v12: **`archived` 에 사람이 누르는 길이 생겼다** — `/admin` 의 '올린 장소' 칸에서 내리고 되살린다([ADR-018](../decisions/ADR-018-in-app-admin-review.md)).
> 그리고 **대조 corpus 가 `archived` 까지 읽는다**(세 곳 모두): 빼 두면 내린 곳을 쓴 새 글이 '신규' 가 돼 같은 가게가 새 id 로 되살아났다.
> 재빌드도 둘 바뀌었다 — `published` 가 끼는 변경만 훅을 부르고, 부른 결과가 `rebuild_log` 에 남아 `/admin` 머리글에 한 줄로 뜬다)
> 이전 (v11: **운영자 검수 화면 `/admin` 이 두 번째 쓰기 경로가 됐다**([ADR-018](../decisions/ADR-018-in-app-admin-review.md)) — 브라우저가 `apply-approved.mjs` 와
> 같은 순서로 `pending → approved → merged` 를 한 번에 밟고, **신규 장소는 곧바로 `published`** 다(CLI 는 그대로 `draft`). 그래서 "런타임 fetch 없음" 은
> **사용자 화면에 대한 말**로 좁혀 적었다 — 운영자 화면 하나는 publishable 키로 Supabase 를 직접 부른다)
> 이전 (v10: **첫 `data:analyze` 실측(글 50건 → 후보 160건)과 설계 검토를 반영** — 이용 조건의 구조화를 AI 가 뽑을 때 판단한다
> ([ADR-017](../decisions/ADR-017-ai-structured-pet-policy.md), `petPolicy`·`places.pet_policy`) · 추출 필드에 `visited`(목록 글 표식)·`petAllowed`(동반 불가면 후보 제외)·숙소 요금/용품 ·
> 글 단위 결과가 `blog_posts.analysis` 에 남는다(후보 0건의 이유·프롬프트 버전) · 같은 가게의 후보는 `nameKey`/`dupOf` 로 묶인다 · 한 실행에 블로그당 2건(`--max-per-blog`) ·
> `--dump` 로 후보를 로컬 JSON 으로 · **검수 창 `pnpm data:review`**(묶음 · 정규식/AI/앱 판정 미리보기 · 승인/반려) · 반영 게이트(지역 없으면 pending 되돌림 · ask 구간 재대조는 사람에게) ·
> 마이그레이션 `20260928150000`. 빈 이용 조건이 '갈 수 있어요' 로 판정되던 [BUG-008](../bugs/BUG-008-empty-pet-policy-judged-ok.md) 고침)
> 이전 (v9: **좌표 보강에 두 번째 축(주소 → 좌표, NCP Geocoding)이 생겼다** — 이름 축이 못 붙인 후보에만 붙고
> 키가 다르다(Maps Application). 「왜 그 5곳인가」 의 선택지 목록에 이 축을 더했지만 **그 5곳에는 닿지 않는다**(후기가 수집 창 밖이다))
> 이전 (v8: **좌표 미확보 5곳의 이유를 실측해 적었다** — 데이터가 아니라 네이버 쪽에 그 플레이스 엔트리가 없다.
> 스크레이퍼를 다시 돌려도, `data:analyze` 의 좌표 보강으로도 채워지지 않는다는 것까지 근거와 함께 남겼다)
> 이전 (v7: 4a 는 끝났다 — `vercel.json` 의 `buildCommand` 가 `pnpm data:pull && pnpm build` 로 커밋돼 프로덕션이 그 경로로 Ready(실측).
> "아직 안 바뀌어서 커밋된 스냅샷을 쓴다" 는 문장과 "잠들어도 마지막 스냅샷으로 빌드된다" 를 걷었다 — 배포는 `data:pull` 로 시작하므로 DB 가 잠들면 재배포가 막힌다.
> JWT expiry 43200 반영 — `--limit` 을 나누는 이유는 이제 세션 창이 아니라 구독 5시간 한도)
> 이전 (v6: GitHub Actions 폐지 — 수집·분석·반영은 사용자 터미널에서 `pnpm data:collect` → `data:analyze` → `data:apply`(운영자 세션). 인증 출처는 둘 —
> 세션(JWT)+RLS 와 publishable(anon). service 키는 env 에 있으면 쓰기 스크립트가 멈춘다. 네이버 키는 env 또는 TTY 숨김 입력. ADR-016 v5)
> 이전 (v5: 인증 출처 세 가지 — Actions 는 service_role env, 로컬은 `pnpm data:login` 세션(JWT)+RLS, Vercel 빌드는 publishable(anon). ADR-016 v4)
> 이전 (v4: 키는 CI·Vercel 에선 env, 로컬에선 로그인된 `supabase` CLI 에게 실행 시점에(ADR-016). `.env.local` 은 선택 설정만)
> 이전 (v3: "수집 · 분석 · 승인" 절을 실제 흐름·상태 머신으로. Claude 는 구독 `claude -p`. Vercel 빌드 명령 전환[4a]·`fromPlaceRow`)
> 이전 (v2: 원본을 Supabase 로 전환[ADR-015]. Notion 경로는 1회 시드 이력으로 내리고, 갱신 경로·`sort`·`data:normalize` 의 바뀐 역할을 적음)
> 이전 (v1: 신설 — Notion 이 원본이던 시절)

## 개요

**사용자가 보는 화면**이 읽는 데이터는 여전히 `src/data/` 의 JSON 세 개가 전부이고, 그 화면들엔 **런타임 fetch 가 없다.** 바뀐 건 그 JSON 을
누가 만드느냐다 — 원본은 이제 **Supabase**([ADR-015](../decisions/ADR-015-supabase-source-and-rebuild.md))고,
Notion 은 1회 시드 경로로만 남는다.

예외가 하나 있다: **운영자 검수 화면 `/admin`** 은 publishable 키로 Supabase 를 직접 읽고 쓴다([ADR-018](../decisions/ADR-018-in-app-admin-review.md)).
숨은 하위 화면이고 로그인·RLS 안에서만 동작하며, 장소·준비물 화면은 그 코드를 거치지 않는다.

```mermaid
flowchart LR
  N[(Notion 공개 페이지<br/>1회 시드, 지금은 안 씀)] -.->|pnpm data:seed<br/>완료됨, 재현용| SB[(Supabase<br/>places · items)]
  Studio[Supabase Studio<br/>손 편집] --> SB
  Blog[블로그 수집 · AI 분석 · 승인<br/>todo/02·03, 진행 중] -.-> SB
  SB -->|pnpm data:pull| P[src/data/places.json]
  SB -->|pnpm data:pull| I[src/data/items.json]
  M[src/data/meta.json<br/>손으로 관리] --> B[next build]
  P --> B
  I --> B
```

- 장소·준비물 화면은 런타임에 아무것도 fetch 하지 않는다. 장소 86곳(숙소 26·식당 34·카페 26), 준비물 15가지 — 지금까지와 동일
  (승인한 장소가 `data:pull` 로 들어오면 86 을 넘는다). `/admin` 만 예외다(위 예외 문단).
- 갱신은 여전히 사람이 **재배포를 일으켜야** 반영된다. Vercel 빌드 명령은 `pnpm data:pull && pnpm build` 다(`vercel.json` 의 `buildCommand`, [todo/00](../todo/00-setup-supabase-vercel.md) 4a —
  끝났고 프로덕션 Ready 로 실측됐다), 그래서 **배포될 때마다 DB 를 새로 읽는다** — 커밋된 `src/data/*.json` 은 키 없이 `pnpm dev`·`pnpm test` 를 돌리기 위한 스냅샷이고, 배포 빌드는 그 위에 `data:pull` 결과를 덮어쓴다.
  아직 없는 것은 4b 뿐이다: 승인이 **저절로** 재배포를 일으키는 DB 웹훅 → Deploy Hook. 그전까진 push 나 Redeploy 가 그 방아쇠다.

## 갱신 경로 — `pnpm data:pull`

- 데이터를 고치는 곳은 이제 Supabase Studio(나중엔 관리 화면)지 Notion 이 아니다.
- `scripts/pull-db.mjs`(`pnpm data:pull`) 가 `status='published'` 인 `places`·`items` 를 읽어 `src/data/places.json`·
  `items.json` 을 다시 쓴다.
- `src/data/*.json` 은 계속 **커밋**한다 — 키 없이도 `pnpm dev`·`pnpm test`·로컬 `pnpm build` 가 돌아야 해서다.
  **다만 4a 뒤로 이 스냅샷은 배포의 안전망이 아니다**: 배포 빌드는 `data:pull` 로 시작하므로, Supabase 가 무료 티어 7일 비활성으로 잠들면
  `data:pull` 이 exit 1 이고 **재배포가 막힌다**(이전 배포는 그대로 산다 — [todo/05](../todo/05-security.md)). 조용히 옛 데이터로 빌드되지 않게 한 것이 의도다.
- 접속이 안 되면 `data:pull` 은 조용히 옛 스냅샷을 쓰는 대신 **명확히 실패한다**(`exit 1`) — Vercel 빌드가 조용히 옛 데이터로
  돌아가는 사고를 막기 위해서다. 인증은 `scripts/lib/supabaseClient.mjs` 가 고른다([ADR-016 v5](../decisions/ADR-016-secrets-by-login.md)) — 출처는 **둘**뿐이고
  스크립트 종류가 정한다: `data:pull`(readOnly)은 publishable 키만(anon), 쓰기 스크립트(seed·collect·analyze·apply)는 키체인의 운영자 세션(`pnpm data:login`, 만료면 멈춘다).
  `data:pull` 은 세션이 있어도 **항상 anon** 이라 Vercel 빌드와 로컬이 같은 경로로 돌고, RLS 가 `places(published)`·`items` select 만 연다. 결과가 비면 파일을 덮어쓰지 않고 exit 1.
  쓰기 스크립트는 세션이 없으면 그 자리에서 "pnpm data:login" 으로 멈춘다. service_role 키는 어디서도 안 쓴다 — env 에 남아 있으면 쓰기 스크립트는 **멈추고**(트립와이어),
  `data:pull` 은 anon 으로 계속 가되 무시한 env 이름을 경고 한 줄로 찍는다. URL·publishable 키는 코드 상수(공개값). 어느 출처로 붙었는지는 첫 로그 줄 `Supabase 인증: …` 이 말한다.
  레포에 env 파일 없음 — `data:*` 는 env 파일을 읽지 않는다(`ANALYZE_MODEL` 은 셸 env 로).

## 두 입구가 같은 바이트를 내는 이유 — `scripts/lib/placeFields.mjs`

`parseRegion`·`parsePrice`·`clean`·`toPlace`·`toItem`·`writeDataJson` 을 `normalize.mjs` 에서 뽑아
`scripts/lib/placeFields.mjs` 로 옮겼다. Notion 경로(`normalize.mjs`)와 Supabase 경로(`pull-db.mjs`) 가
**같은 함수**를 쓴다. `toPlace` 의 키 순서와 `writeDataJson`(들여쓰기 1칸, 끝 개행 없음)이 정확히 같아야
어느 입구로 들어와도 같은 JSON 바이트가 나오고, `git diff` 가 "진짜 바뀐 것" 만 보여준다.
실제로 시드 → `data:pull` 왕복 뒤 `git diff src/data` 가 빈 것으로 확인했다.

## `data:normalize` 는 더 이상 데이터를 만드는 명령이 아니다

예전엔 이게 유일한 데이터 생성 경로였다. 지금은 Notion 원본을 **다시 Supabase 로 시드**하고 싶을 때만 쓴다
(예: Supabase 를 새로 만들어야 하는 재해복구 상황). 평소 갱신은 `data:pull` 이다.
`data/jejudo-notion-export.json` 은 여전히 레포에 있다 — "다음 갱신 소스" 가 아니라 **1회 시드의 근거 기록**이다.

## `sort` 컬럼

Postgres 테이블엔 원래 순서 개념이 없는데, 화면은 "종류별 → Notion 원래 순서" 를 그대로 보여준다(준비물 카드
나열, 장소 목록 정렬 등). 시드할 때 배열 인덱스를 그대로 `places.sort`·`items.sort` 에 넣어 이 순서를 보존했다.
새로 추가되는 행은 `sort=null`, `data:pull` 은 nulls last 로 정렬해 새 행이 끝에 붙는다.

## `archived` 는 pull 에서 빠진다 — 그것이 곧 소프트 삭제다

`places.status` 는 `draft`/`published`/`archived` 세 가지고, `data:pull` 은 `published` 만 가져온다. 그래서
`archived` 로 내린 장소는 `places.json`·라우트·프리캐시에서 사라지고, 저장 목록에서도 함께 빠진다 —
`selectSavedPlaces` 가 `PLACES.filter` 라 모르는 id 는 오류 없이 버려진다(`src/lib/places.ts`).

**2026-09-29 부터 그 한 칸을 사람이 화면에서 바꾼다** — `/admin` 의 '올린 장소' 칸([features/admin-review](../features/admin-review.md)).
하드 삭제는 없다: GRANT 가 authenticated 에 `delete` 를 주지 않으므로(`20260922120000_narrow_grants.sql`)
브라우저에서 행을 지우는 길은 처음부터 42501 이고, `status` 한 칸이 유일한 수단이다. `places` 가 바뀌었으니
재빌드 트리거가 그 빌드를 알아서 부른다 — 내림에 새 장치를 붙이지 않았다.

⚠️ **대조 corpus 는 `archived` 를 빼지 않는다.** 빼면 내린 곳을 쓴 새 글이 `matchPlace` 에서 '신규' 로
판정돼, 승인 한 번에 **같은 가게가 새 id 로 되살아난다**(빌드·테스트는 전부 통과한다). 그래서 세 곳
(`analyze-candidates.mjs` · `apply-approved.mjs` · `src/lib/adminCandidates.ts`)이 상태를 가리지 않고 읽고,
짝이 내린 곳이면 CLI 는 영구 실패로 멈추고 화면은 '되살려서 합치기 / 아니에요' 를 묻는다.
점수가 **같을 때만** 살아 있는 쪽을 고른다(`matchPlace.mjs` 의 `preferLive`) — 점수가 다른데 내린 쪽을
밀어내면 조용히 틀린 병합이 되고, 내린 쪽이 이기면 사람에게 물으므로 **눈에 보이게** 실패한다.

"폐업" 을 사용자에게 보여주고 싶으면 archived 도 pull 해서 화면에 상태를 그려야 하는데, 이건 기능 변경이라
지금 범위 밖이다([todo/01](../todo/01-schema-and-seed.md)).

## 이미지

`places` 테이블에 `images` 컬럼은 없다. `data:pull` 은 항상 `images: []` 를 쓴다. `TPlace` 계약(코드가 읽는
타입)은 그대로 남겨 뒀지만(→ [ADR-002](../decisions/ADR-002-no-place-photos.md), 사진 없음이 기본 디자인),
실제 값을 채우는 경로는 지금 없다.

사진이 화면에 나오는 길은 둘이고 **둘 다 파일을 갖지 않는다**(ADR-002 v2·v3):

- **네이버 플레이스 사진 탭으로 보내는 버튼** — `naverPlaceId` 에서 주소를 만든다. `naverUrl` 은 `naver.me` 단축 링크라 쓸 수 없다.
- **공식 홈페이지 링크 카드** — `places.homepage_*` 세 칸 → `TPlace.homepage`. 주소가 없으면 키째 빠져 시드 86곳의 `places.json` 바이트는 그대로다.
  분석이 카드를 만드는 것은 그 세 칸이 DB 에 있을 때뿐이다(`data:analyze` 가 먼저 확인하고 없으면 카드만 끈다) — 없는 칸을 실은
  후보를 승인하면 insert 가 통째로 거절되기 때문이다. 같은 이유로 `toNewPlaceRow` 는 카드가 있을 때만 그 칸을 싣는다.

## 파싱은 여전히 런타임

이용 조건은 여기서 구조화하지 않는다. `petPolicyText` 원문을 `places` 에 그대로 두고 런타임에
`parsePetPolicy()` 가 읽는다([pet-policy-and-eligibility.md](./pet-policy-and-eligibility.md)). 블로그에서 AI 가
뽑아내는 조건도(todo/03) 같은 원칙 — **원문 문장으로** 넣는다. 파서 규칙을 고칠 때 데이터를 다시 만들 필요가
없게 하기 위함이다.

읍면·방향(`TRegion`)·숙소 요금(`TStayPrice`) 변환 로직 자체는 그대로다. 다만 이제 그 함수는
`scripts/lib/placeFields.mjs` 의 `parseRegion`·`parsePrice` 이고, 두 입구(Notion 재시드 / Supabase pull) 가
공유한다.

## 수집 · 분석 · 승인 (첫 실행 2026-09-28 — 글 50건 → 후보 160건, 네이버 키 없이)

**사용자 터미널에서** `pnpm data:collect` → `pnpm data:analyze` → (검수·승인) → `pnpm data:apply` 를 순서대로 돌린다 — 스케줄·CI 없음
(검수·승인은 2026-09-29 부터 앱 안 `/admin` 이 기본이고, 거기서 승인하면 `data:apply` 단계까지 그 클릭이 대신한다 → [ADR-018](../decisions/ADR-018-in-app-admin-review.md)·[features/admin-review](../features/admin-review.md))
(ADR-016 v5, GitHub Actions 폐지). 셋 다 운영자 세션(`pnpm data:login`)이 필요하고, `data:collect` 는 네이버 검색 키까지 필요하다 — env
(`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`)로 넘기거나 없으면 터미널 숨김 입력으로 받는다(어디에도 저장 안 함 · 에이전트 세션에서는 입력을 거부).
그래서 수집은 사용자 몫이고 에이전트는 `data:analyze`·`data:apply` 만 돌린다. `blog_posts` 는 사용자가 돌릴 때만 찬다. 진행·결정은
[todo/02](../todo/02-collect-naver-blog.md)·[todo/03](../todo/03-analyze-and-review.md).

```mermaid
flowchart LR
  K[keywords.json] -->|네이버 검색 API · 최근 1년| P[(blog_posts)]
  P -->|analyzed_at null 인 글| B[본문 HTML<br/>그 자리에서만 읽고 버림]
  B -->|claude -p --json-schema<br/>구독, API 키 없음| E[장소 0~N개<br/>petPolicyText 는 원문 그대로]
  E -->|조건 문장 없는 후보만 · 글당 1회<br/>claude -p 두 번째 패스| V[교차점검<br/>동반 확인 / 근거 없음 / 불가 정황]
  V -->|네이버 지역 검색: 이름 완전 일치만| G[좌표·주소·regionRaw]
  G -->|matchPlace vs places<br/>상태 무관 — archived·draft 포함| C[(candidates<br/>pending · tier auto/ask/new)]
  C -->|사람: /admin · pnpm data:review · Studio<br/>묶음 · 정규식/AI/앱 판정 미리보기| A{approved?}
  A -->|approved → data:apply| PL[(places<br/>빈 칸만 채움 · 신규는 draft)]
  A -->|/admin 의 '맞아요' — 승인과 반영이 한 번| PP[(places<br/>빈 칸만 채움 · 신규는 published)]
  A -->|rejected| X[끝]
  PL -.->|published 는 사람이 올림| PULL[data:pull → 재빌드]
  PP -.->|다음 빌드에서 보인다| PULL
```

첫 실행에서 배운 것 넷(2026-09-28, 설계 검토 45건 중 검증 31건 반영):

- **이용 조건의 구조화는 AI 가 뽑을 때 판단한다**([ADR-017](../decisions/ADR-017-ai-structured-pet-policy.md)). 원문(`petPolicyText`)은 그대로 두고 `petPolicy`(실내·리드줄·무게·마릿수·요금…)를
  함께 뽑아 `places.pet_policy` 에 저장한다. 앱은 있으면 **판정을 그 값만으로** 정한다(`withPolicyFacts`, ADR-017 v5 — null 을 정규식으로 메우지 않는다). 정규식은 시드의 경로이자 검수의 대조군. 블로그 구어체 32건 중 20건을 정규식이 못 읽은 것이 계기다.
  **요금은 구조의 배열이다**(`fees`, ADR-017 결정 9) — 줄마다 표시용 `label` 과 계산용 칸(`amountWon`·`basis`·`minKg`/`maxKg`·`fromDog`·`perNight`).
  옛 후보·장소는 `feeText`(한 칸)나 `feeLines`(줄 목록)만 들고 있고 읽는 쪽이 `feeLinesOf` 로 합쳐 본다 — 소급 마이그레이션은 하지 않는다(요금 계산은 줄을 읽던 길로 물러난다).
- **후보 0건의 "왜" 가 `blog_posts.analysis` 에 남는다** — `{ model, promptVersion, candidates, candidateNames, excluded:[{name,type,reason}], skip }`. 제외 이유는 넷:
  `notJeju` · `other`(관광지·운동장 — 이름은 남는다) · `notAllowed`(본문이 동반 불가라고 함, [BUG-008](../bugs/BUG-008-empty-pet-policy-judged-ok.md)) ·
  **`alreadyHave`**(이미 게시된 곳 — 아래). 본문 인용은 넣지 않는다.
  **`blocked`**(넷째 이유) — 실행 시작에 `place_blocks` 를 읽어(`dry-run` 도 읽는다) 추출 직후 `blockFor` 로 건다: `name_key` 가 후보 이름 키와 같고, `town` 이 null 이거나 후보의 읍·면과 같거나 후보의 읍·면을 모르고,
  `lifted_at` 이 null 이고 `until` 이 null(영구)이거나 실행 시작 시각보다 뒤인 행. 만료는 비교이고 스케줄러는 없다([ADR-020](../decisions/ADR-020-pipeline-stages-and-blocklist.md) D1·D2).
  요약 줄에는 제외 합계 안 `· 차단 N`. **표가 원격에 없으면(마이그레이션 미적용) 조회 실패를 차단 0건으로 보고 경고 한 줄만 찍고 계속 간다.**
  **`edited`**(사람이 고친 후보가 이미 있는 같은 글·같은 가게 — 아래 「재분석」)도 추출 직후에 걸리지만 `excluded[]` 에만 남고 요약 줄에는 제외 합계 밖 `· 고침 유지 N` 로 따로 적는다.
  앞의 셋은 추출 **직후**(`exclusionReason`)에 걸리고 `alreadyHave` 만 **짝짓기 뒤**에 걸린다 — 단계가 다르지만 요약 한 줄에서는
  한 괄호에 넣는다(운영자가 읽는 뜻은 "후보로 안 들어간 수" 하나이고, 자리를 나누면 그 합을 사람이 더해야 한다).
  프롬프트를 고치면 `PROMPT_VERSION`(스키마+프롬프트의 sha256 앞 8자)이 바뀌고, `analysis->>'promptVersion'` 이 다른 글만 골라 재분석할 수 있다.

  ### 재분석 — 프롬프트를 고친 뒤 같은 글을 다시 읽힌다

  **지우지 않는다 — 글을 수집 완료(`analyzed_at` 비움)로 되돌리고, 그 글의 검수 대기 후보만 목록에서 뺀다. 등록한 장소는 그대로.**

  **사람이 고친 후보는 다시 읽어도 되살아나지 않는다**(D3). 분석이 실행 시작에 읽은 pending 중 `reviewer_note` 에 `[admin] 고침` 이 있는 행의
  (`post_url`, `nameKey`) 집합(`editedKeysFor`)에 걸리는 추출은 후보를 만들지 않는다(제외 이유 `edited`). 이름을 고친 행은 `nameKey` 가 새 이름으로
  다시 계산되므로 `extracted.editedFrom.nameKey`(처음 고치기 전 키, 처음 한 번만)도 집합에 넣는다 — 이미 고친 뒤의 행은 그 키가 없어 지금 키만 걸린다.
  같은 가게라도 **다른 글**이면 만든다(새 근거). 머리표 `[admin] 고침` 은 `EDITED_NOTE`(TS)와 `analyzeCandidates.mjs` 의 상수 둘이고 테스트가 같은 값인지 묶는다.

  **`data:analyze` 에 그 스위치는 없다.** 글을 고르는 조건은 `analyzed_at is null` 하나뿐이라(`analyze-candidates.mjs:207`),
  재분석은 **DB 를 손으로 되돌려** 그 조건에 다시 걸리게 하는 일이다. 순서가 중요하다:

  **1·2단계는 `/admin` 의 `분석 지우고 다시 읽기`(한 줄) · `고른 것 재분석 준비`(여러 줄)가 한다**(`src/lib/adminReanalyze.ts`,
  [admin-review 「분석 지우고 다시 읽기」](../features/admin-review.md)). 아래는 그 버튼이 지키는 규칙이자, 버튼 없이 손으로 할 때의 절차다.

  0. **지금 버전을 코드에서 읽는다** — 문서에 적어 두면 프롬프트를 한 번 더 고친 순간 거짓이 된다:
     `node -e "import('./scripts/analyze/extractPlaces.mjs').then(m=>console.log(m.PROMPT_VERSION))"`.
     그 값과 다른 `analysis->>'promptVersion'` 을 가진 글이 재분석 대상이다.
  1. 되돌릴 글의 `pending` 후보를 **먼저 치운다.** 안 치우면 같은 가게의 후보가 옛 판단·새 판단 두 벌로 쌓이고,
     `groupCandidates` 가 그것을 한 묶음으로 묶어 대표(`lead`)를 confidence 로 고른다 — 운영자가 보는 한 줄이 어느 판단인지 알 수 없다.
     **지우는 것이 아니라 `status = 'rejected'` 로 눕힌다** — `candidates` 의 GRANT 에 delete 가 없다(`20260922120000_narrow_grants.sql`,
     `places` 의 소프트 삭제와 같은 경계). 행이 남으니 옛 판단과 새 판단을 나중에 대 볼 수도 있다.
     `approved`·`merged`·`rejected` 는 건드리지 않는다(사람이 이미 결정한 것이다).
     **사람이 고친 후보(`reviewer_note` 에 `[admin] 고침`)도 뺀다** — 눕히면 그 손질이 새 후보에 묻힌다(`EDITED_NOTE`, `src/lib/adminApply.ts`).
     눕힐 때 `reviewer_note` 에 `[admin] 재분석` 한 줄을 덧붙여 사람이 반려한 것과 구별해 둔다(반려 사유 칩·집계가 이 칸을 읽는다).
  1-1. **글 단위로 되돌린다.** 글 하나를 다시 읽으면 그 글의 장소가 **전부** 다시 후보가 된다 — 요금 문장이 있는 후보만
     골라 눕히면 형제 후보가 새 행으로 또 생겨 같은 가게가 두 줄이 된다(`dupOf`·`중복표시`).
  2. 그 글의 `analyzed_at` 을 `null` 로 되돌린다. `analysis` 는 두어도 된다 — 다음 실행이 덮는다.
  3. `pnpm data:analyze --limit 2` 로 **먼저 두 건만** 돌려 결과를 `/admin` 에서 확인한 뒤 나머지를 돌린다.
     `claude -p`(구독)를 쓰므로 5시간 한도를 한 번에 태우면 그 실행이 중간에 멈춘다.

  ⚠️ 승인·반려로 **사람이 이미 결정한 글을 되돌리면 그 결정이 되살아나지 않는다** — 후보만 다시 생긴다.
  재분석한 값을 **이미 있는 장소에 반영**하려면 `/admin` 의 **최신본으로 저장하기**를 쓴다 — 합치기는 빈 칸만 채워 새 판단이 안 들어간다
  ([admin-review 「최신본으로 저장하기」](../features/admin-review.md)).
  ⚠️ 재분석은 **네이버 쿼터와 Claude 한도를 다시 쓴다.** 교차점검이 켜져 있으면 `--limit` 이 사실상 절반이다(`--no-verify` 로 끈다).
  ⚠️ **`--no-geo` 로 싸게 돌리지 않는다.** 좌표가 없으면 동명 가게가 `ask` 대신 `auto` 로 판정되고, `auto` 는 곧바로
  `approved` 로 들어가 사람이 보지도 못한 채 합쳐진다(`analyze-candidates.mjs` 머리 주석의 그 이유 그대로).
  싸게 보려면 키를 그대로 두고 **`--dry-run --dump --limit 3`** 으로 돌려 JSON 의 `petPolicy.fees` 를 먼저 읽는다 — DB 에 아무것도 쓰지 않는다.
- **같은 가게가 여러 글에서 나온다** — 첫 실행에서 한 펜션(자사 홍보 블로그, 저수지의 12%)이 13건, 목록 글 하나가 101건. 그래서 한 실행에 블로그당 2건(`--max-per-blog`, 넘친 글은 닫지 않고 뒤로 밀린다),
  `extracted.nameKey`(`normalizeName`)와 `dupOf`(먼저 난 pending 후보 id)로 묶고, `visited: false`(이름만 나열된 목록 글)를 표식으로 남긴다. 후보는 그래도 넣는다 — evidence 가 다른 글이다.
- **이미 게시된 곳(`auto` + 짝이 `published`)은 후보를 만들지 않는다**(`skipAsExisting`, `scripts/analyze/analyzeCandidates.mjs`).
  그 후보를 승인해도 하는 일은 기존 행의 **빈 칸을 채우는** 것뿐인데(`applyApproved`), 게시된 86곳은 이름·소개·조건이 사람 손으로
  이미 차 있어 채울 칸이 거의 없다. 그런데 검수 목록에서는 신규와 같은 무게로 한 줄을 먹는다 — 아끼는 것은 비용이 아니라
  **운영자가 훑을 줄 수**다(추출·네이버 조회는 이미 끝난 뒤의 판정이다).
  **막는 것은 `published` 짝뿐이다.** 나머지를 막으면 조용히 길이 끊긴다 — `draft` 짝의 승인은 초안을 게시로 올리는 유일한 길이고
  (`adminApply.ts`), `archived` 짝은 내린 가게를 쓴 새 글이 났다는 뜻이라 **재개업을 아는 유일한 신호**다('되살려서 합치기'). 단 그 가게가 블랙리스트에 있으면 이름 축에서 먼저 걸려 후보가 되지 않는다(해제 폼이 함께 거는 `place_blocks`, 09 T1.4 — 되살리면 풀린다).
  `status` 를 모르면(시드·테스트 경로) 막지 않는다 — 모르는 것을 "이미 있다" 로 읽으면 후보가 조용히 사라지고, 그 반대는 사람이 화면에서 본다.
  ⚠️ **이미 쌓인 pending `auto` 후보는 그대로 있다** — `/admin` 에서 `기존` 칩으로 걸러 일괄 반려하는 것이 사람의 몫이다.
- **검수는 `pnpm data:review`** — pending 을 같은 가게로 묶어 검수 순서(`reviewPriority`, 🙋 사용자가 다듬는 자리)대로 보여 주고, 후보마다 `정규식 [..] · AI [..] · 앱 [..]` 과 표식
  (`조건문 없음` · `정규식 못읽음` · `AI≠정규식` · `지역 없음` · `좌표 없음` · `목록글` · `중복표시`)을 찍는다. `approve <id…>`·`reject <id…> --note` 로 결정을 넣고, `status` 가 published 대기 draft 와 빈 칸을 센다.
  원문·evidence 는 `--verbose`/`--md` 에서만(05 의 로그 위생). Studio 는 그대로 쓸 수 있다.

2026-09-30 에 하나 더 배웠다(사용자 지적).

- **`동반 조건 문장이 없어요` 후보에 애견 카페가 아닌 곳이 섞인다.** 추출 프롬프트가 "반려견 동반 여행 블로그" 를 전제로 읽어,
  강아지를 차·숙소에 두고 들른 평범한 카페·식당도 여행기의 장소로 뽑힌다(pending 58건 중 조건 문장 없는 것 28건). 그래서
  **두 번째 Claude 패스**가 전제를 뒤집어 다시 읽는다(`scripts/analyze/verifyPlaces.mjs`) — 판단은 후보의 `extracted.verify`
  (`{ petAllowedHere, dogWasThere, quote, why }`)에 남고, 근거가 없으면 **버리지 않고 표식만** 단다(`/admin` 의 걸러 보기로 모아 일괄 반려).
  `verify: null` 은 "근거 없음" 이 아니라 **"안 봤다"** 다 → [ADR-019](../decisions/ADR-019-ai-cross-check-and-address-rules.md).
- **후보의 두 주소(네이버 ↔ 원글) 대조는 AI 가 아니라 규칙이다**(`src/lib/addressMatch.ts`). 문자열로 비교하던 경보가 실측 43쌍 중
  40번 울려(39쌍이 `제주특별자치도`↔`제주` 뿐) 정말 다른 2쌍을 아무도 보지 않았다. 지번↔도로명은 조회해야 아는 것이라 판단 보류(`'unknown'`).

세 가지가 비직관적이다.

- **본문은 저장하지 않는다.** DB 에 남는 건 링크·제목·날짜와 AI 가 뽑은 사실·인용문(`extracted`)뿐이다(저작권·약관, ADR-002 와 같은 기준).
- **Claude 는 API 가 아니라 구독**이다. `scripts/analyze/extractPlaces.mjs` 가 `claude -p` 를 자식 프로세스로 돌리고 결과 JSON 의
  `structured_output` 을 읽는다. 인증은 이 머신에 로그인된 `claude`(키체인)뿐 — 토큰 env 는 자식 프로세스에 넘기지 않는다. 글당 비용은 0 이지만 **세션 한도를
  대화와 공유**한다 — 대량 처리는 `--limit` 로 나눈다(`--limit 30` 씩). 실행 전체가 운영자 세션 창(JWT expiry − 30분 skew) 안에도 끝나야 하는데,
  그 창은 2026-09-22 대시보드 JWT expiry 가 43200 이 된 뒤로 **11.5시간**이라 사실상 걸리지 않는다 — 지금 `--limit` 을 나누는 이유는 세션 창이 아니라 **구독 5시간 한도**다.
- **`analyzed_at` 이 "다시 안 읽는다" 의 표시**다. 후보가 0개여도, 다시 받아도 같을 실패(삭제된 글·본문 없음)여도 찍는다 — 단 그 실행에서
  성공한 글이 1건 이상일 때만(전부 실패면 파이프라인 고장으로 보고 아무것도 닫지 않는다). 잠깐의 실패(403·5xx·한도·타임아웃)는 비워 둬 재시도.

### 후보의 상태 머신

| `candidates.status` | 누가 바꾸나 | 뜻 |
|---|---|---|
| `pending` | `data:analyze` 가 만든다 | 사람이 볼 차례. `extracted.match.tier` 가 `auto`(≥0.85 — 기존 장소와 사실상 같음) · `ask`(0.4~0.85 — `match_place_id` 는 제안) · `new`(신규) |
| `approved` | 사람(`/admin` · `pnpm data:review` · Studio). `AUTO_APPROVE=true` 면 `auto` 는 자동 | `data:apply` 가 반영한다. `ask` 인데 신규가 맞으면 **`match_place_id` 를 비우고** 승인. `/admin` 에서는 이 상태가 **지나가는 자리**다 — 같은 클릭이 이어서 `places` 까지 쓰고 `merged` 로 넘긴다. 중간에 실패하면 여기 남고 `data:apply` 가 이어받는다 |
| `rejected` | 사람 | 끝. `reviewer_note` 에 이유 |
| `merged` | `data:apply` 또는 `/admin` | `places` 에 반영됐다(보강, 또는 신규 — `data:apply` 는 `draft`·`/admin` 은 `published` + `place_sources` 링크). `extracted.applied = { placeId, kind, patchKeys, at }` 로 어느 칸을 채웠는지 남는다(되돌릴 때 그 칸을 null 로) |

`data:apply` 가 **반영하지 않고 pending 으로 되돌리는** 경우(사유는 `reviewer_note`): `regionRaw` 가 없거나 형식이 아님 · 신규 후보가 현재 장소와 ask 구간(0.4~0.85)으로 닮음(같은 곳이면
`match_place_id` 를 채우고, 다른 곳이면 `extracted.match.tier` 를 `ask` 로 바꿔 재승인) · 대상이 archived(다시 연 가게면 `/admin` 의 '되살려서 합치기') · type other. 신규 숙소는 `stayPriceText`·`stayAmenitiesText` 가 `stay_*` 로 들어간다.

`places.status` 는 별개이고 **경로에 따라 갈린다** — `data:pull` 은 어느 쪽이든 `published` 만 가져온다.

| 승인한 곳 | 신규 장소가 들어오는 상태 | 사이트에 보이려면 |
|---|---|---|
| `pnpm data:apply`(터미널) | `draft` | 사람이 Studio 에서 `published` 로 올린다 → 재빌드 |
| `/admin`(운영자 화면) | **`published`** — 완성도 게이트(종류·이름·지역)를 버튼 앞에서 통과해야 눌린다 | 재빌드만 |

두 경로가 다른 이유는 [ADR-018 §4](../decisions/ADR-018-in-app-admin-review.md) 에 있다 — `draft` 단계는 "사람이 한 번 더 본다" 는 뜻이었고,
`/admin` 에서는 그 한 번이 버튼 누르기 직전에 이미 일어난다. CLI 는 그 눈이 없으므로 `draft` 를 유지한다.
기존 장소에 병합하는 경우는 양쪽 다 `status` 를 건드리지 않는다 — 단 `/admin` 은 대상이 `draft` 면 그때 `published` 로 올린다.

## 스키마 요약

`src/types.ts` 가 계약이다. 화면과 lib 는 이 타입만 본다.

| 타입 | 핵심 필드 | 비고 |
|---|---|---|
| `TPlace` | `id`, `type`, `name`, `region`, `features`, `petPolicyText`, `geo?`, `address?`, `naverUrl?`, `reviewUrl?`, `stay?` | `id` 는 Notion 블록 id 를 시드 때 그대로 옮겼다. 라우트 `/place/[id]` 와 저장 목록의 키 |
| `TStayInfo` | `price: TStayPrice`, `amenitiesText` | 숙소만. `amenitiesText` 는 준비물 화면의 구비 용품 매핑에 쓰인다(`src/lib/amenities.ts`) |
| `TItem` | `id`, `name`, `emoji`, `seasons`, `reason`, `linkUrl?`, `variants?` | 준비물. `linkUrl` 은 쿠팡 파트너스 링크라 `meta.disclosure` 를 함께 표시. `variants` 는 원본의 여러 줄을 `lib/places.ts` 의 `ITEM_VARIANTS` 가 한 항목으로 합치면서 생긴다(기내용 가방의 5kg 이하/이상) — DB·JSON 어디에도 없는 파생 필드다 |
| `place_blocks`(DB 표, `TPlace` 아님) | `name_key`, `town?`, `display_name`, `reason`, `until?`(null=영구), `lifted_at?`, `candidate_id?`, `place_id?` | 분석이 실행마다 읽는 **가게 차단 목록**(마이그레이션 `20261001120000`, 원격 미적용 — 🧑 `db push`). `until is null or until > now()` 이고 `lifted_at` 이 null 인 행이 "걸린 것" — 스케줄러 없이 비교로 만료. DELETE grant 없음, 공개 역할 grant 없음 → [ADR-020](../decisions/ADR-020-pipeline-stages-and-blocklist.md) D1·D2 |
| `TMeta` | `author`, `sourceUrl`, `intro`, … | 화면 문구. 손으로 관리 |

## 관련 파일

- `scripts/lib/placeFields.mjs` — 두 입구가 공유하는 변환 함수. `fromPlaceRow`(DB 행 → `TPlace`)는 `pull-db.mjs`·`analyze-candidates.mjs`·`apply-approved.mjs` 가 같이 쓴다.
  **node 모듈을 import 하지 않는다** — 브라우저(`src/lib/admin*.ts`)가 이 파일을 그대로 가져가므로 `node:fs` 한 줄이 다시 들어오면 `/admin` 번들이 깨진다.
  파일을 쓰는 쪽은 `scripts/lib/dataJson.mjs`(`writeDataJson`)로 떼어 놨다. 공개 상수(`PROJECT_REF`·`PUBLISHABLE_KEY`·`PROJECT_URL`)도 같은 이유로 `scripts/lib/supabasePublic.mjs`(import 없음)에 있다
- 운영자 검수 화면: `src/lib/admin{Session,Supabase,Candidates,Apply}.ts` · `src/screens/adminPage*.tsx` · `src/app/admin/` — 순수 로직은 위 `scripts/` 모듈을 그대로 import 한다(두 벌로 만들지 않는다)
- 수집·분석·검수·승인: `scripts/collect-blog.mjs`(`data:collect`) · `scripts/analyze-candidates.mjs`(`data:analyze`) · `scripts/review-candidates.mjs`(`data:review`, 앱 파서를 `--experimental-strip-types` 로 읽는다) · `scripts/apply-approved.mjs`(`data:apply`) —
  순수 함수는 `scripts/collect/*`·`scripts/analyze/*`(각각 `*.test.mjs`). 스케줄은 없다 — 사용자 터미널에서 돌린다(ADR-016 v5)
- 인증·입력: `scripts/lib/supabaseClient.mjs`(출처 선택), `scripts/login.mjs`(`pnpm data:login`), `scripts/lib/readHidden.mjs`(비밀번호·네이버 키 숨김 입력, 두 소유자)
- `scripts/pull-db.mjs`(`pnpm data:pull`), `scripts/seed-db.mjs`(`pnpm data:seed`, 1회용이지만 재현성 때문에 레포에 둔다)
- `scripts/normalize.mjs`(`pnpm data:normalize`, 이제는 Notion 재시드 전용), `scripts/fetch-blog-images.mjs`(허용목록 비어 있음), `scripts/optimize-images.mjs`
- `data/jejudo-notion-export.json`(1회 시드 근거), `src/data/*.json`, `src/types.ts`
- 빌드 시 라우트 목록도 `places.json` 에서 만든다: `next.config.mjs`(프리캐시), `src/app/place/[id]/page.tsx`(`generateStaticParams`)
- Vercel 은 `vercel.json` 의 `buildCommand: "pnpm data:pull && pnpm build"` 로 빌드 안에서 DB 를 읽는다(4a). `outputDirectory` 는 비워 둔다(BUG-005)
- Supabase 스키마·RLS·시드 절차: [todo/01](../todo/01-schema-and-seed.md)

## 부록 — Notion 시드가 만들어진 과정 (역사 기록, 지금은 안 씀)

지금의 86곳·15개는 애초에 아래 순서로 한 번 만들어졌다. 다시 시드할 일이 생기면 참고한다.

### 1. 추출 (Notion → export)

Notion 페이지는 공개라 인증 없이 `POST /api/v3/loadPageChunk` 와 `POST /api/v3/queryCollection` 으로 받았다.
HTML 만 받으면 "Notion" 한 단어뿐이라 API 를 써야 했다. DB 는 준비물(15)·숙소(26)·식당(34)·카페(26) 네 개.
collection/view id 는 Claude 메모리(`zgnn-notion-data-source`)에 있다. 결과는 `data/jejudo-notion-export.json` 에
커밋돼 있다.

### 2. 좌표·주소 보강

장소 86곳 전부 네이버 플레이스 단축링크(`naver.me`)를 가진다. HEAD 요청의 Location 에 placeId 가 나오고,
53곳은 좌표까지 같이 나왔다. 나머지는 `https://m.place.naver.com/place/{placeId}/home` 을 모바일 UA 로 받아
HTML 안의 `"coordinate":{"x","y"}` 와 `roadAddress`, `category` 를 읽었다. 결과: 좌표 81곳, 도로명주소 76곳.
**미확보 5곳**(요호르기 스테이, 미트타운, 개떼목장, 브릭스제주, 롯지먼트)은 지도에서 빠지고 화면이
"좌표 없는 5곳 제외" 로 알린다. 억지로 좌표를 지어내지 않았다.

**새 후보의 좌표는 축이 둘이다**(`data:analyze`). 순서가 있고, 키가 서로 다르다.

| | 이름 축 | 주소 축 |
|---|---|---|
| 코드 | `scripts/analyze/naverLocal.mjs` | `scripts/analyze/naverGeocode.mjs` |
| 무엇으로 찾나 | 장소 **이름**(네이버 지역 검색) | AI 가 본문에서 읽은 **주소**(NCP Geocoding) |
| 키 | `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`(API HUB) | `NAVER_MAP_CLIENT_ID`·`NAVER_MAP_CLIENT_SECRET`(**Maps**) |
| 언제 도나 | 늘 먼저 | 이름 축이 **좌표를 못 붙였을 때만** |
| 함께 주는 것 | 좌표 · 주소 · `category` | 좌표 · 주소만(업체를 모른다 — `category`·`naverLink` 는 `null`) |
| 키 오류(401/403/429) | **실행을 세운다** | 그 실행 동안 **축만 내린다** |
| 키가 **없을 때** | 사람 터미널이면 숨김 입력 · 물을 수 없으면 **시작에서 exit 1** | 사람 터미널이면 숨김 입력 · 물을 수 없으면 **경고하고 진행** |

이름 축이 먼저인 이유는 업체 엔트리가 `category` 까지 주기 때문이고, 주소 축이 뒤인 이유는 이름 축의 엄격함
(정규화 이름 **완전 일치**만 채택 — 동명 가게의 좌표가 실리는 것이 좌표 없는 것보다 나쁘다)이 만드는 빈자리를 메우는 것이 그 일이라서다.
실패 정책이 갈리는 이유도 거기서 나온다 — 주소 축은 **이미 좌표가 없는** 후보에만 붙으니 죽어도 어제까지의 동작으로 돌아갈 뿐이다.
후보에는 어느 축에서 왔는지가 `geoSource`(`'local'`|`'geocode'`)로 남는다.
**키가 없을 때의 세기도 같은 이유로 갈린다**(`keyGate`, 2026-09-30). 예전에는 둘 다 로그 한 줄만 찍고 그냥 돌았는데,
그 결과가 2026-09-28 의 첫 실행이다 — 글 50건을 다 읽고 Claude 한도를 쓴 뒤에야 좌표 0건인 걸 알았고 후보 160건을 통째로 버렸다.
지금은 **이름 축의 키가 없으면 Claude 를 부르기 전에 멈춘다**(좌표 없이 대조하면 동명 가게가 `ask` 가 아니라 `auto` 로 올라간다).
좌표 없이 돌릴 작정이면 `--no-geo` 를 명시한다 — 그때는 묻지도 세우지도 않는다.
키는 **세션·마이그레이션 검사 뒤에** 묻는다(먼저 물으면 키 넷을 치고 나서 `pnpm data:login` 으로 멈춰 헛수고가 된다).
⚠️ 주소 축은 **거친 주소를 스스로 거른다** — Geocoding 은 "제주시 애월읍" 에도 `status OK` 로 읍 중심점을 주고 그 점은 제주 범위 박스 안이다
(→ [03](../todo/03-analyze-and-review.md) 의 두 겹 방어).

**왜 그 5곳인가 — 우리 쪽 실패가 아니다**(2026-09-28 실측). 좌표는 **네이버 플레이스 엔트리에만** 있고,
그 5곳의 엔트리가 지금 없다. 근거 셋:
1. 정상 장소는 `/place/{id}/home` 이 **종류별 경로로 302** 된다(솔숲펜션 → `/accommodation/1118214877/home`, 570KB)
   그리고 그 HTML 안에 `"coordinate":{"x":"126.8488419","y":"33.5111848"}` 가 있다 — 위 스크레이퍼가 읽은 바로 그 필드다. **방법은 지금도 유효하다.**
2. 그 5개 id 는 **302 가 없고** 일반 셸을 200 으로 돌려준다. 바이트 길이가 **없는 id(`999999999999`)의 응답과 같다** — "존재하지 않는 장소" 의 모습이다.
3. 네이버 검색도 제주에서 그 이름들을 모른다 — 개떼목장·롯지먼트·요호르기(스테이) 0건,
   미트타운은 원주 「다한울미트타운」, 브릭스제주는 서귀포 호텔 「제주브릭스」 로 **다른 가게만** 나온다.

그래서 **재시도로 채워질 자리가 아니다**:
- 스크레이퍼를 다시 돌려도 같다(엔트리가 없다). 폐업·통합·삭제 중 무엇인지는 이 신호로 가려지지 않는다 — "엔트리가 없다" 까지만 말한다.
- `data:analyze` 의 **이름 축**(`naverLocal.mjs`)으로도 안 채워진다. 그쪽은 **정규화 이름 완전 일치 + 제주 범위**만 채택하므로,
  0건이거나 원주·서귀포의 **다른 가게**인 위 결과는 설계대로 전부 탈락한다. 이건 가드가 제 일을 하는 것이다(동명 가게의 좌표가 실리는 것이 더 나쁘다).
- **주소 축**(`naverGeocode.mjs`)이 원리상 이 문제를 푼다 — 엔트리가 없어도 주소는 좌표를 유일하게 정하고, 이 5곳의 주소는 후기에서 실측해
  [03](../todo/03-analyze-and-review.md) 에 표로 있다. 그런데 **이 5곳에는 닿지 않는다**: 축은 `candidates` 를 만드는 경로에만 있고
  그 5곳의 후기는 수집 창(365일) 밖이라 그 경로에 들어오지 않는다. 다른 최신 글에 같은 가게가 나오면 그때 후보가 된다.
- 남는 선택지는 넷이다: 그대로 둔다(현재 설계 — 화면이 "좌표 없는 N곳 제외" 로 알린다) · Studio 에서 사람이 넣는다(표의 주소가 있다) ·
  실제로 폐업이면 `status` 를 `archived` 로 내린다 · 최신 글에 다시 등장해 주소 축이 후보로 만들 때까지 기다린다.
  **⚠️ 순서가 있다 — 영업 확인이 좌표보다 먼저다.** 후기가 1.4~3년 전이고 엔트리가 없어 폐업이 의심되는데, 문 닫은 가게에 좌표를 넣으면
  지도에 핀이 찍혀 "좌표 없어 제외" 보다 **나쁘다**(가서 보니 없다). 그리고 **좌표를 추정해 넣지는 않는다**
  (→ [ADR-008](../decisions/ADR-008-map-provider.md) 의 datum 함정과 같은 이유).
