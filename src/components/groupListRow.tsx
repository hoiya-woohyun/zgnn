import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, LinkExternal01 } from '@untitledui/icons';

type TGroupListRowProps = {
  title: ReactNode;
  /** 있으면 두 줄 행(64), 없으면 한 줄 행(52). */
  subtitle?: ReactNode;
  /** 앞 표시 — 20px 선 아이콘(상자 없이 `fg-tertiary`)이나 이름 첫 글자 원 같은 작은 그림. 크기는 넘기는 쪽이 정한다. */
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

// 면이 없으니 행은 크림 위에 선다 — 좌우 여백은 그룹을 감싼 쪽(px-4)이 주고, 눌림 판만 -mx-2 로 조금 넓힌다(홈 종류·동네 행과 같은 꼴).
// 눌림은 `bg-tertiary` — 크림 위에서 `bg-secondary`(=크림)는 안 보인다.
// `flex` 블록(링크·div)은 음수 여백만큼 저절로 넓어지고, `button` 은 폭을 따로 적는다(`BUTTON_WIDTH`).
const BASE = '-mx-2 flex min-w-0 items-center gap-3 rounded-lg px-2 text-left transition-colors';
const BUTTON_WIDTH = 'w-[calc(100%+var(--spacing)*4)]';

/**
 * 그룹 리스트의 행 한 줄 — 링크·바깥 링크·버튼·정적 넷 중 하나로 그린다.
 * 바깥 `div` 가 구분선을 받고(그룹의 `divide-y`), 안쪽이 눌림 판(-mx-2 · r8)이다. 판에 선을 바로 그으면 둥근 모서리를 따라 선 끝이 휘고
 * 판의 넓힌 폭만큼 선도 길어진다(2026-10-26 headless 실측).
 */
export function GroupListRow(props: TGroupListRowProps) {
  return (
    <div>
      <GroupListRowInner {...props} />
    </div>
  );
}

function GroupListRowInner({
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
  const height = subtitle ? 'min-h-16 py-2.5' : 'min-h-13 py-2';
  const titleColor = inactive ? 'text-quaternary' : tone === 'danger' ? 'text-error-primary' : 'text-primary';
  const className = `${BASE} ${height} ${interactive ? 'hover:bg-tertiary active:bg-tertiary' : ''}`;
  const endMark = trail ?? (externalHref ? 'external' : href ? 'chevron' : 'none');

  const content = (
    <>
      {icon && (
        <span aria-hidden="true" className="flex min-w-5 shrink-0 items-center justify-center text-fg-tertiary">
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
        className={`${className} ${BUTTON_WIDTH} ${inactive ? 'cursor-default' : ''}`}
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
