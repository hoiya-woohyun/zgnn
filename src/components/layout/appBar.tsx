import type { ReactNode } from 'react';
import { ArrowLeft } from '@untitledui/icons';
import { useRouter } from 'next/navigation';
import { hasInAppHistory } from '../../lib/appHistory';

type TAppBarProps = {
  title: string;
  /** 뒤로가기를 붙일 때, 앱 밖으로 나가지 않도록 되돌아갈 앱 안 경로. */
  backTo?: string;
  actions?: ReactNode;
  /** 타입 색 헤더 위에 얹힐 때처럼 배경이 짙은 경우. */
  tone?: 'default' | 'onColor';
};

/**
 * 모바일 상단 앱바. 데스크톱에서는 사이드바가 현재 위치를 알려주므로 숨는다.
 *
 * 뒤로가기는 history 를 되감되, 링크를 받아 이 화면으로 바로 들어온 경우에는
 * 되감을 앱 안 화면이 없어 앱 밖으로 나가 버린다. 그래서 이 탭에서 앱 안 이동이
 * 한 번이라도 있었는지를 보고(lib/appHistory.ts), 없었으면 backTo 로 올려보낸다.
 */
export function AppBar({ title, backTo, actions, tone = 'default' }: TAppBarProps) {
  const router = useRouter();
  const onColor = tone === 'onColor';

  const goBack = () => {
    if (backTo && !hasInAppHistory()) router.replace(backTo);
    else router.back();
  };

  return (
    <header
      className={
        onColor
          ? 'flex h-14 items-center gap-1 px-2 text-white md:hidden'
          : 'sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-secondary bg-primary/95 px-2 backdrop-blur md:hidden'
      }
    >
      {backTo && (
        <button
          type="button"
          onClick={goBack}
          aria-label="뒤로 가기"
          className={
            onColor
              ? 'grid size-11 shrink-0 place-items-center rounded-full text-white/90'
              : 'grid size-11 shrink-0 place-items-center rounded-full text-secondary'
          }
        >
          <ArrowLeft size={22} />
        </button>
      )}
      <h1
        className={`clamp-1 flex-1 px-2 text-md font-bold ${onColor ? 'text-white' : 'text-primary'}`}
      >
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-1 pr-1">{actions}</div>}
    </header>
  );
}
