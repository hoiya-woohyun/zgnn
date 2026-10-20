/**
 * 필터 시트 '강아지 기준' 의 한 축 세 단계(22 D-6) — [전부] [어려운 곳 빼고] [갈 수 있는 곳만]. 순수.
 *
 * 스토어엔 플래그가 둘이다(`hideHard` · `onlyReachable`). 둘을 칩 두 개로 켜고 끄게 두었더니 **둘 다 켠 상태**가 생겼는데,
 * '갈 수 있는 곳만'(가능 + 야외 자리)이 이미 어려움을 빼므로 그 상태는 '갈 수 있는 곳만' 과 같은 목록이다 — 쓸모없는 조합이 칩 둘로 보였다.
 * 걸러 내기(`filterPlacesPage`)는 그대로 두고 화면만 한 축으로 읽는다: 둘 다 켜져 있으면(홈 동네 카드가 `onlyReachable` 만 켜 숨김이 남은 때)
 * 더 좁은 쪽인 '갈 수 있는 곳만' 으로 읽고, 세그먼트로 고르면 남는 플래그는 하나뿐이다.
 */
export type TPlacesPageDogStep = 'all' | 'noHard' | 'reachable';

export const PLACES_PAGE_DOG_STEPS: readonly { value: TPlacesPageDogStep; label: string }[] = [
  { value: 'all', label: '전부' },
  { value: 'noHard', label: '어려운 곳 빼고' },
  { value: 'reachable', label: '갈 수 있는 곳만' },
];

export const placesPageDogStepOf = ({ onlyReachable, hideHard }: { onlyReachable: boolean; hideHard: boolean }): TPlacesPageDogStep =>
  onlyReachable ? 'reachable' : hideHard ? 'noHard' : 'all';

export const placesPageDogStepFlags = (step: TPlacesPageDogStep): { onlyReachable: boolean; hideHard: boolean } => ({
  onlyReachable: step === 'reachable',
  hideHard: step === 'noHard',
});
