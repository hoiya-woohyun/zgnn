# 강아지랑 제주

짱구누나의 반려견 동반 제주 가이드. 강아지와 함께 갈 수 있는 제주 숙소·식당·카페 86곳과
여행 준비물을 모바일에서 보는 PWA 입니다.

## 문서

제품 컨셉과 설계 문서는 `docs/` 에 있습니다. [docs/CONCEPT.md](docs/CONCEPT.md) 가 "왜 만드는가",
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 가 "어떻게 짜여 있는가" 의 허브입니다.
이 README 는 실행과 온보딩만 다룹니다.

## 실행

Node 22, pnpm 이 필요합니다.

```bash
pnpm i
pnpm dev      # 개발 서버 (next dev --turbopack) → http://localhost:7727
pnpm build    # 정적 내보내기 → out/
pnpm preview  # out/ 을 정적 서버로 띄워 확인 → http://localhost:7727
pnpm test     # vitest — 파서·판정·필터·정렬·히스토리 단위 테스트
pnpm lint     # eslint
pnpm icons    # PWA 아이콘 재생성 (팔레트가 바뀔 때만)
```

**포트 7727 은 고정입니다.** 흔한 3000 을 쓰지 않는 이유가 두 가지 있습니다.

첫째, 지도 키는 **출처(origin)를 포트까지 봐서** 막습니다. NCP 콘솔에 등록된 주소가
`http://localhost:7727` 이라, 다른 포트로 띄우면 `/v3/auth` 가 `401` 을 내고 지도가 안 뜹니다
(2026-09-23 실측 — 같은 localhost 의 다른 포트에서 재현됩니다).
포트를 바꾸려면 콘솔에 먼저 등록하세요 (→ [ADR-008](docs/decisions/ADR-008-map-provider.md)).

둘째, `localhost:3000` 은 **하나의 origin** 이라 그 포트를 쓰는 다른 프로젝트와
localStorage·IndexedDB·**서비스워커 등록**을 통째로 공유합니다. `pnpm preview` 로 한 번
서비스워커를 띄우면 scope `/` 로 등록돼 그 뒤로 **다른 앱의 요청까지 가로챕니다** —
이 앱의 `fallbacks` 가 캐시에 없는 document 를 `/404.html` 로 돌려주므로, 남의 앱이
엉뚱한 HTML 을 받고 조용히 깨집니다. 포트를 갈라두면 이 문제가 애초에 생기지 않습니다.

**폰에서 보려면 LAN 주소(`http://192.168.x.x:7727`)로 열면 되는데, 그 출처가
`next.config.mjs` 의 `allowedDevOrigins` 에 있어야 합니다.** Next 16 이 localhost 밖의 출처를
막는데, 막혀도 화면은 다 그려지고 링크도 움직여서 **버튼·스크롤 반응만 조용히 죽습니다** —
"iOS 에서만 안 된다" 로 보이는 고장입니다. 지금은 사설 대역(`192.168.*.*`, `10.*.*.*`)이 통째로
들어 있어 IP 가 바뀌어도 되지만, `172.16~31.*.*`·`*.local`·터널 도메인은 한 줄 더해야 합니다
(→ [BUG-004](docs/bugs/BUG-004-lan-dev-origin-blocked.md)).

`build` 에 붙은 `--webpack` 은 취향이 아니라 필수입니다. 서비스워커를 만드는
`@serwist/next` 는 webpack 플러그인이라 Turbopack(Next 16 기본)에서는 동작하지 않습니다.
이 플래그를 빼면 빌드는 통과하지만 `sw.js` 가 만들어지지 않아 PWA 가 조용히 사라집니다.

