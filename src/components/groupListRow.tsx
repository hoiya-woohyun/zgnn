import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, LinkExternal01 } from '@untitledui/icons';

type TGroupListRowProps = {
  title: ReactNode;
  /** 있으면 두 줄 행(64), 없으면 한 줄 행(48). */
  subtitle?: ReactNode;
  /** 20px 선 아이콘 — 상자 없이 `fg-tertiary` 로 그린다. */
  icon?: ReactNode;
  /** 오른쪽 값(예: '3곳'). 화살표 앞에 선다. */
  value?: ReactNode;
  /** `href` 행의 끝 표시 — 앱 안 이동은 ›, 앱 밖은 ↗. 기본은 안. */
  trail?: 'chevron' | 'external' | 'none';
  /** 앱 안 이동 — `Link`. */
  href?: string;
  /** 앱 밖 이동 — 새 탭 `a`. */
  externalHref?: string;
  /** 누르는 행 — `button`. */
  onPress?: () => void;
  /** 눌러도 아무 일도 없는 행(비울 것이 없음). `disabled` 가 아니라 `aria-disabled` — 읽히되 눌리지 않는다. */
  inactive?: boolean;
  /** 지우는 동작 — 글자색 하나로 말한다. `inactive` 이면 회색이 이긴다. */
  tone?: 'default' | 'danger';
  dataEv?: string;
};

const BASE = 'flex w-full min-w-0 items-center gap-3 px-4 text-left transition-colors';

/** 그룹 리스트의 행 한 줄 — 링크·바깥 링크·버튼·정적 넷 중 하나로 그린다. */
export function GroupListRow({
  title,
  subtitle,
  icon,
  value,
  trail,
  href,
  externalHref,
  onPress,
  inactive = false,
  tone = 'default',
  dataEv,
}: TGroupListRowProps) {
  const interactive = !inactive && Boolean(href || externalHref || onPress);
  const height = subtitle ? 'min-h-16 py-2.5' : 'min-h-12 py-2';
  const titleColor = inactive ? 'text-quaternary' : tone === 'danger' ? 'text-error-primary' : 'text-primary';
  const className = `${BASE} ${height} ${interactive ? 'hover:bg-secondary' : ''}`;
  const endMark = trail ?? (externalHref ? 'external' : href ? 'chevron' : 'none');

  const content = (
    <>
      {icon && (
        <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center text-fg-tertiary">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-md ${titleColor}`}>{title}</span>
        {subtitle && <span className="block text-sm text-tertiary">{subtitle}</span>}
      </span>
      {value != null && <span className="shrink-0 text-sm text-tertiary">{value}</span>}
      {endMark === 'chevron' && <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-fg-quaternary" />}
      {endMark === 'external' && <LinkExternal01 size={20} aria-hidden="true" className="shrink-0 text-fg-quaternary" />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} data-ev={dataEv}>
        {content}
      </Link>
    );
  }
  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noreferrer" className={className} data-ev={dataEv}>
        {content}
      </a>
    );
  }
  if (onPress) {
    return (
      <button
        type="button"
       
        aria-disabled={inactive || undefined}
        onClick={inactive ? undefined : onPress}
        className={`${className} ${inactive ? 'cursor-default' : ''}`}
        data-ev={dataEv}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className}>
      {content}
    </div>
  );
}
