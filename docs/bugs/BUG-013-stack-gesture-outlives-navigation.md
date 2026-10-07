# BUG-013 — 가장자리를 끄는 도중 화면이 바뀌면 앱 전체 세로 스크롤이 죽었다

> 최종 수정: 2026-10-07 (v1: 신설 — ADR-025 커밋 전 리뷰의 HIGH, [12 U4.1](../todo/12-ux-audit-2026-10-02.md))
> 상태: 고침(`src/components/layout/appShellStack.ts` 의 `arrive`). 실기기 재현은 아직 — 코드 경로로 확인했다.

## 증상

하위 화면(`/place/:id`·`/saved`·`/dog`)에서 왼쪽 가장자리를 끄는 **도중에** 주소가 바뀌면(안드로이드 뒤로 버튼·브라우저 뒤로) 도착한 탭 화면에서
세로 스크롤이 안 된다. 새로고침 전까지 풀리지 않는다.

## 원인

가장자리 끌기([ADR-025](../decisions/ADR-025-stack-push-pop-transition.md))의 진행 상태(`gesture.current`)는 **손을 뗄 때만** 비워진다(`onPointerUp`·`onPointerCancel`).
그런데 그 핸들러는 쌓인 화면에서만 붙는다(`surfaceProps` 가 탭 화면에선 `{}`). 반면 가로로 잠긴 동안 세로 스크롤을 막는 `touchmove` 리스너(`lockScroll`)는
셸 표면에 **늘** 붙어 있다. 그래서 끄는 중에 탭 화면으로 옮겨 가면:

1. 손을 떼도 `onPointerUp` 이 없어 `gesture.current` 가 `axis: 'x'` 로 남고,
2. 그 뒤의 모든 `touchmove` 를 `lockScroll` 이 `preventDefault` 한다 — 앱 전체 세로 스크롤이 죽는다.
3. 다시 쌓인 화면에 가도 `onPointerDown` 이 `gesture.current` 가 있다며 새 끌기를 받지 않는다.

도착한 곳이 쌓인 화면이면 다른 증상이 된다 — 손을 뗄 때 `settleBack` 이 이미 치운 층을 상대로 돌고, 문턱을 넘었으면 **한 번 더 뒤로** 간다.

## 고침

- `arrive`(주소가 바뀐 직후) 에서 `gesture.current = null`. 제스처는 이동보다 오래 살 수 없다 — 층·`<main>` 차림은 같은 자리의 `stop()` 이 이미 걷는다.
- 같은 리뷰의 곁가지: `settleBack` 이 `running.current` 를 덮기 전에 앞 애니메이션을 `cancel()`. `fill: 'forwards'` 는 참조를 잃어도 `<main>` 을 붙들고 있어
  나중의 `stop()` 이 걷지 못한다. `play` 는 늘 `arrive` 의 `stop()` 뒤에만 불려 그대로 두었다.

## 남는 것

- 탭 페이저(`appShellSwipe`, ADR-014)도 같은 모양(손을 뗄 때만 비우는 제스처 + 늘 붙은 `lockScroll`)이다. 탭 화면끼리는 끄는 중에 주소가 바뀔 길이
  드물지만, 새 제스처 상태를 더할 때는 **주소가 바뀔 때 비우는 자리**를 같이 만든다.
- 빌드·단위 테스트로는 안 드러난다(제스처는 DOM 훅이다). 폰에서: 상세에서 가장자리를 반쯤 끈 채 안드로이드 뒤로 → 홈에서 세로로 스크롤되는지.
