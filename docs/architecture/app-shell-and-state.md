# 라우팅 · 화면 셸 · 클라이언트 상태

> 최종 수정: 2026-09-15 (v1: 신설)

## 개요

Next.js 16 App Router 를 **정적 내보내기**로 쓴다. 서버는 빌드 때만 돌고, 배포물은 `out/` 의 HTML·JS·JSON 이다.
그래서 서버 컴포넌트가 하는 일은 주소·메타 태그·정적 파라미터 생성뿐이고 화면 동작은 전부 브라우저에서 돈다.

## 라우트와 화면의 분리

```
src/app/place/[id]/page.tsx   ─ 서버: generateStaticParams(86개) · generateMetadata · dynamicParams=false
        └── <PlaceDetailPage place={…}/>   ─ 클라이언트: src/screens/placeDetailPage.tsx
```

- `src/app/**/page.tsx` 는 얇다. 데이터 JSON 에서 대상을 찾아 `screens/` 컴포넌트에 넘긴다.
- `src/screens/` 라는 이름은 Next 가 `src/pages/` 를 Pages Router 로 오인하기 때문이다.
- `/places/[type]` 은 종류 3개, `/place/[id]` 는 장소 86개를 빌드 때 전부 만들고, 그 밖의 주소는 404(`dynamicParams = false`).
  없는 id 에 빈 화면 대신 404 를 내기 위해서다.
- `/map` 은 leaflet 이 `window` 를 필요로 해서 `src/app/map/mapRouteClient.tsx` 가 `dynamic(..., { ssr: false })` 로 감싼다.

## 화면 셸 (`src/components/layout/`)

| 폭 | 구성 |
|---|---|
| < 768px | 상단 `AppBar`(뒤로가기·제목·액션) + 하단 `AppTabBar`(홈·지도·둘러보기·준비물·저장) |
| ≥ 768px | 좌측 고정 `AppSidebar`. `AppBar` 는 숨김 |
| ≥ 1024px (지도만) | 목록 패널 + 지도 2단 (`useMapPageWideLayout`) |

- `AppBar` 의 `tone="overlay"` 는 상세 제목 판처럼 **부모가 이미 바탕색을 가진 경우**다. 배경·테두리 없이 얹히고 sticky 도 아니다.
- 홈 히어로만 셸의 중앙 정렬 폭을 넘어 화면 끝까지 깔린다. 나머지는 `PageHeader` / `Section` 의 좌우 패딩 계약을 따른다.

### 뒤로가기 (`src/lib/appHistory.ts`)

링크로 상세에 바로 들어온 사용자가 뒤로가기를 누르면 앱 밖으로 나가 버린다.
그래서 history 항목이 앱 안에서 몇 번째인지를 세어 두고, 첫 화면이면 `router.back()` 대신 `backTo`(목록)로 `replace` 한다.
`markReplacedNavigation()` 은 이 교체 이동이 깊이를 늘리지 않게 한다. 테스트: `src/lib/appHistory.test.ts`.

### react-aria 링크와 Next 라우터

Untitled UI 의 `Button href` / `Link` 는 react-aria 라 기본은 전체 새로고침이다.
`src/providers/routerProvider.tsx` 가 `RouterProvider` 에 `useRouter().push` 를 물려 클라이언트 이동으로 바꾼다.
`target="_blank"` 외부 링크는 예외로 새 탭.

## 클라이언트 상태

스토어는 하나다: `src/store/useAppStore.ts` (zustand + persist, 키 `zgnn-jeju`).

| 필드 | 무엇 | 소비처 |
|---|---|---|
| `savedIds` | 저장한 장소 id | 저장 화면, 하트, 탭바 배지, 지도 `?saved=1` |
| `checkedItemIds` | 챙긴 준비물 id | 준비물, 홈 진행률 |
| `season` | `null`(사계절) / 여름 / 겨울 | 준비물 필터, 홈 계절 칩(`SeasonChips` 공용) |
| `amenityStayId` | 구비 용품을 반영할 숙소 | 준비물 "숙소 용품 반영" (`useChecklistAmenities`, `src/lib/amenities.ts`) |
| `dog` | 우리 강아지 프로필(`TDogProfile \| null`) | `/dog` 프로필 폼, 판정(`useEligibility`/`useEligibilityMap`, `src/store/useDogEligibility.ts`) |
| `needsIndoor` | 이번 여행에 실내 자리가 꼭 필요한지 | 판정의 `opts.needsIndoor` — 강아지 정보가 아니라 여행 정보라 `dog` 와 분리(→ [features/dog-profile.md](../features/dog-profile.md)) |

- **하이드레이션**: HTML 이 빌드 때 만들어지므로 첫 렌더에서 localStorage 를 읽으면 서버 HTML 과 어긋난다.
  `skipHydration: true` 로 두고 `src/providers/storeHydration.tsx` 가 마운트 뒤 `rehydrate()` 한다. 첫 프레임의 "저장한 곳 0" 은 의도.
- **정합성**: `merge` 에서 데이터에 더 이상 없는 id 를 걸러낸다. Notion 자료가 바뀌어 장소가 사라져도 저장 목록이 깨지지 않는다.
- v1 의 강아지 프로필도 이 스토어에 필드로 들어간다(→ [features/dog-profile.md](../features/dog-profile.md)). 서버가 없으니 다른 선택지가 없다.

## 순수 로직은 `src/lib/`

화면 컴포넌트는 표시만 하고, 판단은 `lib/` 의 순수 함수가 한다(파서·필터·체크리스트 진행률·구비 용품 매핑·거리 계산).
테스트가 필요한 것은 전부 여기 있고 vitest 는 Next 를 거치지 않는다(`vitest.config.mts` 가 `@/` 경로를 따로 읽는다).

## 안티패턴

- `screens/` 에서 `localStorage` 를 직접 읽지 않는다. 스토어 밖 읽기는 하이드레이션 불일치를 만든다.
- 종류 색을 화면에서 하드코딩하지 않는다. `TYPE_COLOR` / `typeTint` / `theme.css` 토큰만 쓴다.
- `components/base/` 를 고치지 않는다. Untitled UI 갱신 시 덮어써진다. 변형이 필요하면 감싸는 컴포넌트를 만든다.
- 새 파일은 소유 화면 접두어를 붙인다(`placeDetailNearby.tsx`, `useMapPageWideLayout.ts`). 두 화면 이상이 공유할 때만 접두어 없이 `components/` 로 올린다.
