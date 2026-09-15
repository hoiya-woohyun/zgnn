import { Heart } from '@untitledui/icons';
import { useAppStore, useIsSaved } from '../store/useAppStore';
import { cx } from '../utils/cx';

type TSaveButtonProps = {
  id: string;
  name: string;
  /** icon: 카드 위 하트만. full: 상세 화면의 라벨 있는 버튼. */
  variant?: 'icon' | 'full';
  className?: string;
};

/**
 * 저장 토글.
 *
 * 카드 안에서는 카드 전체가 상세로 가는 링크라, 하트를 눌렀을 때 화면이 넘어가지 않도록
 * 기본 동작을 막는다. 히트 영역은 44px 을 채우고 하트 자체는 작게 둔다.
 */
export function SaveButton({ id, name, variant = 'icon', className = '' }: TSaveButtonProps) {
  const saved = useIsSaved(id);
  const toggleSaved = useAppStore((state) => state.toggleSaved);
  const label = saved ? `${name} 저장 해제` : `${name} 저장`;

  if (variant === 'full') {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={saved}
        onClick={() => toggleSaved(id)}
        className={cx(
          'flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors',
          saved
            ? 'border-camellia bg-camellia-wash text-camellia'
            : 'border-primary bg-primary text-secondary hover:bg-secondary',
          className,
        )}
      >
        <Heart size={18} className={saved ? 'fill-camellia' : undefined} />
        {saved ? '저장함' : '저장'}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={saved}
      onClick={(event) => {
        // 카드 링크 위에 얹혀 있어서, 막지 않으면 하트를 눌러도 상세로 넘어간다.
        event.preventDefault();
        event.stopPropagation();
        toggleSaved(id);
      }}
      className={cx(
        'grid size-11 place-items-center rounded-full transition-colors',
        saved ? 'text-camellia' : 'text-quaternary hover:text-tertiary',
        className,
      )}
    >
      <Heart size={20} className={saved ? 'fill-camellia' : undefined} />
    </button>
  );
}
