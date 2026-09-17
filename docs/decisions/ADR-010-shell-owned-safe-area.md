# ADR-010 — 상태바 인셋도 화면이 아니라 셸이 처리한다

> 최종 수정: 2026-09-17 (v1: 신설)

## 상태

채택.

## 맥락

`viewportFit: cover` 라 내용이 노치·상태바(`safe-area-inset-top`) 밑까지 깔린다. 그 자리를
어떻게 메울지를 **화면마다 따로** 하고 있었다 — 앱바는 `pt-safe`, 둘러보기 검색 줄도 `pt-safe`,
홈 히어로는 `calc(env(...) + 2.5rem)`, 상세 제목 판은 앱바 높이에 인셋까지 더한 음수 마진.
같은 계산이 네 곳에 흩어져 있었고, 준비물·설정처럼 앱바가 없는 루트 화면은 그 계산이
**빠져** 노치 기기에서만 제목이 상태바 밑으로 들어갔다. 빌드·테스트는 통과한다.

원했던 모습은 단순하다 — **화면 맨 위 면의 색이 상태바 뒤까지 이어져 보이는 것**(홈은
검은 히어로, 상세는 종류 색, 나머지는 크림). 그리고 새 화면을 만들 때 이걸 기억하지
않아도 되는 것. 뒤로가기를 셸로 옮긴 이유([ADR-007](ADR-007-shell-owned-back-navigation.md))와
같다.

## 결정

**셸이 인셋 높이의 띠를 화면 위에 고정하고, 내용은 그만큼 내려 시작한다.** 띠의 색은
`lib/appRoutes.ts` 의 `topSurfaceColorOf(pathname)` 가 경로를 보고 답한다 — 루트 판정
(`isRootRoute`)·부모 판정(`parentRouteOf`)과 같은 자리다.

| 경로 | 띠 색 | 이유 |
|---|---|---|
| `/` | `--color-ink` | 현무암 히어로가 맨 위 면 |
| `/place/:id` | 종류 색 22% tint | 제목 판 그라디언트의 **맨 위 색**. 같아야 이음매가 없다 |
| `/map` | 없음(띠도 여백도 안 둠) | 타일이 상태바 밑까지 깔리는 편이 지도답다 |
| 그 밖 · 모르는 경로 | `--color-bg-secondary` | 페이지 바탕. **새 화면의 기본값** |

화면 쪽에서 사라진 것:

- `AppBar` · 둘러보기 검색 줄: `pt-safe` → `top-safe`(띠 바로 아래에 붙어 따라온다).
- 홈 히어로: `padding-top: calc(env(...) + 2.5rem)` → `pt-10`.
- 상세 제목 판: `-mt-14 pt-14` 만 남는다(앱바 높이만큼). 인셋 몫은 띠가 같은 색으로 칠한다.
- 준비물·설정: 아무것도 안 했는데 고쳐진다 — 이것이 요점이다.

띠는 `fixed` 라 스크롤을 내려도 상태바 뒤에 남는다. 홈에서 히어로를 지나쳐 내려가도
상태바는 잉크색이다 — 네이티브 앱의 내비게이션 바가 그렇듯, 상태바 글씨가 밑을 지나는
내용 위에 얹히지 않는다.

### 탭바는 불투명하게

탭바가 `bg-primary/95` + `backdrop-blur` 였다. 홈 인디케이터 자리(`pb-safe`)로 밑을 지나는
내용이 비쳐 탭바가 거기까지 이어져 보이지 않았다. 불투명 `bg-primary` 로 바꾼다.

## 브라우저 탭에서는 다르게 보인다

이 결정은 **홈 화면에 추가한 PWA(standalone)** 에서 보이는 모습이다. Safari 브라우저 탭에서는
`safe-area-inset-top` 이 0 이라(상태바가 Safari 소유) 띠 높이도 0 이고, 위쪽 색은 Safari 가
정한다:

- iOS 18 이하: `theme-color`(잉크) 로 칠한다. 홈은 맞고 나머지 화면은 어두운 띠가 된다.
- iOS 26(Liquid Glass): `theme-color` 를 무시하고, 화면 가장자리에 붙은 `fixed`/`sticky` 요소의
  `background-color` 를 읽어 자기 툴바를 칠한다(폭 80% 이상·높이 3px 이상). 없으면 `body`
  배경(크림).

그래서 띠(`h-status-bar`)는 **iOS 에서만 최소 4px** 을 갖는다 — Safari 26 이 읽을 수 있을
만큼만. 바로 아래 내용과 같은 색이라 눈에 띄지 않고, `-webkit-touch-callout` 이 iOS 에만
있는 속성이라 데스크톱·Android 에는 걸리지 않는다. 탭바를 불투명하게 한 것도 같은 이유가
하나 더 있다 — 반투명이면 Safari 26 이 흐린 색을 툴바로 가져간다.

Safari 26 의 샘플링은 휴리스틱이라 시트·모달의 `fixed inset-0` 오버레이가 열리면 위·아래가
함께 어두워진다. 네이티브와 같은 모습이므로 손대지 않는다.

## 검증

`env()` 는 데스크톱에서 0 이라 화면을 봐도 알 수 없다. 확인할 때는 `src` 안의
`env(safe-area-inset-top, 0px)` 를 `59px`, `-bottom` 을 `34px` 로 **리터럴 치환**해 촬영하고
되돌린다(fallback 값을 바꾸는 것으로는 안 된다 — Chromium 은 인셋을 항상 0 으로 정의해
fallback 을 쓰지 않는다). 상세(그라디언트 이음매)와 지도(높이 넘침)가 판별 화면이다.

## 관련

- `src/components/layout/appShell.tsx` · `src/lib/appRoutes.ts` · `src/styles/globals.css`(`h-status-bar` · `top-safe`)
- [ADR-007 뒤로가기는 셸이 붙인다](ADR-007-shell-owned-back-navigation.md) — 같은 원칙
- [BUG-001](../bugs/BUG-001-bottom-sheet-bottom-padding.md) — `pt-6 pt-safe` 처럼 겹쳐 쓰면 덮어쓰는 함정. 이 결정으로 화면 쪽에서 그 조합이 사라졌다
- [라우팅 · 화면 셸 · 클라이언트 상태](../architecture/app-shell-and-state.md)
