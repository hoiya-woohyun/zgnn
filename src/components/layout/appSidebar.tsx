import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LinkExternal01 } from '@untitledui/icons';
import { NAV_ITEMS } from './navItems';
import { META } from '../../lib/places';
import { useSavedCount } from '../../store/useAppStore';
import { cx } from '../../utils/cx';

/**
 * 데스크톱(md 이상) 좌측 고정 사이드바. 모바일에서는 하단 탭바가 대신하므로 숨는다.
 * 폭을 고정해 두는 이유는 appShell 이 콘텐츠를 그만큼 밀어야 하기 때문이다.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const savedCount = useSavedCount();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-secondary bg-primary md:flex">
      <Link href="/" className="flex items-center gap-3 px-5 py-6">
        <img src="/icons/icon-192.png" alt="" aria-hidden="true" className="size-10 rounded-xl" />
        <span className="flex flex-col">
          <span className="text-md font-bold text-primary">강아지랑 제주</span>
          <span className="text-xs text-tertiary">반려견 동반 여행 가이드</span>
        </span>
      </Link>

      <nav aria-label="주요 화면" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.isActive(pathname);
            return (
              <li key={item.to}>
                <Link
                  href={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-11 items-center gap-3 rounded-lg px-3 text-md font-semibold transition-colors',
                    active
                      ? 'bg-brand-primary text-brand-secondary'
                      : 'text-secondary hover:bg-secondary',
                  )}
                >
                  <item.Icon
                    size={22}
                    className={active ? 'text-brand-secondary' : 'text-quaternary'}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.showsSavedCount && savedCount > 0 && (
                    <span className="min-w-[22px] rounded-full bg-camellia px-1.5 text-center text-xs leading-[22px] font-bold text-white">
                      {savedCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="border-t border-secondary px-5 py-4 text-xs text-tertiary">
        <p>{META.author}님이 정리한 자료입니다.</p>
        <a
          href={META.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 font-semibold text-brand-secondary hover:underline"
        >
          원본 노션 보기
          <LinkExternal01 size={14} />
        </a>
      </footer>
    </aside>
  );
}
