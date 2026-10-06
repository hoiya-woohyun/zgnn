import type { MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isNavActive, NAV_ITEMS, navHref } from './navItems';
import { useNavHighlightPath } from './useNavHighlightPath';
import { cx } from '../../utils/cx';

/** 주소 끝의 `/` 를 떼어 비교를 한 가지 모양으로 맞춘다(정적 내보내기라 `/map/` 로도 들어온다). */
const normalize = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

/**
 * 모바일 하단 탭바. 데스크톱(md 이상)에서는 사이드바가 대신하므로 숨는다.
 *
 * 높이를 고정해 두는 이유는 appShell 이 이 값만큼 콘텐츠 아래를 비워야 하기 때문이다.
 * 여기 숫자를 바꾸면 `appShellSurface.ts` 의 CONTENT_BOTTOM_SPACE 도 같이 바꾼다.
 *
 * **이미 있는 탭을 다시 누르면 맨 위로 부드럽게 돌아간다** — 네이티브 탭바의 관례다.
 * 조건으로 `item.isActive` 를 쓰면 안 된다. 둘러보기 항목은 탭 하이라이트를 위해 상세
 * (`/place/:id`)까지 자기 것으로 보기 때문에, 상세에서 둘러보기를 누르면 목록으로 가지
 * 못하고 제자리에서 스크롤만 한다. 여기서 묻는 것은 "어느 탭에 불이 들어오나" 가 아니라
 * "지금 이 주소에 서 있나" 다(같은 혼동을 `lib/appRoutes.ts` 도 경고한다).
 *
 * 다른 탭으로 옮길 때는 아무것도 하지 않는다 — 셸이 경로가 바뀌면 그 화면의 자리로
 * 스크롤을 되돌리는데(`lib/appScroll.ts`), 여기서 부드러운 스크롤을 같이 걸면 둘이 경쟁한다.
 * 전역 `scroll-behavior: smooth` 를 쓰지 않는 이유도 같다(그 복원까지 애니메이션된다).
 *
 * **탭바는 손가락으로 화면을 넘길 때도 움직이지 않는다**(ADR-014) — 화면들을 담는 틀이지
 * 화면이 아니다. 스와이프로 옮겨도 여기 하이라이트는 `isActive` 가 새 주소로 다시 계산한다.
 *
 * **가운데 한 칸(`prominent`, 지도)은 솟은 원형 버튼이다.** 다섯 칸이 같은 모양이면 밋밋하고, 여행 중
 * 가장 자주 여는 화면이 어느 것인지도 안 보인다. 원은 탭바 위로 `PROMINENT_RISE` 만큼 솟고, 바탕색(크림)
 * 링을 둘러 `border-t` 선이 원 뒤에서 끊긴 것처럼 보이게 한다 — 노치를 파지 않고 같은 인상을 낸다.
 * 솟은 만큼은 본문 위에 떠 있다(`appShellSurface` 의 아래 여백은 탭바 높이 기준이라 그 여유 안에 든다).
 * 원은 늘 브랜드색이고, 불이 들어왔는지는 다른 칸과 같이 **라벨 색**으로만 말한다 — 원의 색을 바꾸면
 * "지도에 있을 때만 버튼이 있다" 로 읽힌다.
 */

/**
 * 원형 버튼이 탭바 위로 솟는 높이. 지름(`size-13`)과 같이 움직인다 — 원의 아랫단이 라벨(아래 6px + 한 줄)에
 * 닿지 않을 만큼은 솟아야 한다. `-top-3.5` 로 두었더니 원이 '지도' 글자를 덮었다.
 */
const PROMINENT_RISE = '-top-5';
export function AppTabBar() {
  const pathname = usePathname();
  const highlightPath = useNavHighlightPath();

  const handleTabClick = (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (normalize(pathname) !== normalize(to)) return;

    event.preventDefault();
    window.scrollTo({
      top: 0,
      // 모션을 줄이기로 한 사용자에게는 즉시 이동. 도착점은 같다.
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  return (
    <nav
      aria-label="주요 화면"
      // 배경은 **바탕과 같은 크림, 불투명**이다(ADR-010 v4 — 가장자리 면은 바탕색). 흰색이면
      // 홈 인디케이터 자리(pb-safe)만 흰 띠가 되어 위쪽 상태바 자리(크림)와 짝이 안 맞는다.
      // 반투명 + backdrop-blur 로 두면 그 자리에 밑을 지나는 내용이 비치고, Safari 26 은 이 요소의
      // background-color 를 읽어 자기 툴바를 칠하므로 흐린 색이 그대로 툴바로 번진다.
      // 본문과 가르는 것은 색이 아니라 `border-t` 한 줄이다.
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-secondary bg-secondary md:hidden"
    >
      <ul className="mx-auto flex h-[60px] w-full max-w-lg">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item, highlightPath);
          const href = navHref(item, pathname);
          const labelColor = active ? 'text-brand-secondary' : 'text-tertiary';

          if (item.prominent) {
            return (
              <li key={item.to} className="flex-1">
                <Link
                  href={href}
                  onClick={(event) => handleTabClick(event, href)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'relative flex h-full flex-col items-center justify-end pb-1.5 text-xs font-semibold',
                    labelColor,
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'absolute flex size-13 items-center justify-center rounded-full bg-brand-solid text-primary_on-brand shadow-lg ring-4 ring-bg-secondary',
                      'transition-transform duration-150 active:scale-95',
                      PROMINENT_RISE,
                    )}
                  >
                    <item.Icon size={26} />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          }

          return (
            <li key={item.to} className="flex-1">
              <Link
                href={href}
                onClick={(event) => handleTabClick(event, href)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-full flex-col items-center justify-center gap-0.5 text-xs font-semibold',
                  labelColor,
                )}
              >
                <item.Icon
                  size={24}
                  className={active ? 'text-brand-secondary' : 'text-quaternary'}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
