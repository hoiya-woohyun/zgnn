# 라우팅 · 화면 셸 · 클라이언트 상태

> 최종 수정: 2026-09-17 (v10: 메인 탭에서 제목이 스크롤로 사라지면 축약 줄이 대신 나타난다 — `CollapsingTitleBar`(홈·준비물))
> 최종 수정: 2026-09-17 (v10: 맨 위 면을 전 화면 크림으로 통일 — `<html>` 배경 동기화·`under-app-bar` 삭제, 홈 히어로는 라운드 판 → [ADR-010 v3](../decisions/ADR-010-shell-owned-safe-area.md))
> 이전 (v9: 상태바 인셋의 색 띠를 버리고 첫 블록이 직접 위로 번지게(`bleed-top-*`) — `topSurfaceColorOf` 삭제 → [ADR-010 v2](../decisions/ADR-010-shell-owned-safe-area.md). 있는 탭을 다시 누르면 맨 위로)
> 이전 (v8: 상태바 인셋도 셸이 처리 — 인셋 높이의 색 띠 + 내용 여백, 색은 `topSurfaceColorOf` → [ADR-010](../decisions/ADR-010-shell-owned-safe-area.md). 탭바 불투명)
> 이전 (v7: 뒤로가기 줄이 스크롤을 따라온다(`sticky`) → [ADR-007 v2](../decisions/ADR-007-shell-owned-back-navigation.md). 하단 시트 바닥 여백 = 내용 여백 + safe-area(`pb-sheet`). 준비물 묶음을 '어디서 쓰는가' 로 → [ADR-009 v2](../decisions/ADR-009-trip-derived-checklist.md))
> 이전 (v6: 준비물을 저장한 곳 기준으로 좁힘 — `amenityStayId` 와 숙소 선택 셀렉트 제거 → [ADR-009](../decisions/ADR-009-trip-derived-checklist.md))
> 이전 (v5: 저장 탭이 설정 탭으로 — `/settings` 가 루트, `/saved`·`/dog` 는 그 안의 화면. 탭바의 저장 개수 배지 제거. 홈 계절칩은 이동하지 않고 고르기만)
> 이전 (v4: 긴 목록 select 는 모바일에서 하단 시트로 — `SheetSelect`, `useMediaQuery`. 하단 시트에 핸들·끌어내려 닫기)
> 이전 (v3: 뒤로가기를 화면이 아니라 셸이 붙인다 — `lib/appRoutes.ts` 의 루트 판정, 둘러보기 조건은 모바일에서 시트로 접음)
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
- `/map` 은 Kakao 지도 SDK 를 `document.head` 에 스크립트로 붙여 받는다 — 서버에는 그 DOM 이 없어
  `src/app/map/mapRouteClient.tsx` 가 `dynamic(..., { ssr: false })` 로 감싼다.
  화면 본체(`mapPage`)는 무엇을 보여줄지만 정하고, 지도와 마커는 `mapPageCanvas` 가 SDK 를 명령형으로 다룬다
  (→ [ADR-008](../decisions/ADR-008-kakao-map.md)).

## 화면 셸 (`src/components/layout/`)

| 폭 | 구성 |
|---|---|
| < 768px | 하단 `AppTabBar`(홈·지도·둘러보기·준비물·설정) |
| ≥ 768px | 좌측 고정 `AppSidebar`. 탭바는 숨김 |
| ≥ 1024px (지도만) | 목록 패널 + 지도 2단 (`useMapPageWideLayout`) |

폭과 무관하게, **메인 탭이 아닌 화면에는 셸이 상단 `AppBar`(뒤로가기)를 얹는다** — 아래 참고.

**이미 서 있는 탭을 다시 누르면 맨 위로 부드럽게 돌아간다**(`AppTabBar`). 조건은 "지금 주소가
그 탭의 주소와 같은가" 이며, `navItems.isActive` 를 쓰면 안 된다 — 둘러보기 항목은 탭
하이라이트를 위해 `/place/:id` 까지 자기 것으로 보므로, 상세에서 둘러보기를 눌러도 목록으로
가지 못하고 제자리에서 스크롤만 한다. 다른 탭으로 옮길 때는 아무것도 하지 않는다(셸이
경로가 바뀌면 스크롤을 0 으로 되돌린다). 전역 `scroll-behavior: smooth` 도 쓰지 않는다 —
그 리셋까지 애니메이션돼 화면 전환마다 스크롤이 흐른다.

