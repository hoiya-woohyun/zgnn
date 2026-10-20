/*
 * 시트를 닫은 뒤 잃은 포커스를 화면이 정한 자리로 돌려보내기 — 지도 시트(고른 마커, 14 W261019.15d)와
 * 「날짜별로 정리」 의 날 고르기 시트(옮겨 간 줄, ADR-030)가 같이 쓴다.
 *
 * 시트(react-aria `ModalOverlay`)는 **열리며 렌더될 때의 포커스 자리**를 기억했다가 닫힌 뒤 거기로 돌려보낸다. 핀을 눌러 연 시트는
 * 그 자리가 마커라 문제가 없는데, 주소(`?place=`)로 되살린 시트 — 상세에서 뒤로 오기 · 미니 지도 딥링크 — 는 화면과 함께 마운트돼 그 자리가
 * body 다. 그래서 Esc·X 로 닫으면 포커스가 body 에 떨어져 다음 Tab 이 문서 맨 처음(건너뛰기 링크)부터였다.
 *
 * 닫은 뒤 몇 프레임을 지켜본다 — 닫힘 애니메이션 동안은 포커스가 아직 시트 안에 있고, 시트가 빠지면 body 로 떨어진다.
 * 그때 화면이 정한 자리(지도는 고른 마커 — 묶음 속이면 그 묶음, 정리 화면은 다른 칸으로 옮겨 간 그 줄)에 둔다.
 * 정리 화면은 react-aria 가 기억한 자리(누른 줄)가 다른 칸으로 다시 마운트되며 문서에서 빠져 같은 일이 생긴다. 누가 먼저 다른 곳에 뒀으면(react-aria 가 마커로 돌려보냈거나 사용자가 옮겼다) 손을 뗀다.
 */

/** 지켜보는 한도(ms). 시트의 닫힘 애니메이션보다 넉넉하게 — 넘으면 포기한다(사용자가 그새 무엇을 했을 수 있다). */
export const SHEET_FOCUS_RETURN_TIMEOUT_MS = 1500;

export type TSheetFocusReturnStep = 'wait' | 'return' | 'stop';

/**
 * 한 프레임의 판단. `active` 는 `document.activeElement`, `inDialog` 는 그것이 아직 시트(`[role=dialog]`) 안인가.
 * - 아직 시트 안이면 기다린다(닫히는 중).
 * - body(또는 없음)면 잃은 것이다 — 돌려보낸다.
 * - 그 밖의 곳이면 누가 이미 뒀다 — 건드리지 않는다.
 */
export function sheetFocusReturnStep(
  active: Element | null,
  body: Element,
  inDialog: boolean,
): TSheetFocusReturnStep {
  if (active === null || active === body) return 'return';
  return inDialog ? 'wait' : 'stop';
}
