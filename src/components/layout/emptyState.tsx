import type { FC, ReactNode } from 'react';
import type { TIconProps } from '../icons/iconProps';
import { cx } from '../../utils/cx';
import { CARD_SURFACE } from '../cardSurface';

type TEmptyStateProps = {
  Icon: FC<TIconProps>;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * 크림 바탕이 아니라 지도 위에 뜰 때만 흰 면을 깐다 — 면이 없으면 글자가 지도 타일에 묻힌다.
   * 그 밖에서는 면 없이 크림 위에 직접 선다(ADR-003 v15): 빈 화면 가운데의 흰 상자는 "내용이 하나 있다" 로 읽힌다.
   */
  floating?: boolean;
};

/** 결과가 없을 때. 빈 화면을 그냥 두지 않고 다음에 할 일을 하나 제안한다. */
export function EmptyState({ Icon, title, description, action, floating = false }: TEmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', floating && CARD_SURFACE)}>
      {/* 아이콘 원은 놓인 면보다 한 단 짙게 — 크림 위에서 크림(bg-secondary)이면 원이 사라진다. */}
      <span
        className={cx(
          'grid size-12 place-items-center rounded-full text-quaternary',
          floating ? 'bg-secondary' : 'bg-tertiary',
        )}
      >
        <Icon size={24} />
      </span>
      <p className="mt-4 text-md font-bold text-primary">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-tertiary">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
