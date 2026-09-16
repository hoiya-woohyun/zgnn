import type { ReactNode } from 'react';
import { ArrowLeft } from '@untitledui/icons';
import { useRouter } from 'next/navigation';
import { canGoBackInApp, markReplacedNavigation } from '../../lib/appHistory';

type TAppBarProps = {
  title: string;
  /** 뒤로가기를 붙일 때, 앱 밖으로 나가지 않도록 되돌아갈 앱 안 경로. */
  backTo?: string;
  actions?: ReactNode;
  /** overlay: 상세 제목 판처럼 부모가 이미 바탕색을 가진 경우. 배경·테두리 없이 그 위에 얹히고 sticky 도 아니다. */
  tone?: 'default' | 'overlay';
};

/**
 * 모바일 상단 앱바. 데스크톱에서는 사이드바가 현재 위치를 알려주므로 숨는다.
 *
 * 뒤로가기는 history 를 되감되, 링크를 받아 이 화면으로 바로 들어온 경우에는
 * 되감을 앱 안 화면이 없어 앱 밖으로 나가 버린다. 그래서 지금 history 항목이 앱 안에서
 * 몇 번째인지를 보고(lib/appHistory.ts), 첫 화면이면 backTo 로 올려보낸다.
 */
export function AppBar({ title, backTo, actions, tone = 'default' }: TAppBarProps) {
  const router = useRouter();
  const overlay = tone === 'overlay';

  const goBack = () => {
    if (backTo && !canGoBackInApp()) {
      // 항목을 갈아 끼우는 이동이라 깊이는 그대로여야 한다.
      markReplacedNavigation();
      router.replace(backTo);
    } else {
      router.back();
    }
  };

  return (
    <header
      className={
        overlay
          ? 'pt-safe px-2 md:hidden'
          : 'sticky top-0 z-30 border-b border-secondary bg-primary/95 px-2 pt-safe backdrop-blur md:hidden'
      }
    >
      {/* 노치가 있는 기기에서 pt-safe 가 위쪽에 여백을 더해도, 뒤로가기·제목 줄 자체의 높이(h-14)는 그대로 유지한다. */}
      <div className="flex h-14 items-center gap-1">
        {backTo && (
          <button
            type="button"
            onClick={goBack}
            aria-label="뒤로 가기"
            className="grid size-11 shrink-0 place-items-center rounded-full text-secondary"
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <h1
          className="clamp-1 flex-1 px-2 text-md font-bold text-primary"
        >
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-1 pr-1">{actions}</div>}
      </div>
    </header>
  );
}