`dev` 는 반대로 Turbopack 으로 띄웁니다. 개발 모드에서는 `disable: true` 라 플러그인이
webpack 훅에서 바로 돌아 나오고 서비스워커도 만들지 않으므로, webpack 을 쓸 이유가 없습니다.
`--turbopack` 을 명시하는 이유는 Next 16 이 "webpack 설정은 있는데 turbopack 설정이 없다" 며
빌드를 멈추기 때문입니다 — `@serwist/next` 가 항상 `webpack` 키를 붙이는 탓입니다.

빌드 산출물은 `out/` 이고 서버가 필요 없는 정적 파일입니다(`output: 'export'`).

## 화면

| 경로 | 화면 |
|---|---|
| `/` | 홈. 인사말, 숙소·식당·카페 요약, 준비물과 저장한 곳 진입 |
| `/places/[type]` | 둘러보기. 이름·특징·읍면 검색, 방향·반려동물 조건 필터, 숙소는 가격 정렬 |
| `/place/[id]` | 상세. 반려동물 이용 조건(원문 포함), 판정 카드, 네이버 지도·사진 보기, 요금, 공식 홈페이지 카드, 미니 지도, 근처 장소 |
| `/map` | 지도. 타입·방향 필터, 마커를 누르면 미니 카드(모바일은 하단 시트, ≥1024px 은 좌측 목록 패널). `?saved=1` 은 저장한 곳만 |
| `/checklist` | 준비물. 계절별 목록, 체크 상태 저장, 숙소 구비 용품 반영 |
| `/settings` | 설정(탭). 우리 강아지 카드, 저장한 곳 진입, 자료 출처 |
| `/saved` | 저장한 곳. 타입별 묶음(설정 안) |
| `/dog` | 우리 강아지 등록. 마리별 이름·몸무게·이동 수단 → 장소별 판정의 입력(설정 안) |
| `/admin` | 운영자 검수. 블로그에서 찾은 후보를 보고 승인·반려·고치기, 올린 곳 내리기(운영자 로그인 필요, 탭바에는 없음) |

`src/app/**/page.tsx` 는 주소와 메타데이터만 맡는 서버 컴포넌트이고, 화면을 그리는 본체는
`src/screens/` 의 클라이언트 컴포넌트입니다. 정적 내보내기라 서버 렌더에서 얻는 것은
검색·공유용 메타 태그뿐이고, 화면 동작은 전부 브라우저에서 돕니다.

`src/screens/` 라는 이름을 쓰는 이유는 Next 가 `src/pages/` 를 옛 Pages Router 로 인식하기
때문입니다. 거기에 두면 `useChecklistAmenities.ts` 같은 파일까지 라우트로 잡힙니다.

종류(`stay`/`restaurant`/`cafe`)와 장소 id 86개는 `generateStaticParams` 로 빌드 때 전부
만들어 두고 `dynamicParams = false` 로 그 밖의 주소는 404 입니다. 목록 없는 id 를 받아도
빈 화면이 아니라 404 가 뜨는 편이 낫기 때문입니다.

저장한 곳, 준비물 체크, 계절 선택은 `localStorage` 에 남습니다(zustand persist).
읽기는 마운트 뒤로 미룹니다(`skipHydration` + `src/providers/storeHydration.tsx`) —
HTML 이 빌드 때 만들어지므로 첫 렌더에서 localStorage 를 읽으면 값이 어긋납니다.
그래서 화면이 뜬 직후 아주 잠깐 저장 개수가 0 으로 보이는 것은 의도한 동작입니다.

화면 틀은 폭에 따라 갈립니다. 768px 미만은 상단 앱바 + 하단 탭바, 768px 이상은 좌측 고정
사이드바입니다. 지도만 1024px 이상에서 목록 패널과 지도의 2단이 됩니다.

## 데이터

앱이 읽는 것은 `src/data/` 의 JSON 셋이 전부이고, 그 원본은 **Supabase** 입니다([ADR-015](docs/decisions/ADR-015-supabase-source-and-rebuild.md)).
사이트는 Vercel 빌드가 `pnpm data pull` 로 그때그때 받아 가므로, 평소에 이 파일들을 손으로 고칠 일은 없습니다.
자세한 구조는 [docs/architecture/data-pipeline.md](docs/architecture/data-pipeline.md), 진행 상황은 [docs/todo/](docs/todo/README.md).

