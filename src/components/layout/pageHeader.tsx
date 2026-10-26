import type { ReactNode } from 'react';

type TPageHeaderProps = {
  title: string;
  /** 제목 밑 한 줄. 숫자·상태일 때만 쓴다 — 화면 사용 안내 문장은 두지 않는다(ADR-006 v10). */
  description?: ReactNode;
  /** 제목 옆 회색 개수('저장한 곳 3'). 개수를 문장으로 풀어 부제에 다시 적지 않는다. */
  count?: ReactNode;
  actions?: ReactNode;
  /**
   * 모바일에서는 상단 앱바가 이미 같은 제목을 달고 있어 두 번 읽힌다.
   * 그런 화면은 제목을 데스크톱에서만 보이게 한다.
   */
  desktopOnlyTitle?: boolean;
};

/** 목록·준비물·저장 화면의 첫 줄. 제목은 글자 단계표의 '제목' 단(20/700, ADR-006 v10). */
export function PageHeader({
  title,
  description,
  count,
  actions,
  desktopOnlyTitle = false,
}: TPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-6 md:px-6 md:pt-10">
      <div className="min-w-0 flex-1">
        <h1
          className={
            desktopOnlyTitle
              ? 'sr-only text-xl font-bold text-primary md:not-sr-only'
              : 'text-xl font-bold text-primary'
          }
        >
          {title}
          {count !== undefined && <span className="ml-1.5 font-normal text-tertiary">{count}</span>}
        </h1>
        {description && <p className="mt-1 text-sm text-tertiary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
