import type { MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './navItems';
import { cx } from '../../utils/cx';

/** 주소 끝의 `/` 를 떼어 비교를 한 가지 모양으로 맞춘다(정적 내보내기라 `/map/` 로도 들어온다). */
const normalize = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

/**
 * 모바일 하단 탭바. 데스크톱(md 이상)에서는 사이드바가 대신하므로 숨는다.
 *
 * 높이를 고정해 두는 이유는 appShell 이 이 값만큼 콘텐츠 아래를 비워야 하기 때문이다.
 * 여기 숫자를 바꾸면 appShell 의 CONTENT_BOTTOM_SPACE 도 같이 바꾼다.
 *
 * **이미 있는 탭을 다시 누르면 맨 위로 부드럽게 돌아간다** — 네이티브 탭바의 관례다.
 * 조건으로 `item.isActive` 를 쓰면 안 된다. 둘러보기 항목은 탭 하이라이트를 위해 상세
 * (`/place/:id`)까지 자기 것으로 보기 때문에, 상세에서 둘러보기를 누르면 목록으로 가지
 * 못하고 제자리에서 스크롤만 한다. 여기서 묻는 것은 "어느 탭에 불이 들어오나" 가 아니라
 * "지금 이 주소에 서 있나" 다(같은 혼동을 `lib/appRoutes.ts` 도 경고한다).
 *
 * 다른 탭으로 옮길 때는 아무것도 하지 않는다 — 셸이 경로가 바뀌면 스크롤을 0 으로
 * 되돌리는데, 여기서 부드러운 스크롤을 같이 걸면 둘이 경쟁한다. 전역
 * `scroll-behavior: smooth` 를 쓰지 않는 이유도 같다(그 리셋까지 애니메이션된다).
 */
export function AppTabBar() {
  const pathname = usePathname();

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
      // 배경은 불투명하게 둔다. 반투명 + backdrop-blur 로 두면 홈 인디케이터 자리(pb-safe)에
      // 밑을 지나는 내용이 비쳐 탭바가 거기까지 이어져 보이지 않고, Safari 26 은 이 요소의
      // background-color 를 읽어 자기 툴바를 칠하므로 흐린 색이 그대로 툴바로 번진다(ADR-010).
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-secondary bg-primary md:hidden"
    >
      <ul className="mx-auto flex h-[60px] w-full max-w-lg">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <li key={item.to} className="flex-1">
              <Link
                href={item.to}
                onClick={(event) => handleTabClick(event, item.to)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-full flex-col items-center justify-center gap-0.5 text-xs font-semibold',
                  active ? 'text-brand-secondary' : 'text-tertiary',
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
