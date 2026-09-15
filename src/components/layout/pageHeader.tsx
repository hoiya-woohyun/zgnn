import type { ReactNode } from 'react';

type TPageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /**
   * 모바일에서는 상단 앱바가 이미 같은 제목을 달고 있어 두 번 읽힌다.
   * 그런 화면은 제목을 데스크톱에서만 보이게 한다.
   */
  desktopOnlyTitle?: boolean;
};

/** 목록·준비물·저장 화면의 첫 줄. Untitled UI 타이포 스케일을 쓴다. */
export function PageHeader({
  title,
  description,
  actions,
  desktopOnlyTitle = false,
}: TPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-6 md:px-6 md:pt-10">
      <div className="min-w-0 flex-1">
        <h1
          className={
            desktopOnlyTitle
              ? 'sr-only text-display-xs font-bold text-primary md:not-sr-only'
              : 'text-display-xs font-bold text-primary'
          }
        >
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-tertiary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
