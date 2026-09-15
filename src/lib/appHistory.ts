/**
 * 이 탭에서 앱 안 화면 이동이 한 번이라도 있었는지.
 *
 * 상세 화면의 뒤로가기는 history 를 되감는데, 링크를 받아 상세로 바로 들어온 경우에는
 * 되감을 앱 안 화면이 없어 앱 밖으로 나가 버린다. react-router 는 그 첫 진입을
 * `location.key === 'default'` 로 알려줬지만 next/navigation 에는 같은 값이 없다.
 *
 * `history.length` 는 새로고침만 해도 1 보다 커지고, `document.referrer` 는 문서를
 * 처음 불러온 시점만 반영해 앱 안 이동에서는 갱신되지 않는다. 둘 다 못 쓴다.
 * 그래서 경로가 실제로 바뀌었을 때만 세우는 모듈 전역 플래그를 쓴다.
 * 문서를 새로 불러오면 모듈도 다시 평가되므로 값은 자연히 false 로 돌아간다.
 */
let navigatedInApp = false;

export const markInAppNavigation = () => {
  navigatedInApp = true;
};

export const hasInAppHistory = () => navigatedInApp;