데이터 명령은 `pnpm data <하위 명령>` 하나로 들어갑니다(`scripts/data.mjs`, [ADR-024](docs/decisions/ADR-024-local-worker-and-db-queues.md)).
Vercel 빌드가 부르는 `pnpm data pull` 말고는 **전부 운영자 터미널에서** 돌립니다(스케줄·CI 없음 — 손으로 치거나, 터미널에 워커를 띄워 둡니다). 사용법은 `pnpm data help`.
**평소에는 명령 셋과 `/admin` 화면이면 됩니다.** 나머지는 가끔 씁니다.

### 평소 흐름 — 이 순서대로

```bash
pnpm data login      # ① 하루 한 번. 운영자 계정으로 로그인(세션은 키체인, 만료되면 다른 명령이 멈추고 이걸 부르라고 한다)
pnpm data collect    # ② 네이버 블로그에서 반려동반 글 목록을 모은다
pnpm data analyze    # ③ 모은 글을 Claude 로 읽어 장소 후보를 만든다
# ④ 브라우저에서 /admin 을 열어 후보를 보고 승인·반려한다 → 승인하면 사이트에 올라가고 재빌드가 자동으로 걸린다
```

| 단계 | 명령 | 하는 일 | 필요한 것 | 자주 쓰는 옵션 |
|---|---|---|---|---|
| ① | `pnpm data login` | 운영자 로그인. 세션을 키체인에 넣는다 | Supabase 운영자 계정 | — |
| ② | `pnpm data collect` | 네이버 검색 API 로 글 **목록**(제목·링크·날짜)을 `blog_posts` 에 모은다. 본문은 저장하지 않는다 | 네이버 검색 키(env 또는 숨김 입력) | `--only-requests`(`/admin` 의 추가 수집 요청만) |
| ③ | `pnpm data analyze` | 아직 안 읽은 글을 열어 Claude 가 장소를 뽑고, 네이버로 좌표·주소를 붙이고, 기존 장소와 대조해 `candidates` 를 만든다. 업체 홈페이지가 있으면 링크 카드도 붙인다 | Claude 구독(로컬 `claude` 로그인) · 네이버 검색 키 · (선택) 네이버 Maps 키 | `--limit N`(기본 50) · `--dry-run` · `--no-geo` · `--no-verify` · `--no-homepage` · `--dump` |
| ④ | `/admin` | 후보를 같은 가게끼리 묶어 보여 준다. 고치기·승인·반려·올린 곳 내리기 | 운영자 계정(브라우저 로그인) | — |

승인한 곳은 **다음 빌드부터** 사이트에 보입니다. 재빌드가 정말 걸렸는지는 `/admin` 머리글 한 줄이 알려 줍니다.

### 가끔