**브레이크포인트는 배치만이 아니라 크기도 바꾼다.** `globals.css` 가 `--spacing` 을 768px·1024px 에서
4 → 4.5 → 5px 로 올리고, 이 레포의 타이포·간격·컨트롤 높이가 전부 그 파생이라 화면 전체가 같은 비율로
커진다. 모바일 4px 은 44px 터치 기준이 걸려 있어 고정이다([ADR-006](../decisions/ADR-006-responsive-scale-and-font.md)).
본문 글꼴(나눔스퀘어 네오)도 `src/app/layout.tsx` 의 `next/font/local` 이 `<html>` 에 변수로 얹어,
`theme.css` 의 `--font-body` 가 그것을 1순위로 읽는다.

- 좌우 패딩 계약(`px-4 md:px-6`)은 **예외가 없다**(v10). 홈 히어로가 유일한 예외로 화면 끝까지 깔렸었는데, 라운드 판이 되면서 같은 계약으로 들어왔다.

### 뒤로가기 — 화면이 아니라 셸이 붙인다

> 왜 이렇게 했는지는 [ADR-007](../decisions/ADR-007-shell-owned-back-navigation.md).

`AppShell` 이 경로를 보고 **메인 탭이 아닌 모든 화면**에 `AppBar`(뒤로가기만, 제목 없음)를 얹는다.
화면 쪽 코드는 아무것도 하지 않는다 — 새 화면을 만들면 뒤로가기가 저절로 생긴다.

- **루트 판정은 `src/lib/appRoutes.ts`** 의 `ROOT_ROUTES` 한 곳. 메인 탭 5개(`/`, `/map`,
  `/places/{stay,restaurant,cafe}`, `/checklist`, `/settings`)만 루트다. 둘러보기는 주소가 셋이지만
  사용자에게는 한 화면 안의 탭 전환이라 셋 다 루트다.
- `parentRouteOf`: 상세는 장소 종류의 목록으로, **`/saved`·`/dog` 는 `/settings` 로**(설정 탭 안의
  화면이라서), 그 밖은 홈으로. 설정 탭의 `isActive` 도 `/saved`·`/dog` 를 자기 것으로 본다.
- **모르는 경로는 하위 화면으로 친다.** 기본값이 반대였다면 새 화면마다 뒤로가기를 기억해야 한다.
- `navItems.ts` 의 `isActive` 를 재사용하면 안 된다 — 둘러보기 항목은 탭 하이라이트를 위해
  `/place/:id` 까지 자기 것으로 보므로, 상세가 루트로 분류돼 뒤로가기를 잃는다.
- `AppBar` 는 배경을 칠하지 않는다. **스크롤을 따라 내려가며** 상세의 종류 색 판 위에도 그 아래
  본문 위에도 얹히기 때문이다 — 칠하면 따라다니는 색 띠가 된다.
- **v10 부터 하위 화면은 전부 같다.** 상세 제목 판이 자기를 끌어올리던 음수 마진(`under-app-bar`
  → 그 전 `-mt-14 pt-14`)을 버려, `/saved`·`/dog` 처럼 앱바 줄 자리가 크림으로 남는다. 상세만
  예외였던 것이 규칙으로 들어왔다.
- `AppBar` 는 **`sticky top-safe`** 라 스크롤을 따라온다. `fixed` 로 바꾸면 흐름에서 빠져 높이가
  0 이 되고, 아래 내용이 그만큼 올라와 뒤로가기 버튼 밑에 깔린다(v9 까지는 상세 제목 판을 화면
  밖으로 밀어내기까지 했다 — v10 에서 그 음수 마진이 없어져 결합은 풀렸다).
  줄은 투명한 채로 두고 **버튼에만** 반투명 알약 배경을 준다. 줄 전체는 `pointer-events-none`,
  버튼만 `pointer-events-auto` — 아니면 빈 줄이 아래 내용의 터치를 가로챈다(→ [ADR-007 v2](../decisions/ADR-007-shell-owned-back-navigation.md)).
