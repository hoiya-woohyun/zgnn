# 데이터 파이프라인 — Supabase → src/data

> 최종 수정: 2026-09-28 (v8: **좌표 미확보 5곳의 이유를 실측해 적었다** — 데이터가 아니라 네이버 쪽에 그 플레이스 엔트리가 없다.
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

앱이 읽는 데이터는 여전히 `src/data/` 의 JSON 세 개가 전부이고, **런타임 fetch 는 없다.** 바뀐 건 그 JSON 을
누가 만드느냐다 — 원본은 이제 **Supabase**([ADR-015](../decisions/ADR-015-supabase-source-and-rebuild.md))고,
Notion 은 1회 시드 경로로만 남는다.

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

- 앱은 런타임에 아무것도 fetch 하지 않는다. 장소 86곳(숙소 26·식당 34·카페 26), 준비물 15가지 — 지금까지와 동일.
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

## `archived` 는 pull 에서 빠진다

`places.status` 는 `draft`/`published`/`archived` 세 가지고, `data:pull` 은 `published` 만 가져온다. 그래서
폐업(`archived`) 처리된 장소는 `places.json`·라우트·프리캐시에서 **조용히 사라지고**, 저장 목록에서도 함께
빠진다 — `selectSavedPlaces` 가 `PLACES.filter` 라 모르는 id 는 오류 없이 버려진다(`src/lib/places.ts`).
"폐업" 을 사용자에게 보여주고 싶으면 archived 도 pull 해서 화면에 상태를 그려야 하는데, 이건 기능 변경이라
지금 범위 밖이다([todo/01](../todo/01-schema-and-seed.md)).

## 이미지

`places` 테이블에 `images` 컬럼은 없다. `data:pull` 은 항상 `images: []` 를 쓴다. `TPlace` 계약(코드가 읽는
타입)은 그대로 남겨 뒀지만(→ [ADR-002](../decisions/ADR-002-no-place-photos.md), 사진 없음이 기본 디자인),
실제 값을 채우는 경로는 지금 없다.

## 파싱은 여전히 런타임

이용 조건은 여기서 구조화하지 않는다. `petPolicyText` 원문을 `places` 에 그대로 두고 런타임에
`parsePetPolicy()` 가 읽는다([pet-policy-and-eligibility.md](./pet-policy-and-eligibility.md)). 블로그에서 AI 가
뽑아내는 조건도(todo/03) 같은 원칙 — **원문 문장으로** 넣는다. 파서 규칙을 고칠 때 데이터를 다시 만들 필요가
없게 하기 위함이다.

읍면·방향(`TRegion`)·숙소 요금(`TStayPrice`) 변환 로직 자체는 그대로다. 다만 이제 그 함수는
`scripts/lib/placeFields.mjs` 의 `parseRegion`·`parsePrice` 이고, 두 입구(Notion 재시드 / Supabase pull) 가
공유한다.

## 수집 · 분석 · 승인 (코드 완료, 실행 전)

**사용자 터미널에서** `pnpm data:collect` → `pnpm data:analyze` → (Studio 에서 승인) → `pnpm data:apply` 를 순서대로 돌린다 — 스케줄·CI 없음
(ADR-016 v5, GitHub Actions 폐지). 셋 다 운영자 세션(`pnpm data:login`)이 필요하고, `data:collect` 는 네이버 검색 키까지 필요하다 — env
(`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`)로 넘기거나 없으면 터미널 숨김 입력으로 받는다(어디에도 저장 안 함 · 에이전트 세션에서는 입력을 거부).
그래서 수집은 사용자 몫이고 에이전트는 `data:analyze`·`data:apply` 만 돌린다. `blog_posts` 는 사용자가 돌릴 때만 찬다. 진행·결정은
[todo/02](../todo/02-collect-naver-blog.md)·[todo/03](../todo/03-analyze-and-review.md).

```mermaid
flowchart LR
  K[keywords.json] -->|네이버 검색 API · 최근 1년| P[(blog_posts)]
  P -->|analyzed_at null 인 글| B[본문 HTML<br/>그 자리에서만 읽고 버림]
  B -->|claude -p --json-schema<br/>구독, API 키 없음| E[장소 0~N개<br/>petPolicyText 는 원문 그대로]
  E -->|네이버 지역 검색: 이름 완전 일치만| G[좌표·주소·regionRaw]
  G -->|matchPlace vs places<br/>archived 빼고 draft 포함| C[(candidates<br/>pending · tier auto/ask/new)]
  C -->|사람: Studio 에서 링크·evidence 확인| A{approved?}
  A -->|approved| PL[(places<br/>빈 칸만 채움 · 신규는 draft)]
  A -->|rejected| X[끝]
  PL -.->|published 는 사람이 올림| PULL[data:pull → 재빌드]
```

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
| `approved` | 사람(Studio). `AUTO_APPROVE=true` 면 `auto` 는 자동 | `data:apply` 가 반영한다. `ask` 인데 신규가 맞으면 **`match_place_id` 를 비우고** 승인 |
| `rejected` | 사람 | 끝. `reviewer_note` 에 이유 |
| `merged` | `data:apply` | `places` 에 반영됐다(보강 또는 draft 신규 + `place_sources` 링크) |

`places.status` 는 별개다: 신규는 `draft` 로 들어오고 **`published` 로 올리는 건 사람**이다 — `data:pull` 은 `published` 만 가져온다.

## 스키마 요약

`src/types.ts` 가 계약이다. 화면과 lib 는 이 타입만 본다.

| 타입 | 핵심 필드 | 비고 |
|---|---|---|
| `TPlace` | `id`, `type`, `name`, `region`, `features`, `petPolicyText`, `geo?`, `address?`, `naverUrl?`, `reviewUrl?`, `stay?` | `id` 는 Notion 블록 id 를 시드 때 그대로 옮겼다. 라우트 `/place/[id]` 와 저장 목록의 키 |
| `TStayInfo` | `price: TStayPrice`, `amenitiesText` | 숙소만. `amenitiesText` 는 준비물 화면의 구비 용품 매핑에 쓰인다(`src/lib/amenities.ts`) |
| `TItem` | `id`, `name`, `emoji`, `seasons`, `reason`, `linkUrl?`, `variants?` | 준비물. `linkUrl` 은 쿠팡 파트너스 링크라 `meta.disclosure` 를 함께 표시. `variants` 는 원본의 여러 줄을 `lib/places.ts` 의 `ITEM_VARIANTS` 가 한 항목으로 합치면서 생긴다(기내용 가방의 5kg 이하/이상) — DB·JSON 어디에도 없는 파생 필드다 |
| `TMeta` | `author`, `sourceUrl`, `intro`, … | 화면 문구. 손으로 관리 |

## 관련 파일

- `scripts/lib/placeFields.mjs` — 두 입구가 공유하는 변환 함수. `fromPlaceRow`(DB 행 → `TPlace`)는 `pull-db.mjs`·`analyze-candidates.mjs`·`apply-approved.mjs` 가 같이 쓴다
- 수집·분석·승인: `scripts/collect-blog.mjs`(`data:collect`) · `scripts/analyze-candidates.mjs`(`data:analyze`) · `scripts/apply-approved.mjs`(`data:apply`) —
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

**왜 그 5곳인가 — 우리 쪽 실패가 아니다**(2026-09-28 실측). 좌표는 **네이버 플레이스 엔트리에만** 있고,
그 5곳의 엔트리가 지금 없다. 근거 셋:
1. 정상 장소는 `/place/{id}/home` 이 **종류별 경로로 302** 된다(솔숲펜션 → `/accommodation/1118214877/home`, 570KB)
   그리고 그 HTML 안에 `"coordinate":{"x":"126.8488419","y":"33.5111848"}` 가 있다 — 위 스크레이퍼가 읽은 바로 그 필드다. **방법은 지금도 유효하다.**
2. 그 5개 id 는 **302 가 없고** 일반 셸을 200 으로 돌려준다. 바이트 길이가 **없는 id(`999999999999`)의 응답과 같다** — "존재하지 않는 장소" 의 모습이다.
3. 네이버 검색도 제주에서 그 이름들을 모른다 — 개떼목장·롯지먼트·요호르기(스테이) 0건,
   미트타운은 원주 「다한울미트타운」, 브릭스제주는 서귀포 호텔 「제주브릭스」 로 **다른 가게만** 나온다.

그래서 **재시도로 채워질 자리가 아니다**:
- 스크레이퍼를 다시 돌려도 같다(엔트리가 없다). 폐업·통합·삭제 중 무엇인지는 이 신호로 가려지지 않는다 — "엔트리가 없다" 까지만 말한다.
- `data:analyze` 의 좌표 보강(`naverLocal.mjs`)으로도 안 채워진다. 그쪽은 **정규화 이름 완전 일치 + 제주 범위**만 채택하므로,
  0건이거나 원주·서귀포의 **다른 가게**인 위 결과는 설계대로 전부 탈락한다. 이건 가드가 제 일을 하는 것이다(동명 가게의 좌표가 실리는 것이 더 나쁘다).
- 남는 선택지는 셋뿐이다: 그대로 둔다(현재 설계 — 화면이 "좌표 없는 N곳 제외" 로 알린다) · Studio 에서 사람이 넣는다 ·
  실제로 폐업이면 `status` 를 `archived` 로 내린다. **좌표를 추정해 넣지는 않는다**(→ [ADR-008](../decisions/ADR-008-map-provider.md) 의 datum 함정과 같은 이유).