| 명령 | 언제 |
|---|---|
| `pnpm data` | **상주 워커** — 터미널에 띄워 두면 60초마다 DB 를 보고 할 것만 돈다: `/admin` 의 추가 수집 요청 → 요청 글(추가 수집·재분석이 찍은 `requested_at`) 분석 → 승인 후보 반영. 매일 09:00(KST)엔 키워드 전체 수집. 요청 안 된 미분석 글(저수지)은 자동으로 읽지 않는다. 세션이 끝나면 그 자리에서 비밀번호를 묻고, Claude 한도면 리셋까지 분석만 쉰다. **네이버 키는 env 나 `~/.zgnn-naver.env` 에 있어야 한다**(숨김 입력은 단계마다 다시 묻고 그동안 워커가 멈춘다). 사람 터미널에서만 뜬다(Claude Code 세션 안이면 거부). 끝내려면 Ctrl-C([ADR-024](docs/decisions/ADR-024-local-worker-and-db-queues.md)) |
| `pnpm data once` | 워커의 **한 바퀴**만 — 위와 같은 판단으로 할 것만 돌고 끝난다. 없으면 "할 일 없음". `--dry-run` 은 계획만 찍는다(아무것도 안 돌린다) |
| `pnpm data apply` | 승인됐는데 반영이 끊긴 후보를 `places` 에 반영한다(기존 장소는 빈 칸만 채움 · 신규는 `draft`). `/admin` 이 "반영이 끊긴 후보" 를 말할 때(`--dry-run`) |
| `pnpm data pull` | 로컬 `src/data/*.json` 을 DB 최신으로 맞출 때. 결과가 비면 파일을 덮지 않고 멈춘다 |
| `pnpm data logout` | 세션을 만료 전에 지울 때 |
| `pnpm data eval` | 추출 프롬프트를 고친 뒤 정확도를 잴 때. 시드 86곳이 정답이고 로그인이 필요 없다(`extract --limit N` 은 글당 Claude 1회 · `score` 는 호출 0) → [docs/features/extraction-eval.md](docs/features/extraction-eval.md) |

### 거의 안 씀 — 재구축용

평소 흐름에는 들어가지 않습니다. 스키마를 새로 만들거나 다른 프로젝트로 옮길 때만 봅니다. `pnpm data` 에 없고 `node` 로 직접 부릅니다.

| 명령 | 무엇 |
|---|---|
| `node scripts/seed-db.mjs` | `src/data/*.json`(Notion 시절 마지막 스냅샷)을 Supabase 에 한 번 올린다. 여러 번 돌려도 안전(upsert). 운영자 세션 필요 |
| `node scripts/normalize.mjs` | Notion export → `src/data/*.json`. Supabase 로 옮기기 전의 생성 경로 |

### 장소 사진

후기 포스트 대부분이 작성자 본인이 아닌 타인의 블로그라, 저작권 문제로 사진을 모두 뺐습니다.
`public/images/` 디렉터리는 없고 86곳 전부 `cover` 가 없으며 `images` 는 빈 배열입니다.

그래서 **사진 없는 상태가 이 앱의 기본 디자인**입니다. 사진 자리는 타입별 색과
종류 아이콘(숙소·식당·카페)이 대신하고, 장소 이름·읍면·특징 문장이 타이포그래피로 화면을 이끕니다.
`cover` 와 `images` 를 읽는 코드 경로는 그대로 남겨뒀으니, 나중에 직접 찍은 사진을
`src/data/places.json` 에 채우면 코드 수정 없이 사진이 나옵니다(불러오기에 실패하면 아이콘으로 되돌아갑니다).

대신 사진은 **가져오지 않고 보여 줍니다**([ADR-002](docs/decisions/ADR-002-no-place-photos.md) v2·v3).
상세 화면의 **사진 보기**(네이버 초록 알약)는 네이버 플레이스의 사진 탭을 열고, 업체 공식 홈페이지가 있는 곳은
**공식 홈페이지 카드**가 그 사이트의 대표 사진(`og:image`) 한 장을 출처와 함께 링크로 띄웁니다. 어느 쪽도 파일을 저장하지 않습니다.

사진이 다시 생기더라도 용량이 커서 PWA precache 에는 넣지 않습니다. `/images/places/` 는
런타임 CacheFirst 규칙으로만 다루도록 `src/app/sw.ts` 에 남겨 뒀습니다.

## PWA

서비스워커는 `@serwist/next` 로 만듭니다. 손으로 쓰는 쪽은 `src/app/sw.ts` 하나이고,
빌드가 그것을 `public/sw.js` 로 번들해 `out/sw.js` 로 내보냅니다. 웹 매니페스트는
`src/app/manifest.ts` 입니다. 등록은 플러그인이 알아서 합니다.

