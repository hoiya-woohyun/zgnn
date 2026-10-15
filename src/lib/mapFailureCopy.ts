/**
 * 지도를 못 불렀을 때의 안내 — 지도 탭(`mapPageCanvas`)과 상세 미니 지도(`placeDetailMiniMap`)가 같은 말을 쓴다(14 W261010.33c).
 * 둘이 따로 적던 시절엔 같은 실패가 "지도는 인터넷이 필요해요" 와 "지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요." 로
 * 갈려 다른 고장으로 읽혔다(designer-63·68). 순수.
 *
 * 갈래는 셋(인증 거부 · 429 · 오프라인, ADR-008)이 아니라 **둘**이다 — 브라우저에서 가를 수 있는 신호가 `navigator.onLine === false`
 * 하나뿐이다. 401 때 `navermap_authFailure` 가 안 불린 실측이 있고, 429 는 스크립트 로드라 상태 코드가 안 보인다.
 * 온라인 쪽은 원인을 말하지 않는다: 인터넷을 탓하면 옵션 이름 오류 같은 영구 고장이 "오프라인 문제" 로 보고되고(ADR-008 「로고·저작권 표시」 메모),
 * `onLine` 이 true 여도 실제로는 안 붙어 있을 수 있어(캡티브 포털) 우리 쪽 고장이라고도 못 한다.
 * 다시 시도하라는 말도 하지 않는다 — 인증 거부는 새로고침 전까지 sticky 다(`naverMap.ts` 의 `authFailed`).
 */
export function mapFailureCopy(online: boolean): { title: string; description: string } {
  if (!online) {
    return {
      title: '지도는 인터넷이 필요해요',
      description: '연결이 없어도 저장한 곳과 장소 목록은 그대로 볼 수 있어요.',
    };
  }
  return {
    title: '지도를 불러오지 못했어요',
    description: '지도 없이도 저장한 곳과 장소 목록은 그대로 볼 수 있어요.',
  };
}
