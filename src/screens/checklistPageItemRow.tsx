import { useState } from 'react';
import { ChevronRight } from '@untitledui/icons';
import { Checkbox as AriaCheckbox } from 'react-aria-components';
import { Button } from '../components/base/button';
import { CheckboxBase } from '../components/base/checkbox';
import { useReplay } from '../hooks/useReplay';
import { showAppStatus } from '../lib/appStatus';
import { shouldAskCarrierBag, shouldOfferStroller } from '../lib/checklist';
import { useAppStore } from '../store/useAppStore';
import { cx } from '../utils/cx';
import type { TItem } from '../types';
import { CARD_SURFACE } from '../components/cardSurface';

type TChecklistPageItemRowProps = {
  item: TItem;
  checked: boolean;
  onToggleChecked: () => void;
  /** 이유·사는 곳 시트를 연다. */
  onOpenDetail: () => void;
};

/**
 * 준비물 한 줄 — 이름을 누르면 시트(`ChecklistPageItemSheet`), 오른쪽 상자를 누르면 챙김(ADR-009 v4).
 *
 * 14 W261006.8 은 줄 본체를 체크로 줬다(이름을 누르면 펼쳐져서, 체크하려던 사람이 이유를 펼치고 있었다).
 * v4 에서 그 반대가 됐다 — 탭이 "물건을 찾아 갖고 있는지 표시하는 곳" 이 되며 줄이 펼침 없이 한 줄이 됐고,
 * 체크는 할 일 목록의 관례대로 오른쪽 끝 상자 하나(44px)에 둔다. 이름을 누르면 무엇인지·어디서 사는지가 뜬다.
 *
 * 계절 물건(튜브·방한용품)은 늘 보인다 — 계절로 거르면 검색한 물건이 안 나온다. 대신 이름 옆에 계절을 단다.
 */
export function ChecklistPageItemRow({ item, checked, onToggleChecked, onOpenDetail }: TChecklistPageItemRowProps) {
  /*
   * 기내용 가방을 챙겼는데 프로필 이동 수단이 '없어요' 면 한 번 묻는다(`shouldAskCarrierBag`).
   * 강아지 정보는 prop 으로 흘리지 않고 이 줄이 스토어에서 직접 읽는다 — 묻는 줄은 가방 한 줄뿐이라
   * 목록 전체를 거쳐 내려보낼 이유가 없다. 묻는 상태는 이 줄의 것이라 화면을 떠나면 잊는다.
   */
  const dog = useAppStore((state) => state.dog);
  const setDog = useAppStore((state) => state.setDog);
  const [askCarrier, setAskCarrier] = useState(false);
  // 챙기는 순간 이모지가 가방에 들어가듯 한 번 뛴다(`styles/microMotion.css`). 누른 순간에만 — 체크 목록도 마운트 뒤에 읽어 온다.
  const [hop, replayHop] = useReplay();

  const handleToggleChecked = () => {
    const becameChecked = !checked;
    if (becameChecked) replayHop();
    onToggleChecked();
    setAskCarrier(shouldAskCarrierBag(item.name, becameChecked, dog));
  };

  const offerStroller = shouldOfferStroller(item.name, checked, dog);
  const seasonTag = item.seasons.includes('사계절') ? null : item.seasons.join('·');

  const acceptCarrier = () => {
    if (dog) {
      setDog({ ...dog, carrier: 'bag' });
      showAppStatus('이동 수단을 이동가방으로 바꿨어요');
    }
    setAskCarrier(false);
  };

  return (
    <li className={CARD_SURFACE}>
      <div className="flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={onOpenDetail}
          aria-haspopup="dialog"
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-3 text-left outline-focus-ring transition-colors hover:bg-secondary focus-visible:outline-2"
        >
          {/* item.emoji 는 데이터 콘텐츠라 장식용 이모지 금지 규칙의 예외로 그대로 보여준다. */}
          <span key={hop} className={cx('text-xl', hop > 0 && 'motion-hop')} aria-hidden="true">
            {item.emoji}
          </span>
          <span
            className={cx(
              'min-w-0 flex-1 truncate text-sm font-semibold',
              checked ? 'text-tertiary line-through' : 'text-primary',
            )}
          >
            {item.name}
            {seasonTag && <span className="ml-1.5 text-xs font-medium text-tertiary">{seasonTag}</span>}
          </span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-quaternary" />
        </button>

        <AriaCheckbox
          aria-label={`${item.name} 챙김`}
          isSelected={checked}
          onChange={handleToggleChecked}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none"
        >
          {({ isSelected, isFocusVisible }) => (
            <CheckboxBase size="md" isSelected={isSelected} isFocusVisible={isFocusVisible} className="size-6" />
          )}
        </AriaCheckbox>
      </div>

      {/*
        묻기만 한다 — 판정을 바꾸는 것은 사용자의 [바꾸기] 한 번이다(ADR-009 의 반대 방향은 여전히 금지).
        장소가 아니라 우리 강아지 프로필에서 오는 물음이라 v4 에서도 남는다. 두 버튼 모두 44px.
      */}
      {/* 프로필 → 준비물은 묻기만 한다(`shouldOfferStroller`) — 조용히 챙김으로 세면 안 챙긴 것을 챙긴 것처럼 말한다(07 U6). 체크하면 사라진다. */}
      {offerStroller && (
        <div className="mx-2 mb-2 flex items-center gap-2 rounded-xl bg-secondary p-3" role="group" aria-label="유모차 챙기기">
          <p className="min-w-0 flex-1 text-sm text-secondary">유모차로 다닌다고 적어 두셨어요. 챙기셨나요?</p>
          <Button size="sm" color="secondary" className="h-11 shrink-0" onClick={handleToggleChecked}>
            챙겼어요
          </Button>
        </div>
      )}

      {askCarrier && (
        <div className="mx-2 mb-2 rounded-xl bg-secondary p-3" role="group" aria-label="이동 수단 바꾸기">
          <p className="text-sm text-secondary">우리 강아지 이동 수단도 &lsquo;이동가방&rsquo; 으로 바꿀까요?</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" color="primary" className="h-11" onClick={acceptCarrier}>
              바꾸기
            </Button>
            <Button size="sm" color="secondary" className="h-11" onClick={() => setAskCarrier(false)}>
              괜찮아요
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