프리캐시 목록은 `next.config.mjs` 에서 직접 만듭니다. 정적 내보내기의 HTML 은 webpack 이
만드는 자산이 아니라 컴파일이 끝난 뒤에 따로 쓰이기 때문에, 그냥 두면 매니페스트에 JS·CSS 만
들어오고 화면 주소는 하나도 들어오지 않습니다. 그래서 `places.json` 에서 라우트 95개
(홈·지도·준비물·설정·저장·강아지 등록·종류 3개·장소 86개)를 만들어 `additionalPrecacheEntries` 로 넣고,
`/404.html` 과 `/manifest.webmanifest`, 아이콘 4장을 더합니다. 최근 빌드 기준 150개입니다.

아이콘을 직접 넣는 것도 같은 이유입니다. `@serwist/next` 는 `additionalPrecacheEntries` 를
주면 `public/` 을 훑는 자기 동작(`globPublicPatterns`)을 **대신하지 않고 통째로 건너뜁니다**.
둘은 더해지지 않습니다.

라우트 HTML 은 파일명에 해시가 없어서 `revision` 이 필요합니다. 이 레포는 커밋 해시를
쓸 수 없던 시기에 만들어져 `src/` 전체와 `package.json`, `pnpm-lock.yaml` 을 해싱한 값을 씁니다.

## 손대게 될 만한 곳

- **`src/lib/petPolicy.ts`** — 손으로 쓴 `petPolicyText` 에서 실내 동반 여부, 무게 제한,
  마릿수, 요금 같은 조건을 뽑아냅니다. 판단 규칙이 파일 위쪽 테이블에 모여 있어서
  새로운 표현이 나오면 정규식 한 줄만 추가하면 됩니다. 규칙을 고치면 `pnpm test` 로 확인하세요.
  화면에는 항상 원문을 함께 보여주므로, 파서가 놓친 조건도 사용자가 읽을 수 있습니다.
- **`src/lib/eligibility.ts`** — 강아지 프로필 × 이용 조건 → 판정(`ok`/`cond`/`unknown`/`hard`).
  판정 등급이 목록 정렬(`src/lib/sortByEligibility.ts`)과 배지(`src/components/eligibilityBadge.tsx`)를
  함께 움직이므로, 등급을 늘리면 세 곳을 같이 봅니다. 케이스는 `src/lib/eligibility.test.ts` 에 모여 있습니다.
- **`src/lib/category.ts`** — 네이버 카테고리 문자열을 화면 라벨로 다듬습니다.
  아이콘은 여기가 아니라 `src/components/icons/placeTypeIcon.ts` 의 종류별 3종을 씁니다.
- **`src/lib/amenities.ts`** — 숙소 구비 용품과 준비물을 잇는 매핑 테이블.
- **`src/lib/placeFilters.ts`** — 둘러보기 화면의 조건 필터.
- **`src/lib/naverMap.ts`** — 네이버 지도 SDK 로더와 클라이언트 아이디. 확대 수준은 `src/lib/places.ts` 의 `JEJU_ZOOM` 하나.

## 지도

지도는 **네이버 지도(NCP Maps JavaScript API v3)** 입니다([ADR-008](docs/decisions/ADR-008-map-provider.md)). SDK 는 npm 패키지가 아니라
지도 화면이 뜰 때 `oapi.map.naver.com` 에서 스크립트 한 장을 붙입니다(`src/lib/naverMap.ts`).

클라이언트 아이디는 **코드에 상수로** 들어 있고 따로 설정할 것이 없습니다. 공개 전제의 값이라 빌드 결과물에 어차피 남고,
실제 보호는 NCP 콘솔의 **Web 서비스 URL 허용 목록**이 합니다. `.env.local` 에만 두면 Vercel 빌드에서 지도만 죽습니다
(이 레포는 Vercel 환경변수를 0개로 유지합니다 — ADR-016). 다른 아이디로 바꿔 보고 싶을 때만 아래 한 줄을 씁니다.

