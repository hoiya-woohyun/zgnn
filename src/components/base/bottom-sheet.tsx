import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { XClose } from '@untitledui/icons';
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from 'react-aria-components';
import { cx } from '@/utils/cx';

type TBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** 스크린리더가 읽을 시트 이름. 시각적으로는 내용이 제목을 대신한다. */
  label: string;
  children: ReactNode;
};

/** 이만큼 끌어내리면 닫는다. 이보다 짧아도 빠르게 튕기면(px/ms) 닫는다. */
const DISMISS_DISTANCE_PX = 96;
const DISMISS_VELOCITY = 0.6;

/**
 * 손가락으로 시트를 끌어내려 닫기.
 *
 * 잡는 곳은 시트 위쪽의 핸들 띠뿐이다. 시트 전체를 잡게 하면 안쪽 목록(overflow-y-auto)의
 * 스크롤과 싸운다 — touch-action 은 조상 쪽이 막으면 자식이 되살릴 수 없어서, 시트에 `none` 을
 * 걸면 안의 목록이 안 넘어가고, 안 걸면 브라우저가 스크롤 제스처로 가져가며 pointercancel 을 보낸다.
 * 핸들 띠에만 `touch-action: none` 을 걸면 둘이 안 겹친다. 마우스는 제외 — 데스크톱에서는
 * 가운데 대화상자라 끌어내리는 동작이 어색하다.
 *
 * 끌리는 동안의 이동은 AriaModal 이 아니라 AriaDialog 에 건다. AriaModal 의 닫힘 애니메이션
 * (slide-out-to-bottom)이 keyframe 이라 인라인 transform 을 덮어써서, 같은 요소에 걸면 놓는 순간
 * 위로 튀었다가 내려간다.
 */
const useBottomSheetDrag = (onDismiss: () => void) => {
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);
  // 속도는 마지막 두 move 사이로 잰다 — pointerup 은 마지막 move 와 같은 자리라 그걸로 재면 늘 0 이다.
  const samples = useRef<{ prev: { y: number; t: number }; last: { y: number; t: number } } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    start.current = { y: event.clientY, t: event.timeStamp };
    samples.current = { prev: start.current, last: start.current };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!start.current || !samples.current) return;
    samples.current = { prev: samples.current.last, last: { y: event.clientY, t: event.timeStamp } };
    setOffsetY(Math.max(0, event.clientY - start.current.y));
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (!start.current || !samples.current) return;
    const distance = Math.max(0, event.clientY - start.current.y);
    const { prev, last } = samples.current;
    const velocity = (last.y - prev.y) / Math.max(1, last.t - prev.t);
    start.current = null;
    samples.current = null;
    setIsDragging(false);

    if (distance > DISMISS_DISTANCE_PX || velocity > DISMISS_VELOCITY) {
      onDismiss();
      return;
    }
    setOffsetY(0);
  };

  const style: CSSProperties = {
    transform: offsetY ? `translateY(${offsetY}px)` : undefined,
    // 끌 때는 손가락을 그대로 따라가고, 놓았을 때만 제자리로 돌아가는 움직임을 준다.
    transition: isDragging ? 'none' : 'transform 200ms ease-out',
  };

  return {
    style,
    handleProps: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
};

/**
 * 하단 시트. 지도에서 마커를 눌렀을 때 장소 미니 카드를 띄우고, 둘러보기 조건·긴 목록 select 도 쓴다.
 * (Untitled UI 복사본이 아니라 이 앱이 만든 컴포넌트다 — 아래 설명 참고.)
 *
 * Untitled UI 의 Modal 은 가운데 정렬 대화상자라, 아래에서 올라오는 시트로 쓰려고
 * 같은 react-aria-components 프리미티브 위에 따로 만들었다.
 * react-aria 가 포커스 트랩·Esc 닫기·바깥 클릭·스크롤 잠금을 맡는다.
 */
