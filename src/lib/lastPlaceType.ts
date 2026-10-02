/**
 * 둘러보기에서 직전에 보던 종류. **모듈 변수인 것이 요점이다.**
 *
 * 둘러보기는 종류를 바꾸면 화면을 통째로 새로 마운트한다(placesPage 의 `key={type}`). 그래서 "어디서 왔는지" 는
 * 어떤 컴포넌트 상태에도 남지 않는다 — 마운트를 넘어 살아남는 자리가 여기뿐이다. 읽는 쪽은 둘이다:
 *  - 종류 전환 애니메이션(`screens/placesPageTypeSwitch.ts`) — 어느 방향에서 들어왔나.
 *  - 셸의 둘러보기 탭(`components/layout/navItems.ts`) — 다른 화면에서 돌아갈 때 보던 종류로(12 U1.5).
 *
 * 주소를 새로 열면(새로고침·딥링크) null 이다. 저장하지 않는다 — 앱을 다시 열면 숙소부터인 것이 맞다.
 */
import type { TPlaceType } from '../types';

let lastType: TPlaceType | null = null;

export const getLastPlaceType = (): TPlaceType | null => lastType;

export const setLastPlaceType = (type: TPlaceType) => {
  lastType = type;
};

const PLACES_PATH_RE = /^\/places\/(stay|restaurant|cafe)\/?$/;

/**
 * 둘러보기 탭이 가리킬 주소. 지금 목록에 서 있으면 **그 주소 그대로**(같은 탭을 다시 누르면 맨 위로 — 탭바가 주소 비교로 정한다),
 * 아니면 직전에 보던 종류, 그것도 없으면 숙소.
 */
export function placesTabHref(pathname: string, last: TPlaceType | null = lastType): string {
  const current = PLACES_PATH_RE.exec(pathname);
  if (current) return `/places/${current[1]}`;
  return `/places/${last ?? 'stay'}`;
}
