# BUG-001 — 하단 시트의 바닥 여백이 사라지거나 홈 인디케이터에 깔린다

> 최종 수정: 2026-09-17 (v1: 신설)

## 증상

하단 시트(지도 미니 카드 · 둘러보기 조건 · 긴 목록 피커)의 **마지막 줄이 시트 바닥에 붙어**
있었다. 노치·홈 인디케이터가 있는 기기에서는 거기에 더해 마지막 줄이 홈 인디케이터에 깔렸다.

## 재현 조건

시트를 여는 모든 화면. 기기에 따라 둘 중 한쪽으로 나타난다.

| 기기 | 보이는 모습 |
|---|---|
| safe-area 가 0 (데스크톱·구형 기기) | 바닥 여백이 **통째로 0** |
| 홈 인디케이터가 있는 기기 | 여백은 인디케이터 높이뿐 — 내용 여백이 없다 |

## 원인

`bottom-sheet.tsx` 의 패널이 `p-4` 와 `pb-safe` 를 **함께** 걸고 있었다.

```
p-4      → padding-bottom: calc(var(--spacing) * 4)
pb-safe  → padding-bottom: env(safe-area-inset-bottom, 0px)
```

둘 다 같은 속성(`padding-bottom`)이라 **더해지지 않고 한쪽이 다른 쪽을 덮어쓴다.** 어느 쪽이
이길지는 생성된 스타일시트의 순서가 정하고, 어느 쪽이 이겨도 위 표의 증상이 된다.
"안전 영역을 고려했다" 는 의도가 오히려 내용 여백을 지운 셈이다.

`pt-safe`/`pb-safe` 는 **인셋만** 주는 유틸리티다 — 탭바(`appTabBar`)처럼 자기 여백이 따로
없는 곳에서만 단독으로 맞다.

## 수정

두 값을 한 선언으로 합친 `pb-sheet` 를 `globals.css` 에 두고, 패널은 그것만 쓴다.

```css
@utility pb-sheet {
  padding-bottom: calc(var(--spacing) * 4 + env(safe-area-inset-bottom, 0px));
}
```

`var(--spacing)` 을 쓰는 것은 크기가 한 축으로만 커지기 때문이다(→ [ADR-006](../decisions/ADR-006-responsive-scale-and-font.md)).
`3.5rem` 처럼 고정하면 넓은 화면에서 `p-4` 의 나머지 세 면과 바닥만 어긋난다.

`pb-safe` 는 그대로 둔다 — 탭바가 인셋만 필요로 하므로, 그쪽을 덧셈으로 바꾸면 탭바에
쓸데없는 여백이 생긴다.

## 관련

- `src/components/base/bottom-sheet.tsx` · `src/styles/globals.css`
- [라우팅 · 화면 셸 · 클라이언트 상태](../architecture/app-shell-and-state.md)
