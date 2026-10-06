import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { navHighlightPath } from './navItems';

/**
 * 탭바·사이드바가 하이라이트를 계산할 주소(`navHighlightPath`). 둘 다 셸에 붙어 화면을 넘겨도
 * 살아 있으므로, 직전 주소는 컴포넌트 상태 하나로 기억하면 된다 — 첫 렌더(딥링크·새로고침)엔 없다.
 *
 * 렌더 중에 상태를 맞추는 것은 React 가 권하는 "prop 이 바뀌면 상태를 고친다" 모양이다 —
 * effect 로 미루면 `/dog` 에 들어온 첫 프레임에 탭이 한 번 꺼졌다 켜진다.
 */
export const useNavHighlightPath = (): string | null => {
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  const [origin, setOrigin] = useState<string | null>(null);
  if (seen !== pathname) {
    setOrigin(seen);
    setSeen(pathname);
  }
  // 렌더 중 setState 는 이 출력을 버리고 새 상태로 곧바로 다시 그린다 — 여기 닿을 때 origin 은 이미 새 값이다.
  return navHighlightPath(pathname, origin);
};
