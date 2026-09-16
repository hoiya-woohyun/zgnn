# 색·사이즈 감사 — 2026-09-16

> 최종 수정: 2026-09-16 (미결 3건 처리 — 프리셋 바닥값 고정 / 썸네일 규칙 명문화 / 마커 예외 기록)

> 방법: 2026-09-15 디자인 리뷰([2026-09-15-design-review.md](./2026-09-15-design-review.md)) 이후,
> 색 조화와 사이즈 스케일을 별도 감사. 클래스명이 아니라 **브라우저에서 `getBoundingClientRect()` 로
> 실제 렌더 기하를 측정**해 검증했다. 측정이 감사보다 3건을 더 잡았다.

## 1. 색 — 팔레트 밖으로 나갔던 것을 되돌림

| 대상 | 전 | 후 | 이유 |
|---|---|---|---|
| `petBadges` `warn` | indigo | orange(채도 0.110 으로 눌러 `theme.css` 에서 재정의) | indigo 는 H 277°·채도 0.240 으로 앱에서 가장 진해, "확인 필요" 라는 **부가 정보가 주 버튼(브랜드, 0.205)보다 먼저 눈에 드는 위계 역전**. 원래 회피 대상이던 식당 타입 색(#cf8330)과의 충돌은 채도 높은 앰버끼리의 문제였고, 작은 칩과 큰 파스텔 워시는 형태가 달라 같은 색상대라도 부딪히지 않는다. |
| `eligibilityBadge` `hard` | slate | neutral(한 단계 진하게) | Tailwind 기본 slate 는 H 257° 의 **차가운** 청회색이라 "잉크" 라는 의도와 반대였다. `placeCard` 배지 줄에서 크림 gray 칩(H 78°)과 색상환 179° 차이로 맞닿았다. |
| 판정 배지 4단계 | — | 가능(브랜드 핑크) → 조건부(앰버) → 정보 없음(크림 뉴트럴) → 어려움(잉크) | **"무게" 로 읽히게** 정렬. 앰버는 이 앱에서 언제나 "주의" 를 뜻하도록 파서 배지와 판정 배지가 같은 색을 쓴다. |
| 켜진 필터 표시 | 판정 토글만 진한 면 | 연한 워시(`bg-brand-primary` + 진한 브랜드 글씨) | 규칙: **지도 오버레이 위의 컨트롤만** 진한 면을 쓴다(복잡한 바탕 위에서 읽혀야 하므로). 그 밖의 선택 상태는 전부 워시. 판정 토글은 타입 탭·계절 칩과 같은 역할인데 혼자 다른 언어로 그려지고 있었다. |

## 2. 사이즈 — 44px 은 취향이 아니라 이 레포의 규칙

[2026-09-15-design-review.md:113](./2026-09-15-design-review.md) 이 44px 을 "의식적으로 지킴" 으로
명시하고 있어, 아래는 취향 교정이 아니라 **자체 규칙에 대한 회귀**로 다뤘다.

| 파일 | 문제 | 조치 |
|---|---|---|
| `seasonChips.tsx` | 40px | `h-11` + 포커스 링 |
| `mapPage.tsx` "저장한 곳만 보는 중" | 실질 ≈26px | `min-h-11` |
| `mapPage.tsx` `missingByType` 링크 3개 | ≈26px (**감사가 놓침**) | `min-h-11` |
| `dogProfileSizeOverride.tsx` 되돌리기 | 패딩 0 텍스트 버튼 ≈18px | `min-h-11` |
| `placesPage.tsx` 조건 지우기 | `link-color` 가 `p-0!` 강제 | `min-h-11` |
| `placesPage.tsx` 검색 input | 40px (**감사가 놓침**) | `size="lg"` |
| `dogProfilePage.tsx` · `dogProfileWeightRows.tsx` | `wrapperClassName="h-11"` (**감사가 놓침**) | `size="lg"` |

**`wrapperClassName="h-11"` 은 쓰지 말 것.** 겉박스만 44px 로 키우고 input 은 40px 로 남아,
위아래 2px 가 **탭해도 포커스가 안 잡히는 죽은 띠**가 된다(측정으로 확인 — `document.activeElement`
가 `BODY`). 입력이 44px 이어야 하면 `size="lg"` 를 쓴다.

오탐으로 제외한 2건: 20px `<select>` 는 React Aria `HiddenSelect`(`aria-hidden`,
`clip-path: inset(50%)`)이고 실제 히트 대상은 44px 버튼. 13px 체크박스 input 은 44×44 `<label>` 안에 있다.

### 44px 의 예외 — 문장 안의 인라인 링크

WCAG 2.5.8 은 **문장 안에 있어 줄 높이에 크기가 묶인 링크**를 타깃 크기 기준에서 제외한다.
이 앱에서 해당하는 것은 `homePage.tsx:172`("…{author}님이 정리한 자료입니다. **원본 노션 보기**")와
`mapPage.tsx:282`("지도에 없는 N곳은 목록에서 보기: **숙소 1곳**, …") 두 곳이며, 그대로 둔다.

반대로 **혼자 선 링크는 예외가 아니다.** 2026-09-16 측정에서 `appSidebar.tsx` 푸터의
"원본 노션 보기" 가 18px 로 남아 있는 것을 찾아 `min-h-11` 을 넣었다(데스크톱 사이드바라
모든 페이지에 떠 있었다). 판별 기준은 "링크가 문장의 일부인가" 다.

### 측정 검증 (2026-09-16)

`getBoundingClientRect()` 로 실제 렌더 기하를 다시 측정했다 — 클래스가 컴파일됐다는 것과
박스가 실제로 그 크기라는 것은 다른 얘기라서. 44px 은 **터치** 기준이므로 측정도 모바일 폭이 기준이다.

- **390×844**(주 기준): `/places/cafe`, `/place/<id>`, `/map`(마커를 눌러 시트를 연 상태) →
  **44px 미만 0건**. 시트의 닫기·자세히 보기·저장 전부 44px.
- **1280**(사이드바가 뜨는 폭): 위 예외 3종(문장 안 인라인 링크, Leaflet·OSM 저작자 표시, 지도 마커)
  외에 0건. 데스크톱에서만 보이던 `appSidebar` 푸터 링크 18px 을 여기서 잡았다.
- `lg` 프리셋의 `min-h-11` 이 no-op 임을 확인 — 두 폭 모두에서 해당 컨트롤의 측정 높이가 44px 그대로다.
- `PlaceThumb` 도 의도대로다: `/places/cafe` 카드 썸네일 26개와 지도 시트 1개는 44px(`primary`),
  상세의 근처 장소 3개는 40px(`compact`). 820px 에서는 같은 썸네일이 50px 로 커진다(spacing 파생 확인).
- 오탐 1건 추가: 시트 안 1px `<button>`("무시")은 react-aria Modal 이 넣는 보이지 않는 dismiss 버튼.

## 3. 미결이었던 3건 — 2026-09-16 처리

### (1) 프리셋이 터치 기준과 무관하게 설계돼 있었다 → 바닥값으로 고정

`lg` 가 44px 인 것은 설계가 아니라 **산술적 우연**이었다: `py-2.5`(20px) + `text-md` line-height(24px).
우연에 기대면 프리셋 구성이 바뀌는 순간(색 variant 가 `p-0!` 로 패딩을 지우거나, line-height 토큰만
따로 조정되거나) 여기 기댄 터치 타깃 12곳이 조용히 무너진다.

**이 바닥값은 절대 44px 이 아니다.** `min-h-11` 역시 `--spacing` 파생이라 모바일에서 44px 이고 화면이
커지면 함께 커진다([ADR-006](../decisions/ADR-006-responsive-scale-and-font.md)). 화면 폭과 무관한
절대 바닥이 필요해지면 `min-h-[44px]` 이어야 하고, 그건 별도 판단이다.

- `src/components/base/button.tsx` `sizes.lg.root` 와 `src/components/base/input.tsx` `sizes.lg.root` 에
  **`min-h-11` 을 추가**해 우연을 계약으로 바꿨다. 현재 렌더 기하는 그대로다(no-op guard).
- 벤더 코드(`components/base/`, Untitled UI)에 대한 **로컬 변경**이므로 각 자리에 그 사실을 주석으로 남겼다.
  원본을 유지하고 싶으면 두 줄에서 `min-h-11` 만 지우면 되돌아간다.
- 프리셋이 보장하므로 `dogProfilePage.tsx` 의 호출부 `className="h-11"` 덮어쓰기 2건은 제거했다.

### (2) `PlaceThumb` 44 vs 40 → 드리프트가 아니라 규칙. 평탄화하지 않고 명문화

주 목록(`placeCard`, `mapPageSheet`)은 44, 조밀한 보조 목록(`mapPage` 사이드바,
`placeDetailNearby`)은 40 — **일관돼 있었으나 숫자 리터럴이라 규칙인지 실수인지 구분할 수 없었다.**
`src/components/placeThumb.tsx` 에 `PLACE_THUMB = { primary, compact }` 를 두고 호출부는
`variant="compact"` 처럼 **이름으로** 고르게 했다(숫자를 넘기던 prop 은 없앴다).
크기는 px 가 아니라 spacing 파생 클래스(`size-11`/`size-10`)라 화면이 커지면 같이 커진다
([ADR-006](../decisions/ADR-006-responsive-scale-and-font.md)). 남은 px 값은 `<img>` 의
width/height 속성 — CSS 가 오기 전 자리를 잡는 용도다.
세 번째 치수가 필요하면 리터럴을 더 적을 게 아니라 규칙을 다시 논의한다.

### (3) 지도 마커 18px × 84개 → 의도된 예외로 기록

마커 크기는 UI 컨트롤 크기가 아니라 **카토그래피 결정**이다. 86곳이 제주 동부·애월에 몰려 있어
핀을 키우면 서로 겹치고, 히트 영역만 키우면 겹친 영역이 이웃의 탭을 가로챈다.
작게 두되 다른 경로로 보완한다 — 선택 시 26px, `role=button` + `tabindex` 로 키보드 접근,
그리고 같은 장소를 44px 행으로 고를 수 있는 목록(`/places/*`)이 항상 있다.
판단 근거를 `src/screens/mapPage.tsx` 의 `markerIcon` 에 주석으로 남겼다.

## 4. 메모 수준으로 남긴 것

같은 "행 아이템" 인데 `mapPage.tsx:295`(`rounded-xl`) vs `dogProfileCarrierPicker.tsx:38`(`rounded-2xl`) /
페이지 제목에 `display-xs` 와 `display-sm` 혼재 / `text-xl` 사실상 1회용 / 배지 `lg` 정의만 되고 미사용 /
하프스텝 간격(gap-2.5, mt-2.5) 산재 / 장식용 아이콘 타일 `size-10` vs `size-12`.