export function BottomSheet({ isOpen, onOpenChange, label, children }: TBottomSheetProps) {
  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      // 지도 오버레이(z-1000)와 Leaflet 컨트롤보다 위에 와야 한다.
      //
      // 퇴장 애니메이션에 fill-mode-forwards 가 꼭 있어야 한다. react-aria 는 오버레이와 시트의
      // 애니메이션이 **둘 다** 끝나야 DOM 에서 내리는데, tailwindcss-animate 의 animate-out 은
      // fill-mode 가 없어 먼저 끝난 쪽이 원래 모습으로 돌아온다. 배경(150ms)이 시트(200ms)보다
      // 먼저 끝나 남은 50ms 동안 어두운 배경이 다시 켜졌다 꺼졌다 — 닫을 때 깜빡이던 원인이다.
      className={({ isEntering, isExiting }) =>
        cx(
          'fixed inset-0 z-[1100] flex items-end justify-center bg-overlay/50 backdrop-blur-[2px] sm:items-center sm:p-6',
          isEntering && 'duration-200 ease-out animate-in fade-in',
          isExiting && 'duration-150 ease-in animate-out fade-out fill-mode-forwards',
        )
      }
    >
      <AriaModal
        className={({ isEntering, isExiting }) =>
          cx(
            'w-full max-w-lg outline-hidden',
            isEntering && 'duration-250 ease-out animate-in slide-in-from-bottom',
            isExiting && 'duration-200 ease-in animate-out slide-out-to-bottom fill-mode-forwards',
          )
        }
      >
        <BottomSheetPanel label={label} onDismiss={() => onOpenChange(false)}>
          {children}
        </BottomSheetPanel>
      </AriaModal>
    </AriaModalOverlay>
  );
}

/**
 * 시트 본체. 끌어내린 위치 상태를 여기 두는 이유 — 닫히면 AriaModal 이 이 컴포넌트를 내리므로
 * 다음에 열 때 제자리(0)에서 시작한다. 바깥 BottomSheet 에 두면 닫힐 때 되돌리는 effect 가 필요하다.
 */
function BottomSheetPanel({ label, onDismiss, children }: { label: string; onDismiss: () => void; children: ReactNode }) {
  const drag = useBottomSheetDrag(onDismiss);

  return (
    <AriaDialog
      aria-label={label}
      aria-modal="true"
      style={drag.style}
      // 모바일은 위쪽 핸들 띠(h-7) 밑으로 내용이 들어가지 않게 pt-6. 데스크톱은 핸들이 없다.
      // 바닥은 pb-sheet — p-4 의 바닥분과 홈 인디케이터(safe-area)를 합친 값이다(globals.css 주석).
      // 면은 바탕과 같은 크림이다(ADR-010 v4). 이 시트는 화면 아래 끝(SAB)에 닿는 면이라, 흰색이면
      // 탭바·바탕의 크림 사이에 흰 판이 끼어 가장자리 색이 갈린다. 안의 칩·입력칸이 흰색으로 떠 있다.
      className="pb-sheet relative rounded-t-2xl border border-secondary bg-secondary p-4 pt-6 shadow-xl outline-hidden sm:rounded-2xl sm:pt-4"
    >
      {/*
        끌어내리는 핸들. 띠(h-1)만 보이지만 잡는 영역은 위쪽 28px 전체라 손가락이 빗나가도 잡힌다.
        데스크톱(sm 이상)은 가운데 대화상자라 핸들도 끌기도 없다.
      */}
      <div
        aria-hidden="true"
        {...drag.handleProps}
        className="absolute inset-x-0 top-0 flex h-7 cursor-grab touch-none items-center justify-center sm:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-quaternary" />
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="닫기"
        className="absolute top-2 right-2 z-10 grid size-11 place-items-center rounded-full text-quaternary hover:bg-tertiary"
      >
        <XClose size={20} />
      </button>
      {children}
    </AriaDialog>
  );
}
