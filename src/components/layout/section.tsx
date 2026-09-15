import type { ReactNode } from 'react';

type TSectionProps = {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** 화면 안의 한 덩어리. 제목 줄의 간격과 크기를 한곳에서 정한다. */
export function Section({ title, description, actions, children, className = '' }: TSectionProps) {
  return (
    <section className={`px-4 md:px-6 ${className}`}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-bold text-primary">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-tertiary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={title || actions ? 'mt-3' : ''}>{children}</div>
    </section>
  );
}
