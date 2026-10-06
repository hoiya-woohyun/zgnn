/**
 * "식당에 1곳 있어요 →" 를 눌러 다른 종류로 넘어갈 때 검색어를 들고 가는 한 칸(14 W261006.6).
 *
 * 검색어는 종류마다 새로 시작하는 화면 상태다(`key={type}`). 넘겨 주지 않으면 식당 탭이 26곳 전부를 보여 줘
 * "1곳" 을 다시 찾아야 한다. 스토어에 두지 않는 이유: 스토어는 통째로 localStorage 에 저장된다 — 한 번 건너가는
 * 값이 다음 방문의 첫 화면에 남는다. 탭·스와이프로 바꿀 때 검색어를 남길지는 07 U3 의 몫이라 여기선 이 길만 연다.
 */

let pending: string | null = null;

export const handOffPlacesQuery = (query: string) => {
  pending = query;
};

/** 새 화면의 첫 검색어. 읽기만 한다 — StrictMode 가 초기값 함수를 두 번 불러도 같은 값을 받게, 지우기는 마운트 뒤에. */
export const peekPlacesQueryHandoff = () => pending ?? '';

export const clearPlacesQueryHandoff = () => {
  pending = null;
};