- 제목은 셸이 모른다(경로만 안다). 그래서 상세의 큰 이름이 폭과 무관하게 그 화면의 유일한 `h1` 이다.

### 상태바 인셋 — 여백은 셸이, 맨 위 면은 전 화면 크림

`viewportFit: cover` 라 내용이 상태바 밑까지 깔린다. **여백은 셸이 한 곳에서만 준다** —
`<main>` 에 인셋만큼. 화면 쪽에 `pt-safe` 는 없다.

그 여백은 아무도 칠하지 않아 페이지 바탕(크림)이 비친다. **모든 화면의 맨 위 면이 크림이므로
그것으로 끝난다**(v10) — 화면 쪽에서 할 일이 없다. 홈 히어로는 그 크림 아래의 라운드 판이고,
상세 제목 판은 앱바 줄 밑에서 시작한다. 지도만 여백조차 없다.

`bleed-top-*` 은 둘러보기 검색 줄(`bleed-top-4`) 하나만 쓴다. 색을 바꾸려는 게 아니라 위에
붙었을 때(`top-0`) 자기 블러 배경으로 인셋 자리를 덮는 용도다.

**두 번 고쳤고 두 번 다 "화면마다 맨 위 색이 다르다" 가 원인이었다.** v8 은 셸이 인셋 높이의
띠를 `fixed` 로 깔고 경로표(`topSurfaceColorOf`)가 첫 블록의 색을 복제해 칠했는데, 띠가
viewport 에 고정돼 스크롤을 내리면 색이 안 맞는 내용 위에 홀로 떠 있었다. v9 는 띠를 버리고
첫 블록(`data-top-surface`)의 색을 읽어 `<html>` 배경에 옮겨 담았다. v10 은 전제를 없앴다 —
`<html>` 배경은 `globals.css` 가 크림으로 정적으로 칠하고 아무도 덮어쓰지 않는다(→
[ADR-010 v3](../decisions/ADR-010-shell-owned-safe-area.md)).

**화면 위에 뜨는 줄은 불투명이어야 한다.** iOS 26 Safari 가 가장자리 `fixed`/`sticky` 요소의
배경색을 읽어 자기 툴바를 칠하는데, `collapsingTitleBar` 는 접히지 않은 동안에도 `opacity-0`
으로 **남아 있어** 보이지 않는 채로 그 색을 정할 수 있다. 탭바·축약 줄 모두 불투명이다.

**딥링크 보정(`src/lib/appHistory.ts`)** — 링크로 상세에 바로 들어온 사용자가 뒤로가기를 누르면 앱 밖으로 나간다.
그래서 history 항목이 앱 안에서 몇 번째인지를 세어 두고, 첫 화면이면 `router.back()` 대신
`parentRouteOf(pathname)` 으로 `replace` 한다. 상세의 부모는 장소 종류에 따라 갈리므로(카페 상세 → `/places/cafe`)
경로만 보지 않고 데이터를 본다. `markReplacedNavigation()` 은 이 교체 이동이 깊이를 늘리지 않게 한다.
테스트: `src/lib/appHistory.test.ts`, `src/lib/appRoutes.test.ts`.

### 제목이 사라지면 축약 줄이 대신 선다 (`CollapsingTitleBar`)

메인 탭에는 `AppBar` 가 없다(뒤로가기가 필요 없으므로). 그래서 아래로 내려가면 상단에
아무것도 남지 않는다 — 준비물은 목록이 길어 "몇 개 남았더라" 를 보려면 맨 위까지 되올라가야
했다. 제목 블록이 화면 밖으로 나가는 **그 순간에만** 한 줄(제목 + 짧은 요약 + 진행 막대)을
띄운다. 위에 있을 때는 큰 제목이 이미 말하므로 아무것도 하지 않는다.

