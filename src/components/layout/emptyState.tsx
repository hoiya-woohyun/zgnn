import type { FC, ReactNode } from 'react';
import type { TIconProps } from '../icons/iconProps';

type TEmptyStateProps = {
  Icon: FC<TIconProps>;
  title: string;
  description?: string;
  action?: ReactNode;
};

/** 결과가 없을 때. 빈 화면을 그냥 두지 않고 다음에 할 일을 하나 제안한다. */
export function EmptyState({ Icon, title, description, action }: TEmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-secondary bg-primary px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-secondary text-quaternary">
        <Icon size={24} />
      </span>
      <p className="mt-4 text-md font-bold text-primary">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-tertiary">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
