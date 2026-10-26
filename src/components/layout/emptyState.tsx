import Link from 'next/link';
import { cx } from '../../utils/cx';
import { CARD_SURFACE } from '../cardSurface';

const ACTION_CLASS =
  'inline-flex min-h-11 items-center text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover';

export type TEmptyStateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  /** `data-ev` 이름표(ADR-029). */
  ev?: string;
  className?: string;
};

type TEmptyStateProps = {
  title: string;
  description?: string;
  /** 행동은 자리마다 하나 — 글자 버튼으로 부품이 직접 그린다(채움 버튼을 다시 끼우지 못하게 객체로 받는다). */
  action?: TEmptyStateAction;
  /**
   * 크림 바탕이 아니라 지도 위에 뜰 때만 흰 면을 깐다 — 면이 없으면 글자가 지도 타일에 묻힌다.
   * 그 밖에서는 면 없이 목록이 있던 자리 맨 위에서 왼쪽 정렬 글자로 시작한다(ADR-003 v15).
   */
  floating?: boolean;
};

/**
 * 결과가 없을 때. 가운데 원·채움 버튼 없이 글자 블록 하나 + 글자 행동 하나.
 * 위 여백(24px)은 부르는 쪽 래퍼의 `pt-6` 이 맡는다 — 부품 자신은 세로 여백이 없다.
 */
export function EmptyState({ title, description, action, floating = false }: TEmptyStateProps) {
  return (
    <div className={cx('text-left', floating && cx(CARD_SURFACE, 'p-4'))}>
      <p className="text-md text-primary">{title}</p>
      {description && <p className="mt-1 text-sm text-tertiary">{description}</p>}
      {action &&
        (action.href ? (
          <Link
            href={action.href}
            data-ev={action.ev}
            className={cx(ACTION_CLASS, action.className)}
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            data-ev={action.ev}
            className={cx(ACTION_CLASS, action.className)}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
