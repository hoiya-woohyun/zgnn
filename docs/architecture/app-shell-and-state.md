# 라우팅 · 화면 셸 · 클라이언트 상태

> 최종 수정: 2026-09-16 (v4: 긴 목록 select 는 모바일에서 하단 시트로 — `SheetSelect`, `useMediaQuery`. 하단 시트에 핸들·끌어내려 닫기)
> 이전 (v2: 브레이크포인트가 레이아웃뿐 아니라 크기도 바꾼다 — `--spacing` 스케일과 글꼴 배선)
> 이전 (v1: 신설)

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

**브레이크포인트는 배치만이 아니라 크기도 바꾼다.** `globals.css` 가 `--spacing` 을 768px·1024px 에서
4 → 4.5 → 5px 로 올리고, 이 레포의 타이포·간격·컨트롤 높이가 전부 그 파생이라 화면 전체가 같은 비율로
커진다. 모바일 4px 은 44px 터치 기준이 걸려 있어 고정이다([ADR-006](../decisions/ADR-006-responsive-scale-and-font.md)).
본문 글꼴(나눔스퀘어 네오)도 `src/app/layout.tsx` 의 `next/font/local` 이 `<html>` 에 변수로 얹어,
`theme.css` 의 `--font-body` 가 그것을 1순위로 읽는다.

- `AppBar` 의 `tone="overlay"` 는 상세 제목 판처럼 **부모가 이미 바탕색을 가진 경우**다. 배경·테두리 없이 얹히고 sticky 도 아니다. 상세 제목 판(`placeDetailHeader.tsx`) 은 큰 이름을 모바일에선 `aria-hidden` 장식(실제 h1 은 `AppBar` 쪽), 데스크톱에선(`AppBar` 가 `md:hidden`) 유일한 `h1` 로 — 폭에 따라 "진짜 제목" 을 맡는 쪽이 갈린다.
- 홈 히어로만 셸의 중앙 정렬 폭을 넘어 화면 끝까지 깔린다. 나머지는 `PageHeader` / `Section` 의 좌우 패딩 계약을 따른다.

### 뒤로가기 (`src/lib/appHistory.ts`)

링크로 상세에 바로 들어온 사용자가 뒤로가기를 누르면 앱 밖으로 나가 버린다.
그래서 history 항목이 앱 안에서 몇 번째인지를 세어 두고, 첫 화면이면 `router.back()` 대신 `backTo`(목록)로 `replace` 한다.
`markReplacedNavigation()` 은 이 교체 이동이 깊이를 늘리지 않게 한다. 테스트: `src/lib/appHistory.test.ts`.

### 긴 목록 select 는 모바일에서 하단 시트로 (`SheetSelect`)

Untitled UI 의 `Select` 는 트리거 폭에 맞춘 앵커 팝오버(최대 224px)라, 읍면(20여 곳)·숙소(26곳)처럼
긴 목록을 넣으면 폰에서 `w-40` 폭 안에 다섯 줄씩 보이는 좁은 드롭다운이 된다. 그래서
`src/components/sheetSelect.tsx` 가 **<768px 에서는 `BottomSheet` 피커, 그 이상은 보통 `Select`** 로 가른다.
지도 읍면(`mapPage.tsx`)과 준비물의 숙소 선택(`checklistPage.tsx`, 예전엔 native `<select>`)이 쓴다.

- **항목이 서너 개면 그냥 `Select` 를 쓴다** — 가격 정렬(3)·강아지 크기(3)는 그대로다. 정렬은 이미
  `PlacesPageFilterSheet` 안에 있어서 시트 위에 시트가 되기도 한다.
- 폭 기준(md)인 이유: 시트는 `document.body` 로 포털되어 CSS(`md:hidden`)로 못 숨기므로 JS 로 갈라야 하고,
  둘러보기 조건 시트와 같은 지점에서 갈라 화면마다 규칙이 다르지 않게 했다. `src/hooks/useMediaQuery.ts`
  (기존 `useMapPageWideLayout` 을 일반화)가 `useSyncExternalStore` 로 읽는다 — 정적 HTML 의 첫 프레임은
  서버 스냅샷 `false`(= 드롭다운 쪽)로 그려지지만 트리거 모양이 같아 티가 안 난다.
- 시트는 `selectionMode='single'` 인데 react-aria 는 이 모드에서 항목을 눌러도 `onAction` 을 안 부르고,
  이미 고른 항목을 다시 누르면 선택을 **비운다**. 그래서 `onSelectionChange` 하나로 받되 빈 선택은
  "값 유지 + 닫기" 로 다룬다 — 어느 행을 눌러도 시트가 닫힌다.
