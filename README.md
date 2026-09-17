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

첫째, Kakao 지도 키는 **출처(origin)를 포트까지 봐서** 막습니다. 콘솔에 등록된 주소가
`http://localhost:7727` 이라, 다른 포트로 띄우면 SDK 가 `401` 을 내고 지도 자리만 빕니다 —
코드는 멀쩡한데 화면만 비어서 원인을 엉뚱한 데서 찾게 되는 종류의 고장입니다
(→ [ADR-008](docs/decisions/ADR-008-kakao-map.md)). 포트를 바꾸려면 콘솔에 먼저 등록하세요.

둘째, `localhost:3000` 은 **하나의 origin** 이라 그 포트를 쓰는 다른 프로젝트와
localStorage·IndexedDB·**서비스워커 등록**을 통째로 공유합니다. `pnpm preview` 로 한 번
서비스워커를 띄우면 scope `/` 로 등록돼 그 뒤로 **다른 앱의 요청까지 가로챕니다** —
이 앱의 `fallbacks` 가 캐시에 없는 document 를 `/404.html` 로 돌려주므로, 남의 앱이
엉뚱한 HTML 을 받고 조용히 깨집니다. 포트를 갈라두면 이 문제가 애초에 생기지 않습니다.

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
| `/place/[id]` | 상세. 반려동물 이용 조건(원문 포함), 판정 카드, 요금, 근처 장소 |
| `/map` | 지도. 타입·방향 필터, 마커를 누르면 미니 카드(모바일은 하단 시트, ≥1024px 은 좌측 목록 패널). `?saved=1` 은 저장한 곳만 |
| `/checklist` | 준비물. 계절별 목록, 체크 상태 저장, 숙소 구비 용품 반영 |
| `/settings` | 설정(탭). 우리 강아지 카드, 저장한 곳 진입, 자료 출처 |
| `/saved` | 저장한 곳. 타입별 묶음(설정 안) |
| `/dog` | 우리 강아지 등록. 마리별 이름·몸무게·이동 수단 → 장소별 판정의 입력(설정 안) |

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

`src/data/` 의 세 JSON 이 앱이 읽는 전부입니다. 원본은 짱구누나의 Notion 자료
(`src/data/meta.json` 의 `sourceUrl`) 이고, 아래 순서로 만들어집니다.

```bash
pnpm data:fetch-images     # 블로그 후기에서 장소 사진 수집 → data/raw/places/
pnpm data:optimize-images  # webp 변환 → public/images/places/ + data/place-images.json
pnpm data:normalize        # Notion export + 이미지 매니페스트 → src/data/*.json
```

### 장소 사진은 없습니다

후기 포스트 대부분이 작성자 본인이 아닌 타인의 블로그라, 저작권 문제로 사진을 모두 뺐습니다.
`public/images/` 디렉터리는 없고 86곳 전부 `cover` 가 없으며 `images` 는 빈 배열입니다.
이미지 수집 스크립트를 다시 돌려도 허용목록이 비어 있어 아무것도 받지 않습니다.

그래서 **사진 없는 상태가 이 앱의 기본 디자인**입니다. 사진 자리는 타입별 색과
종류 아이콘(숙소·식당·카페)이 대신하고, 장소 이름·읍면·특징 문장이 타이포그래피로 화면을 이끕니다.
`cover` 와 `images` 를 읽는 코드 경로는 그대로 남겨뒀으니, 나중에 직접 찍은 사진을
`src/data/places.json` 에 채우면 코드 수정 없이 사진이 나옵니다(불러오기에 실패하면 아이콘으로 되돌아갑니다).

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
  함께 움직이므로, 등급을 늘리면 세 곳을 같이 봅니다. `pnpm test` 에 24개 케이스가 있습니다.
- **`src/lib/category.ts`** — 네이버 카테고리 문자열을 화면 라벨로 다듬습니다.
  아이콘은 여기가 아니라 `src/components/icons/placeTypeIcon.ts` 의 종류별 3종을 씁니다.
- **`src/lib/amenities.ts`** — 숙소 구비 용품과 준비물을 잇는 매핑 테이블.
- **`src/lib/placeFilters.ts`** — 둘러보기 화면의 조건 필터.
- **`src/lib/mapTiles.ts`** — 지도 타일 출처.

## 지도 타일

CARTO Voyager 가 원래 선택이지만 CARTO 는 API 키 없이 받은 타일에 워터마크를 찍습니다.
그래서 키가 없으면 OpenStreetMap 기본 타일을 씁니다. CARTO 키가 있다면 `.env.local` 에
아래 한 줄을 넣으면 CARTO 로 바뀝니다.

```
NEXT_PUBLIC_CARTO_API_KEY=발급받은_키
```

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
react-aria-components + Untitled UI · leaflet + react-leaflet · @serwist/next · vitest
