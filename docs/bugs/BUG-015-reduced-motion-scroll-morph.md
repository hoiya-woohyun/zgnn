# BUG-015 — '동작 줄이기' 에서도 헤더가 스크롤을 따라 줄었고, snap 에서는 상세 제목이 접힌 채로 열렸다

> 최종 수정: 2026-10-08 (v1: 신설 — 주간 평가 W261007.19 의 reduce 항목을 고치다 snap 의 측정 시점 버그가 함께 드러났다)
> 상태: 고침(`src/components/layout/scrollDrivenMorph.ts` · `src/styles/scrollMorph.css`). Playwright(Chromium 390×844)로 `reducedMotion: reduce` 와 기본을 번갈아
> 상세·홈·준비물·`/dog` 의 접힘 값을 스크롤 5~25px 간격으로 찍어 확인했다. Safari 26 미만·Firefox 실기기는 확인 못 했다.

## 증상

1. 기기에서 '동작 줄이기' 를 켜도 상세 제목(·홈 히어로·준비물 제목·하위 화면 헤더)이 **스크롤을 따라 연속으로** 줄고 옮겨 갔다.
   2026-10-06 평가는 "reduce 컨텍스트에서 애니메이션 83개가 전부 `1e-05s`" 로 **통과**라 적었다 — 시간을 재서는 안 보이는 결함이다.
2. 1 을 고치려고 reduce 를 `snap`(경계에서 한 번 바뀜)으로 보내자, **상세 화면이 맨 위에서부터 접힌 채로** 열렸다 — 본문 상호명이 투명하고 헤더에 복사본이 서 있다.
   스크롤해도, 맨 위로 돌아와도 풀리지 않는다.

## 원인

1. 전역 reduce 리셋(`globals.css` 의 `animation-duration: 0.01ms !important`)은 **시간으로 도는** 애니메이션만 멈춘다. 접힘은 스크롤 타임라인
   (`animation-timeline: scroll()`)이라 시간 길이를 구간 비율로 바꿔 읽고, 그대로 스크롤을 따라간다. 모드를 정하는 `morphModeOf` 는 지원 여부만 봤다.
2. snap 모드의 전환 규칙(`[data-morph='snap'] [data-scroll-morph] { transition: transform 250ms }`)이 AppBar 의 "밑에서 올라오기"(`bar-reveal`)에도 걸렸다.
   상세가 AppBar 슬롯을 채우는 순간 `:has(…:not(:empty))` 규칙이 transform 을 `translateY(10단)` → `none` 으로 바꾸는데, 그 바뀜이 **전환으로** 재생됐다.
   상세 제목 줄(`placeDetailHeader`)은 바로 그 순간 막대 칸의 아랫변을 **한 번** 재 두고 snap 경계로 쓰는데, 전환의 시작값(40px 아래, 80 ≠ 40)을 읽었다.
   그 값이 굳어 `줄 윗변(65) − scrollY ≤ 80` 이 늘 참 → `--morph` 1 고정. reduce 의 0.01ms 전환도 시작값을 같은 틱에 돌려준다.
   **reduce 와 무관하게 snap 브라우저(Safari 26 미만·Firefox)에는 원래 있던 버그**다 — 거기서는 250ms 전환이라 같은 값을 읽는다.

## 고침

- `morphModeOf()` — 지원하더라도 `prefers-reduced-motion: reduce` 면 `snap`. snap 은 reduce 에서 전환 0 이라(`scrollMorph.css`) 경계에서 한 번에 바뀐다.
  설정을 바꾸면 그 화면을 다시 열 때부터 따른다(효과가 마운트 때 한 번 고른다).
- 채워진 `bar-reveal` 의 고정 규칙에 `transition: none !important` — "움직이지 않아야 하는 도착점" 이 전환으로라도 움직이지 않게.

실측(reduce): 상세 `--morph` 0(0~20px) → 1(25px~), 중간값 없음, 맨 위에서 0 · 홈 히어로 두 값(200px 에서) · 준비물 제목 두 값(40px) · `/dog` 헤더 두 값(60px).
reduce 가 아니면 상세가 그대로 `scroll`(0~60px 에 7단계).

## 다시 밟지 않으려면

- reduce 를 시간으로 재는 검사는 스크롤 타임라인을 못 잡는다 — 스크롤 위치를 바꿔 가며 transform 이 몇 가지 값을 갖는지 센다.
- 한 번 재 두는 값(`measure`)이 다른 요소의 transform 안에 있으면 그 transform 이 전환 중일 수 있다. 재는 쪽을 고치기보다 **움직이지 않아야 할 것의 전환을 끈다**.
