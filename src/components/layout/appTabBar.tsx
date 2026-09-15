import { Link, useLocation } from 'react-router';
import { NAV_ITEMS } from './navItems';
import { useSavedCount } from '../../store/useAppStore';
import { cx } from '../../utils/cx';

/**
 * 모바일 하단 탭바. 데스크톱(md 이상)에서는 사이드바가 대신하므로 숨는다.
 *
 * 높이를 고정해 두는 이유는 appShell 이 이 값만큼 콘텐츠 아래를 비워야 하기 때문이다.
 * 여기 숫자를 바꾸면 appShell 의 TAB_BAR_HEIGHT 도 같이 바꾼다.
 */
export function AppTabBar() {
  const { pathname } = useLocation();
  const savedCount = useSavedCount();

  return (
    <nav
      aria-label="주요 화면"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-secondary bg-primary/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex h-[60px] w-full max-w-lg">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
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
                {item.showsSavedCount && savedCount > 0 && (
                  <span className="absolute top-1.5 right-[calc(50%-1.5rem)] min-w-[18px] rounded-full bg-camellia px-1 text-center text-[10px] leading-[18px] font-bold text-white">
                    {savedCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