지금 쓰는 곳은 **홈**(`강아지랑 제주`)과 **준비물**(`여행 준비물` + `4/12 준비됨` + 진행 막대)
둘뿐이다. 나머지 셋은 붙이지 않는다 — 둘러보기는 이미 종류 탭·검색이 `sticky` 로 남고,
지도는 스크롤이 없으며, 설정은 한 화면에 들어온다.

- **`fixed` 다.** 나타났다 사라지는 줄이 흐름에 자리를 차지하면 나타나는 순간 아래 내용이
  통째로 밀려 읽던 자리가 튄다. 늘 있어서 자리를 잡아 두어야 하는 `AppBar`(`sticky`)와
  갈리는 지점이다.
- **상태바 인셋은 스스로 칠한다.** 셸은 색을 모르므로(위 절), 화면 위에 떠서 그 자리를
  덮는 줄은 자기 배경을 인셋만큼 위로 늘려야 한다 — 안 그러면 노치 기기에서 이 줄 위로
  내용이 스쳐 지나간다.
- **접히는 지점은 JS 로 재지 않는다.** 제목 블록 바닥에서
  `calc(env(safe-area-inset-top) + var(--spacing) * 14)` 만큼 띄운 1px 센티넬을
  `IntersectionObserver` 로 본다. 노치 높이도 반응형 스케일(`--spacing`)도 브라우저가 계산하므로,
  기기를 돌리거나 브레이크포인트를 넘어도 다시 잴 것이 없다. 재는 쪽으로 만들면 그
  재계산을 한 번 빠뜨린 상태에서만 접히는 지점이 어긋난다.
- `isIntersecting` 만 보면 안 된다 — 화면이 길어 페이지 전체가 들어오는 데스크톱에서는 센티넬이
  **아래로** 벗어난 경우에도 참이 아니게 된다. 위로 나갔을 때만 접도록 `boundingClientRect.top < 0`
  을 함께 본다.
- 줄 전체가 `aria-hidden` 이다. 제목도 진행률도 본문에 진짜가 있고 여기 것은 복사본이라,
  스크린리더가 두 번 읽으면 안 된다.

### 둘러보기 조건은 모바일에서 접힌다

`/places/[type]` 의 조건은 다섯 묶음(읍면·방향·가격 정렬·반려동물 조건·우리 강아지 기준)이라
고정 영역이 첫 화면의 절반을 먹고 목록이 두어 장만 보였다. 모바일에서는 그 다섯을
`PlacesPageFilterSheet`(바텀시트)로 접고 검색창 옆 `필터` 버튼 하나만 남긴다(사용자 문구는 "필터", 판정 레벨 "조건부" 와 헷갈리지 않게) — 고정 영역은 종류 탭 + 검색 두 줄.
데스크톱(≥768px)은 세로가 넉넉해 지금처럼 펼쳐 둔다.

- `PlacesPageFilters` / `PlacesPageEligibilityToggles` 가 `variant='bar' | 'sheet'` 로 같은 조건을 두 모양으로 그린다.
  모바일·데스크톱 판이 DOM 에 둘 다 있지만 숨은 쪽은 `hidden`(= `display:none`)이라 탭 순서·스크린리더에서도 빠진다.
- **"적용" 버튼을 두지 않고 누르는 즉시 반영한다.** 읍면은 이미 스토어(`town`)에 바로 쓰이고 종류를 바꾸면
  조건이 통째로 리셋되는 구조라(`key={type}`), 초안 상태를 하나 더 끼우면 그 둘이 어긋난다.
- 버튼의 숫자에는 검색어를 넣지 않는다 — 검색창은 시트 밖에 그대로 보이므로, 넣으면 시트를 열었을 때
  켜져 있는 조건 수와 어긋난다.

### 긴 목록 select 는 모바일에서 하단 시트로 (`SheetSelect`)

Untitled UI 의 `Select` 는 트리거 폭에 맞춘 앵커 팝오버(최대 224px)라, 읍면(20여 곳)·숙소(26곳)처럼
긴 목록을 넣으면 폰에서 `w-40` 폭 안에 다섯 줄씩 보이는 좁은 드롭다운이 된다. 그래서
`src/components/sheetSelect.tsx` 가 **<768px 에서는 `BottomSheet` 피커, 그 이상은 보통 `Select`** 로 가른다.
지금은 지도 읍면(`mapPage.tsx`) 한 곳만 쓴다 — 준비물의 숙소 선택은 없앴다(ADR-009).

