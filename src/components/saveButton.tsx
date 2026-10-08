import { useState } from 'react';
import { Heart } from '@untitledui/icons';
import { usePathname } from 'next/navigation';
import { PawMark } from './pawMark';
import { createFirstTimesGate, showAppStatus } from '../lib/appStatus';
import { rememberUnsavedOnSavedPage, takeUnsavedOnSavedPage } from '../lib/savedPageSession';
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
 * 저장 순간의 모션 — 하트가 쿵 커지고 둘레로 점 여섯이 퍼진다(`styles/microMotion.css`). 끌 때는 아무 일도 없다.
 * `n` 은 몇 번째 저장인지(요소의 `key` — 바뀌면 처음부터 돈다, `hooks/useReplay.ts` 와 같은 수법), 0 이면 아직 안 눌렀다.
 * 이스터에그로 **가끔(`PAW_BURST_CHANCE`) 점 대신 발바닥**이 퍼진다. 정해진 횟수가 아니라 운이라, 하트를 여러 번 누른 사람만 언젠가 본다.
 */
export type TSaveBurst = { n: number; paws: boolean };
const PAW_BURST_CHANCE = 1 / 8;
const BURST_ANGLES = [0, 60, 120, 180, 240, 300];

/** 하트 둘레에 퍼지는 조각. 놓는 쪽이 `relative` 상자 안에 둔다 — 조각은 그 상자의 가운데에서 출발한다. */
export function SaveBurst({ burst }: { burst: TSaveBurst }) {
  if (burst.n === 0) return null;
  return (
    <span
      key={burst.n}
      aria-hidden="true"
      data-paws={burst.paws || undefined}
      className="motion-burst pointer-events-none absolute inset-0 text-camellia"
    >
      {BURST_ANGLES.map((angle) => (
        <span key={angle} style={{ ['--a' as string]: `${angle}deg` }}>
          {burst.paws && <PawMark className="block size-full" />}
        </span>
      ))}
    </span>
  );
}

/** 하트 아이콘에 붙일 key·클래스 — 저장할 때마다 새로 붙어 한 번 튄다. */
export const saveHeartMotion = (burst: TSaveBurst) => ({
  key: burst.n,
  className: burst.n > 0 ? 'motion-heart-pop' : undefined,
});

/**
 * 저장 상태와 토글. 알림 규칙(처음 두 번)을 다른 모양의 저장 버튼(상세 액션 줄)도 같이 쓰게 밖으로 뺐다.
 *
 * **저장 화면에서는 하트가 곧 되돌리기다**(12 U2.2 v2). 거기서 끈 카드는 다음에 들어올 때까지 자리에 남으므로
 * (`lib/savedPageSession.ts`), 다시 켜면 **원래 자리와 메모**를 그대로 돌린다 — 하트를 끄면 메모가 지워지고(10 F5)
 * `toggleSaved` 로 켜면 맨 뒤에 붙기 때문이다. 다른 화면에서는 하트가 비는 것으로 충분하다.
 */
export function useSaveToggle(id: string) {
  const saved = useIsSaved(id);
  const toggleSaved = useAppStore((state) => state.toggleSaved);
  const restoreSaved = useAppStore((state) => state.restoreSaved);
  const onSavedScreen = usePathname().startsWith('/saved');
  const [burst, setBurst] = useState<TSaveBurst>({ n: 0, paws: false });
  const toggle = () => {
    if (!saved) {
      // 누른 순간에만 튼다 — 저장 상태는 마운트 뒤에 읽어 와서, 상태 변화를 보고 틀면 화면을 열 때마다 하트가 전부 튄다.
      setBurst((current) => ({ n: current.n + 1, paws: Math.random() < PAW_BURST_CHANCE }));
      const memory = onSavedScreen ? takeUnsavedOnSavedPage(id) : undefined;
      if (memory) {
        restoreSaved(id, memory.index, memory.note, memory.day);
        return;
      }
      announceSaved();
      toggleSaved(id);
      return;
    }
    const { savedIds, savedNotes, tripDays } = useAppStore.getState();
    const index = savedIds.indexOf(id);
    const note = savedNotes[id];
    const day = tripDays[id];
    toggleSaved(id);
    if (onSavedScreen) {
      rememberUnsavedOnSavedPage(id, { index, note, day });
      showAppStatus('저장을 취소했어요. 다시 들어오면 목록에서 빠져요');
    }
  };
  return { saved, toggle, burst };
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
  const { saved, toggle, burst } = useSaveToggle(id);
  const heartMotion = saveHeartMotion(burst);
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
        <span className="relative grid place-items-center">
          <Heart key={heartMotion.key} size={18} className={cx(saved && 'fill-camellia', heartMotion.className)} />
          <SaveBurst burst={burst} />
        </span>
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
        'relative grid size-11 place-items-center rounded-full transition-colors',
        saved ? 'text-camellia' : 'text-quaternary hover:text-tertiary',
        className,
      )}
    >
      <Heart key={heartMotion.key} size={20} className={cx(saved && 'fill-camellia', heartMotion.className)} />
      <SaveBurst burst={burst} />
    </button>
  );
}
