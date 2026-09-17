import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './navItems';
import { cx } from '../../utils/cx';

/**
 * 모바일 하단 탭바. 데스크톱(md 이상)에서는 사이드바가 대신하므로 숨는다.
 *
 * 높이를 고정해 두는 이유는 appShell 이 이 값만큼 콘텐츠 아래를 비워야 하기 때문이다.
 * 여기 숫자를 바꾸면 appShell 의 CONTENT_BOTTOM_SPACE 도 같이 바꾼다.
 */
export function AppTabBar() {
  const pathname = usePathname();

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