- **항목이 서너 개면 그냥 `Select` 를 쓴다** — 가격 정렬(3)·강아지 크기(3)는 그대로다. 정렬은 이미
  `PlacesPageFilterSheet` 안에 있어서 시트 위에 시트가 되기도 한다.
- 폭 기준(md)인 이유: 시트는 `document.body` 로 포털되어 CSS(`md:hidden`)로 못 숨기므로 JS 로 갈라야 하고,
  둘러보기 조건 시트와 같은 지점에서 갈라 화면마다 규칙이 다르지 않게 했다. `src/hooks/useMediaQuery.ts`
  (기존 `useMapPageWideLayout` 을 일반화)가 `useSyncExternalStore` 로 읽는다 — 정적 HTML 의 첫 프레임은
  서버 스냅샷 `false`(= 드롭다운 쪽)로 그려지지만 트리거 모양이 같아 티가 안 난다.
- 시트는 `selectionMode='single'` 인데 react-aria 는 이 모드에서 항목을 눌러도 `onAction` 을 안 부르고,
  이미 고른 항목을 다시 누르면 선택을 **비운다**. 그래서 `onSelectionChange` 하나로 받되 빈 선택은
  "값 유지 + 닫기" 로 다룬다 — 어느 행을 눌러도 시트가 닫힌다.
- `BottomSheet` 는 위쪽 핸들 띠(28px, `touch-action: none`)를 **터치로** 끌어내리면 닫힌다(96px 이상 또는
  빠른 튕김). 시트 전체를 잡게 하지 않는 이유: `touch-action` 은 조상이 막으면 자식이 되살릴 수 없어
  안쪽 목록 스크롤과 양립이 안 된다. 끌리는 이동은 `AriaDialog` 에 걸어 `AriaModal` 의 닫힘 keyframe 과
  안 싸우고, 그 상태는 닫히면 언마운트되는 패널 컴포넌트에 둬 되돌리는 effect 가 없다. 마우스는 제외.
- 시트 바닥 여백은 `pb-sheet`(globals.css) 하나로 준다 — `p-4 pb-safe` 처럼 겹쳐 쓰면 둘 다
  `padding-bottom` 이라 한쪽이 다른 쪽을 **덮어쓴다**(더해지지 않는다). 인셋이 없는 기기에서는
  바닥 여백이 통째로 0 이 되고, 있는 기기에서는 홈 인디케이터에 마지막 줄이 깔린다.
  인셋만 필요한 탭바는 `pb-safe` 를 그대로 쓴다.
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
| `savedIds` | 저장한 장소 id | 저장 화면(`/saved`, 설정 안), 하트, 홈 카드·설정의 "저장한 곳 N곳" 개수, 지도 `?saved=1`, **준비물 좁히기**(`checklistView` — 저장한 곳에 필요한 것만 센다, ADR-009) |
| `checkedItemIds` | 챙긴 준비물 id | 준비물, 홈 진행률, 장소의 `MissingItemsNote` |
| `season` | `null`(사계절) / 여름 / 겨울 | 준비물 필터, 홈 계절 칩(`SeasonChips` 공용 — 홈에서는 고르기만 하고 이동하지 않는다. "준비물 N가지" 링크의 숫자가 바뀌는 것이 피드백) |
| `dog` | 우리 강아지 프로필(`TDogProfile \| null`, 마리별 `dogs[]`) | `/dog` 프로필 폼, 설정의 "우리 강아지" 카드, 판정(`useEligibility`/`useEligibilityMap`, `src/store/useDogEligibility.ts`). 목록·홈·지도·근처 장소(`placeCard.tsx`, `placesPage.tsx`, `homePage.tsx`, `mapPage.tsx`, `mapPageSheet.tsx`, `placeDetailNearby.tsx`)는 이 값이 `null` 이면 판정 관련 UI 를 아예 그리지 않는다(v0 화면 유지) |
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