```
NEXT_PUBLIC_NAVER_MAP_KEY_ID=다른_클라이언트_아이디
```

지도가 안 뜨면 코드보다 콘솔을 먼저 봅니다.

- **주소(출처)가 등록돼 있는가** — 포트까지 봅니다. 없으면 인증이 거부되고, 화면은 빈 지도 대신 안내를 그립니다.
- **Dynamic Map 이 체크돼 있는가** — 아니면 429(Quota Exceed)가 납니다.
- **비용은 "지도를 띄운 방문 수"** 입니다(인증이 페이지 로드당 1회). 상세의 미니 지도도 한 번으로 셉니다.

## UI — Untitled UI

표현 계층은 [Untitled UI](https://www.untitledui.com/) 를 따릅니다. Untitled UI React 는 npm
패키지가 아니라 CLI 로 소스를 복사해 쓰는 방식이라, 필요한 것만 받아 레포 안에 두고 있습니다.

| 위치 | 무엇 |
|---|---|
| `src/components/base/` | Untitled UI 에서 가져온 컴포넌트. 원본 이름(kebab-case)을 그대로 씁니다. **직접 고치지 마세요** — 규칙도 eslint 에서 이 폴더만 따로 꺼 뒀습니다 |
| `src/styles/theme.css` | Untitled UI 토큰. 브랜드 스케일은 핑크(oklch 358°), 바탕 회색(`--color-neutral-*`)은 크림·오트밀 웜 그레이로 덮어썼습니다. 분홍은 버튼·링크·활성 탭·저장 하트 같은 강조에만 쓰고 바탕은 크림으로 비워 둡니다 |
| `src/components/layout/` | 앱 셸(사이드바·탭바·앱바)과 `PageHeader` / `Section` / `EmptyState` |
| `src/components/icons/` | `@untitledui/icons` 에 없는 숙소·식당·카페 아이콘 3종(24×24, stroke 2) |

색은 `bg-primary` · `text-secondary` · `bg-brand-solid` 같은 시맨틱 토큰으로만 씁니다.
종류 색(숙소=바다 / 식당=감귤 앰버 / 카페=라떼)만 브랜드와 별개 토큰으로 남아 있습니다 —
사진이 없는 화면에서 종류를 가르는 주된 신호라 브랜드 색에 흡수시키지 않았습니다. 식당을 붉은
주황이 아니라 노란빛 앰버로 둔 것은 브랜드 핑크와 색상환에서 붙지 않게 하려는 의도입니다.
같은 값이 `src/styles/theme.css` 와 `src/lib/places.ts`(지도 마커) 두 곳에 있어 함께 고쳐야 합니다.
팔레트를 바꾸면 `pnpm icons` 로 PWA 아이콘을 다시 만들고 `layout.tsx`·`manifest.ts` 의
`theme_color` 도 맞춥니다.

`@/` 는 `src/` 를 가리킵니다(`tsconfig.json` 의 `paths`). Untitled UI 컴포넌트끼리 이 경로로
서로를 참조합니다. 테스트는 Next 를 거치지 않으므로 `vitest.config.mts` 가
`vite-tsconfig-paths` 로 같은 값을 다시 읽습니다.

react-aria 의 `Link` · `Button href` 가 전체 새로고침 대신 Next 라우터로 움직이도록
`src/providers/routerProvider.tsx` 가 `RouterProvider` 에 `useRouter().push` 를 물려 둡니다.
`target="_blank"` 가 붙은 외부 링크는 여기 걸리지 않고 그대로 새 탭으로 열립니다.

## 스택

Next.js 16 (App Router, 정적 내보내기) · React 19 · TypeScript · Tailwind CSS v4 · zustand ·
react-aria-components + Untitled UI · 네이버 지도(NCP Maps v3) · Supabase(데이터 원본·`/admin`) · @serwist/next · vitest