- 숙소 피커는 저장한 숙소를 위에 한 번 더 보여 주는데(전체 목록에서 빼지 않는다, 과거에 선택이 풀리던
  버그 때문), react-aria 컬렉션은 키가 겹치면 안 된다. `src/lib/checklistPageStayPicker.ts` 가 위쪽 사본에만
  `saved:` 접두어를 붙이고 값으로 쓸 때 떼어 낸다(테스트 있음).
- `BottomSheet` 는 위쪽 핸들 띠(28px, `touch-action: none`)를 **터치로** 끌어내리면 닫힌다(96px 이상 또는
  빠른 튕김). 시트 전체를 잡게 하지 않는 이유: `touch-action` 은 조상이 막으면 자식이 되살릴 수 없어
  안쪽 목록 스크롤과 양립이 안 된다. 끌리는 이동은 `AriaDialog` 에 걸어 `AriaModal` 의 닫힘 keyframe 과
  안 싸우고, 그 상태는 닫히면 언마운트되는 패널 컴포넌트에 둬 되돌리는 effect 가 없다. 마우스는 제외.
- `base/select-item.tsx` 의 `sm` 행에 `min-h-11` 을 넣었다(Untitled 복사본이지만 `select-shared.tsx` 의
  트리거 44px 조정과 같은 선례). 트리거만 44px 이고 드롭다운 행은 38px 이던 불일치를 맞춘 것.

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
| `dog` | 우리 강아지 프로필(`TDogProfile \| null`) | `/dog` 프로필 폼, 판정(`useEligibility`/`useEligibilityMap`, `src/store/useDogEligibility.ts`). 목록·홈·지도·근처 장소(`placeCard.tsx`, `placesPage.tsx`, `homePage.tsx`, `mapPage.tsx`, `mapPageSheet.tsx`, `placeDetailNearby.tsx`)는 이 값이 `null` 이면 판정 관련 UI 를 아예 그리지 않는다(v0 화면 유지) |
| `needsIndoor` | 이번 여행에 실내 자리가 꼭 필요한지 | 판정의 `opts.needsIndoor` — 강아지 정보가 아니라 여행 정보라 `dog` 와 분리(→ [features/dog-profile.md](../features/dog-profile.md)). 둘러보기 식당·카페 탭의 "실내 자리 필요" 토글(`placesPageEligibilityToggles.tsx`)이 값을 바꾼다 |
| `town` | 지금 둘러보는 읍면(`string \| null`) | 둘러보기 읍면 칩(`placesPageFilters.tsx`), 지도 읍면 피커(`mapPage.tsx`, `SheetSelect`), 홈 종류 카드 읍면 바로가기(`homeTypeCard.tsx`) — 한 번 고르면 셋을 넘나들어도 유지된다(2026-09-15 리뷰 P1) |

- **하이드레이션**: HTML 이 빌드 때 만들어지므로 첫 렌더에서 localStorage 를 읽으면 서버 HTML 과 어긋난다.
  `skipHydration: true` 로 두고 `src/providers/storeHydration.tsx` 가 마운트 뒤 `rehydrate()` 한다. 첫 프레임의 "저장한 곳 0" 은 의도.
- **정합성**: `merge` 에서 데이터에 더 이상 없는 id 를 걸러낸다. Notion 자료가 바뀌어 장소가 사라져도 저장 목록이 깨지지 않는다. `town` 도 같은 이유로 `ALL_TOWNS`(`lib/places.ts`)에 없는 값이면 `null` 로 되돌린다.
- v1 의 강아지 프로필도 이 스토어에 필드로 들어간다(→ [features/dog-profile.md](../features/dog-profile.md)). 서버가 없으니 다른 선택지가 없다.

## 순수 로직은 `src/lib/`

화면 컴포넌트는 표시만 하고, 판단은 `lib/` 의 순수 함수가 한다(파서·필터·체크리스트 진행률·구비 용품 매핑·거리 계산).
테스트가 필요한 것은 전부 여기 있고 vitest 는 Next 를 거치지 않는다(`vitest.config.mts` 가 `@/` 경로를 따로 읽는다).

## 안티패턴

- `screens/` 에서 `localStorage` 를 직접 읽지 않는다. 스토어 밖 읽기는 하이드레이션 불일치를 만든다.
- 종류 색을 화면에서 하드코딩하지 않는다. `TYPE_COLOR` / `typeTint` / `theme.css` 토큰만 쓴다.
- `components/base/` 를 고치지 않는다. Untitled UI 갱신 시 덮어써진다. 변형이 필요하면 감싸는 컴포넌트를 만든다.
- 새 파일은 소유 화면 접두어를 붙인다(`placeDetailNearby.tsx`, `useMapPageWideLayout.ts`). 두 화면 이상이 공유할 때만 접두어 없이 `components/` 로 올린다.
