import { useState } from 'react';
import { ChevronDown, LinkExternal01 } from '@untitledui/icons';
import { Checkbox as AriaCheckbox } from 'react-aria-components';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { CheckboxBase } from '../components/base/checkbox';
import { useReplay } from '../hooks/useReplay';
import { showAppStatus } from '../lib/appStatus';
import { shouldAskCarrierBag } from '../lib/checklist';
import { linkLabel } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { cx } from '../utils/cx';
import type { TItem } from '../types';
import { CARD_SURFACE } from '../components/cardSurface';

type TChecklistPageItemRowProps = {
  item: TItem;
  checked: boolean;
  /** 저장한 숙소가 대신 갖고 있는 항목. 흐리게 + 배지. */
  provided: boolean;
  expanded: boolean;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
};

/**
 * 준비물 한 줄.
 *
 * 갈래가 있는 준비물(`item.variants` — 기내용 가방의 몸무게 구간)은 목록에 두 줄로 두지 않고
 * 한 줄 안에서 편다. 우리 강아지는 둘 중 하나에만 해당하는데 두 줄이면 나머지 한 줄이 영영
 * 체크되지 않은 채 남기 때문이다(`lib/places.ts` 의 ITEM_VARIANTS). 체크는 바깥 한 번,
 * 링크만 갈래별로 갈린다.
 *
 * 펼침은 `hidden` 토글이 아니라 grid 행 높이(0fr → 1fr)로 연다 — 내용 높이를 미리 몰라도
 * 되고, 목록이 툭 튀는 대신 밀려 내려간다. 테두리는 반드시 `overflow-hidden` 안쪽에 둔다.
 * 바깥에 두면 닫힌 상태에서도 선 하나가 남는다.
 * 모션 민감 설정은 globals.css 의 prefers-reduced-motion 규칙이 전역으로 끈다.
 */
export function ChecklistPageItemRow({
  item,
  checked,
  provided,
  expanded,
  onToggleChecked,
  onToggleExpanded,
}: TChecklistPageItemRowProps) {
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

  const acceptCarrier = () => {
    if (dog) {
      setDog({ ...dog, carrier: 'bag' });
      showAppStatus('이동 수단을 이동가방으로 바꿨어요');
    }
    setAskCarrier(false);
  };

  return (
    <li className={cx(CARD_SURFACE, provided && 'opacity-65')}>
      {/*
        줄 본체가 곧 체크다(14 W261006.8) — 예전엔 이름을 누르면 펼쳐져서, 체크하려던 사람이 이유를
        펼치고 있었다. 짐을 싸며 하는 일은 체크가 거의 전부라 큰 면을 체크에 주고, 펼침은 오른쪽
        화살표 칸 하나로 좁힌다. 체크 상자는 24px(목록의 주 동작이라 base 기본 20px 보다 한 단).
      */}
      <div className="flex items-center gap-1 p-2">
        <AriaCheckbox
          aria-label={`${item.name} 챙김`}
          isSelected={checked}
          onChange={handleToggleChecked}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2.5 outline-none"
        >
          {({ isSelected, isFocusVisible }) => (
            <>
              <CheckboxBase size="md" isSelected={isSelected} isFocusVisible={isFocusVisible} className="size-6" />
              {/* item.emoji 는 데이터 콘텐츠라 장식용 이모지 금지 규칙의 예외로 그대로 보여준다. */}
              <span key={hop} className={cx('text-xl', hop > 0 && 'motion-hop')} aria-hidden="true">
                {item.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cx(
                    'block text-sm font-semibold',
                    checked ? 'text-tertiary line-through' : 'text-primary',
                  )}
                >
                  {item.name}
                </span>
                {provided && (
                  <Badge type="color" size="sm" color="success" className="mt-1">
                    숙소에 있어요
                  </Badge>
                )}
              </span>
            </>
          )}
        </AriaCheckbox>

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={`${item.name} 자세히`}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-secondary"
        >
          <ChevronDown
            aria-hidden="true"
            className={cx('size-5 transition-transform duration-200', expanded && 'rotate-180')}
          />
        </button>
      </div>

      {/*
        묻기만 한다 — 판정을 바꾸는 것은 사용자의 [바꾸기] 한 번이다(ADR-009 의 반대 방향은 여전히 금지).
        펼침 칸 위에 둬서 접힌 줄에서도 보인다. 두 버튼 모두 44px.
      */}
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

      <div
        className={cx(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        {/* 닫힌 칸은 `inert` — 시각만 숨기면 이유·링크가 낭독되고 탭이 멈춘다(12 U3.6). 링크마다 tabIndex 를 따로 끄던 것을 이것 하나로 대신한다. */}
        <div className="overflow-hidden" inert={!expanded}>
          <div className="border-t border-secondary px-3 py-3">
            {item.reason && <p className="text-sm text-secondary">{item.reason}</p>}
            {item.variants && item.variants.length > 0 && (
              // 갈래는 버튼을 나란히 두지 않고 줄로 세운다. 나란히 두면 둘 중 하나를 "고르는"
              // 것처럼 보이는데, 실제로는 우리 강아지에 해당하는 한 줄만 보면 되는 목록이다.
              <ul
                className={cx(
                  'divide-y divide-secondary overflow-hidden rounded-xl border border-secondary',
                  item.reason ? 'mt-3' : 'mt-0',
                )}
              >
                {item.variants.map((variant) => (
                  <li key={variant.label}>
                    <a
                      href={variant.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-11 items-center gap-2 px-3 py-2 transition-colors hover:bg-secondary"
                    >
                      <span className="min-w-0 flex-1 text-sm font-semibold text-primary">
                        {variant.label}
                      </span>
                      <span className="shrink-0 text-xs text-brand-secondary">
                        {linkLabel(variant.linkUrl)}
                      </span>
                      <LinkExternal01
                        aria-hidden="true"
                        className="size-4 shrink-0 text-fg-brand-secondary"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {item.linkUrl && (
              <Button
                href={item.linkUrl}
                target="_blank"
                rel="noreferrer"
                color="tertiary"
                size="sm"
                iconTrailing={LinkExternal01}
                className={cx('h-11 w-full', item.reason ? 'mt-3' : 'mt-0')}
              >
                {linkLabel(item.linkUrl)}
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
