import type { ReactNode } from 'react';
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

/**
 * 하단 시트. 지도에서 마커를 눌렀을 때 장소 미니 카드를 띄운다.
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
      className={({ isEntering, isExiting }) =>
        cx(
          'fixed inset-0 z-[1100] flex items-end justify-center bg-overlay/50 backdrop-blur-[2px] sm:items-center sm:p-6',
          isEntering && 'duration-200 ease-out animate-in fade-in',
          isExiting && 'duration-150 ease-in animate-out fade-out',
        )
      }
    >
      <AriaModal
        className={({ isEntering, isExiting }) =>
          cx(
            'w-full max-w-lg outline-hidden',
            isEntering && 'duration-250 ease-out animate-in slide-in-from-bottom',
            isExiting && 'duration-200 ease-in animate-out slide-out-to-bottom',
          )
        }
      >
        <AriaDialog
          aria-label={label}
          className="pb-safe relative rounded-t-2xl border border-secondary bg-primary p-4 shadow-xl outline-hidden sm:rounded-2xl"
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="닫기"
            className="absolute top-2 right-2 grid size-11 place-items-center rounded-full text-quaternary hover:bg-secondary"
          >
            <XClose size={20} />
          </button>
          {children}
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
