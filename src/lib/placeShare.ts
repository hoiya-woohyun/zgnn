import { verdictFor, type TEligibility } from './eligibility';

/**
 * 장소를 친구에게 보낼 때 붙는 글. 받는 사람이 링크를 열기 전에 "갈 수 있는지" 부터 읽게
 * 판정 한 줄을 앞에 둔다("보리는 갈 수 있어요 · 오션뷰 독채…"). 머리글은 상세 카드와 같은
 * 함수(`verdictFor`)로 만든다 — 보낸 글과 받은 사람이 연 화면이 다른 말을 하면 안 된다.
 * 강아지가 없으면 판정이 없으니 특징만.
 */
export const shareTextFor = (
  features: string,
  dogNames: string[] | null,
  eligibility: TEligibility | null,
): string => {
  if (!dogNames || dogNames.length === 0 || !eligibility) return features;
  const verdict = verdictFor(dogNames, eligibility);
  return features ? `${verdict} · ${features}` : verdict;
};

/** 보내는 길. Web Share 가 있으면 그것, 없으면(카톡 인앱·데스크톱) 링크 복사, 둘 다 없으면 없음. */
export type TShareMethod = 'share' | 'copy' | 'none';

/**
 * 누른 **그 순간에** 부른다. 렌더 중에 navigator 를 보면 미리 그린 HTML 과 첫 클라이언트
 * 렌더가 어긋난다 — 버튼은 늘 그리고 갈래는 클릭에서만 가른다.
 */
type TShareNavigator = {
  share?: unknown;
  clipboard?: { writeText?: unknown };
};

export const shareMethodOf = (nav: TShareNavigator): TShareMethod => {
  if (typeof nav.share === 'function') return 'share';
  if (typeof nav.clipboard?.writeText === 'function') return 'copy';
  return 'none';
};
