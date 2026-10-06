import { useState } from 'react';
import { ChevronDown, LinkExternal01 } from '@untitledui/icons';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { Checkbox } from '../components/base/checkbox';
import { showAppStatus } from '../lib/appStatus';
import { shouldAskCarrierBag } from '../lib/checklist';
import { linkLabel } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { cx } from '../utils/cx';
import type { TItem } from '../types';

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

  const handleToggleChecked = () => {
    const becameChecked = !checked;
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
    <li className={cx('rounded-2xl border border-secondary bg-primary', provided && 'opacity-65')}>
      <div className="flex items-center gap-1 p-2">
        <Checkbox
          size="md"
          aria-label={`${item.name} 챙김`}
          isSelected={checked}
          onChange={handleToggleChecked}
          className="h-11 w-11 items-center justify-center"
        />

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left"
        >
          {/* item.emoji 는 데이터 콘텐츠라 장식용 이모지 금지 규칙의 예외로 그대로 보여준다. */}
          <span className="text-xl" aria-hidden="true">
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
          <ChevronDown
            aria-hidden="true"
            className={cx(
              'size-5 shrink-0 text-tertiary transition-transform duration-200',
              expanded && 'rotate-180',
            )}
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
        <div className="overflow-hidden">
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
                      // 닫힌 동안에는 링크가 포커스를 받지 못하게 한다 — 보이지 않는데 탭이 멈춘다.
                      tabIndex={expanded ? undefined : -1}
                      className="flex min-h-11 items-center gap-2 px-3 py-2 transition-colors hover:bg-secondary"
                    >
                      <span className="min-w-0 flex-1 text-sm font-semibold text-primary">
                        {variant.label}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-brand-secondary">
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
                tabIndex={expanded ? undefined : -1}
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
