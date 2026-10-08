import { useRouter } from 'next/navigation';
import type { TAreaId } from '../lib/areaGroups';
import { usePlacesPageFilterStore } from '../store/usePlacesPageFilterStore';

/**
 * 둘러보기로 권역을 열고 들어가는 **하나의** 길(19 T3) — 권역 · '갈 수 있는 곳만' · 숙소 탭을 함께 건다.
 * 홈 동네 카드(19 T4)가 부른다. 셋 중 하나라도 따로 걸면 카드의 "묵을 곳 n" 과 열린 목록의 수가 갈린다 —
 * 카드는 갈 수 있는 곳(가능 + 야외)을 세고, 목록도 같은 술어(`isReachable`)로 걸러야 그 수와 같다(T4.1 — '어려운 곳 숨기기' 는 확인·정보 없음을 남겼다).
 */
export function usePlacesPageAreaEntry(): (area: TAreaId) => void {
  const router = useRouter();
  const enterArea = usePlacesPageFilterStore((state) => state.enterArea);
  return (area) => {
    enterArea(area);
    router.push('/places/stay');
  };
}
