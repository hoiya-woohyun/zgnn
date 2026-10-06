import { Heart } from '@untitledui/icons';
import { usePathname } from 'next/navigation';
import { createFirstTimesGate, showAppStatus } from '../lib/appStatus';
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
 * 저장 알림은 세션에서 처음 두 번만 — 처음에는 "어디에 모였는지" 를 알려 줘야 하지만(저장한 곳은
 * 탭바에 없다), 매번 뜨면 하트를 연달아 누르는 사람에게 소음이 된다. 모듈 변수라 새로 열면 다시 센다.
 */
const shouldAnnounceSave = createFirstTimesGate(2);

/** 저장(해제 아님)일 때만 알린다. 해제는 하트가 비는 것으로 충분하다. */
const announceSaved = () => {
  if (!shouldAnnounceSave()) return;
  showAppStatus('저장했어요', { link: { href: '/saved', label: '저장한 곳 보기' } });
};

/**
 * 저장 상태와 토글. 알림 규칙(처음 두 번)을 다른 모양의 저장 버튼(상세 액션 줄)도 같이 쓰게 밖으로 뺐다.
 *
 * **저장 화면에서 끄면 되돌리기를 준다**(12 U2.2). 거기서는 하트가 비는 모습도 없이 카드가 통째로 사라지고,
 * 하트를 끄면 메모도 지워진다(10 F5) — 그래서 되돌리기는 자리와 메모까지 살린다. 다른 화면에서는 하트가 비는 것으로 충분하다.
 */
export function useSaveToggle(id: string) {
  const saved = useIsSaved(id);
  const toggleSaved = useAppStore((state) => state.toggleSaved);
  const restoreSaved = useAppStore((state) => state.restoreSaved);
  const onSavedScreen = usePathname().startsWith('/saved');
  const toggle = () => {
    if (!saved) {
      announceSaved();
      toggleSaved(id);
      return;
    }
    const { savedIds, savedNotes } = useAppStore.getState();
    const index = savedIds.indexOf(id);
    const note = savedNotes[id];
    toggleSaved(id);
    if (onSavedScreen) {
      showAppStatus('저장을 취소했어요', {
        action: { label: '되돌리기', onPress: () => restoreSaved(id, index, note) },
        durationMs: 6000,
      });
    }
  };
  return { saved, toggle };
}

/**
 * 저장 토글.
 *
 * 카드 안에서는 카드 전체가 상세로 가는 링크라, 하트를 눌렀을 때 화면이 넘어가지 않도록
 * 기본 동작을 막는다. 히트 영역은 44px 을 채우고 하트 자체는 작게 둔다.
 *
 * 이름표는 `${name} 저장` 으로 **고정**하고 상태는 `aria-pressed` 만 말한다(D9). 이름표까지
 * "저장 해제" 로 바꾸면 스크린리더가 "저장 해제, 눌림" 처럼 두 번, 서로 반대로 읽는다.
 */
export function SaveButton({ id, name, variant = 'icon', className = '' }: TSaveButtonProps) {
  const { saved, toggle } = useSaveToggle(id);
  const label = `${name} 저장`;

  if (variant === 'full') {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={saved}
        onClick={toggle}
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
        toggle();
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
