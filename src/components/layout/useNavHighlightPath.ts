import { useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { historyOwnerRoot, stampedOwnerRoot, subscribeHistoryOwnerRoot } from '../../lib/appHistory';
import { normalizeRoute, ownerRootOf } from '../../lib/appRoutes';

/**
 * 탭바·사이드바가 불을 켤 주소 — 지금 화면이 쌓여 있는 **탭 화면** 하나(`ownerRootOf`). 하위 화면이면 가장 가까운
 * history 의 탭이다: 설정에서 연 저장한 곳은 설정, 홈 카드에서 연 저장한 곳은 홈, 지도에서 연 상세는 지도.
 *
 * 답은 둘 중 하나다.
 *   - 셸이 이 주소의 history 항목에 새긴 값(`historyOwnerRoot`) — 새기고 나면 이것이 정본이다.
 *   - 새기기 전(주소가 바뀐 **렌더 중**)에는 같은 함수로 미리 계산한 값. effect 로 미루면 하위 화면에 들어온 첫 프레임에
 *     탭이 한 번 꺼졌다 켜진다. 그때 읽는 history 항목이 이동마다 다르지만(앞으로면 떠나는 항목, 뒤로면 도착한 항목) 두 경우 다
 *     맞는 값이다(`stampedOwnerRoot`).
 *
 * 첫 그림은 정적 HTML 과 같아야 해서(하이드레이션) history 를 보지 않고 정해 둔 부모로 그린다(서버 스냅샷 null). 새로고침이면
 * history 에 들어온 길이 남아 있어 하이드레이션 직후 새긴 값으로 바뀐다 — 지도에서 연 상세를 새로고침하면 둘러보기에서 지도로 한 번 옮긴다.
 */
export const useNavHighlightPath = (): string => {
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  const [owner, setOwner] = useState(() => ownerRootOf({ pathname, stamped: undefined, previous: null }));
  if (seen !== pathname) {
    setSeen(pathname);
    setOwner(ownerRootOf({ pathname, stamped: stampedOwnerRoot(), previous: owner }));
  }
  // 렌더 중 setState 는 이 출력을 버리고 새 상태로 곧바로 다시 그린다 — 여기 닿을 때 owner 는 이미 새 값이다.

  const stamp = useSyncExternalStore(subscribeHistoryOwnerRoot, historyOwnerRoot, () => null);
  return stamp !== null && stamp.pathname === normalizeRoute(pathname) ? stamp.root : owner;
};
