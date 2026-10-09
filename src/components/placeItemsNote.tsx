'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CheckCircle } from '@untitledui/icons';
import { itemNeedsAt, shouldShowPlaceItems } from '../lib/itemNeeds';
import { useStoreHydrated } from '../providers/storeHydration';
import type { TPlaceEntry } from '../lib/places';
import { useAppStore } from '../store/useAppStore';
import { useEligibility } from '../store/useDogEligibility';
import { cx } from '../utils/cx';

type TPlaceItemsNoteProps = {
  place: TPlaceEntry;
  className?: string;
};

/**
 * "여기 필요한 준비물" — 준비물 목록 가운데 이 장소에 필요한 것을 상태와 함께 보여주고, 그 자리에서 체크한다.
 *
 * **준비물 목록이 원본이고 장소는 읽는 쪽이다**(ADR-009 v3). 예전(`MissingItemsNote`)에는 안 챙긴 것만
 * 경고색 알약으로 띄우고 누르면 준비물 화면으로 보냈다. 이제는 필요한 것 전부를 챙김·숙소에 있음·아직
 * 으로 보여주고, 알약을 누르면 **같은 체크가** 준비물 화면에도 반영된다 — 장소를 보다가 "아 이거
 * 챙겨야지" 할 때 화면을 옮기지 않게. 준비물은 입장 조건이 아니라서 경고색을 쓰지 않는다.
 *
 * **다 챙긴 곳에서는 한 줄로 줄어든다** — 잔소리 걱정은 조건이 아니라 조용해지는 성질로 푼다(ADR-009 v2 ③).
 * 다만 이 자리에서 방금 마지막 것을 눌렀다면 줄이지 않는다. 누른 알약이 눈앞에서 사라지면 되돌릴 곳이 없다.
 *
 * **어려움 판정이면 띄우지 않는다**(`shouldShowPlaceItems`). "못 가요" 바로 아래에서 "챙기라" 고 하면
 * 두 줄이 서로 반대를 말한다. 판정은 prop 으로 받지 않고 여기서 직접 읽는다 — 호출부(상세·지도 시트)마다
 * 흘려 보내면 한 곳을 빠뜨리기 쉽다. 이동가방·케이지·유모차는 여기서 다루지 않는다(판정 배지의 몫, `itemNeeds.ts`).
 *
 * **localStorage 를 읽기 전에는 아무 말도 하지 않는다**(`useStoreHydrated`). 읽기 전에는 체크한 것이 하나도
 * 없어 보이므로, 그냥 그리면 다 챙긴 사람에게도 '아직' 이 떴다가 바뀐다 — 한 말을 무르는 쪽이라 보고 나서 말한다.
 */
export function PlaceItemsNote({ place, className }: TPlaceItemsNoteProps) {
  const season = useAppStore((state) => state.season);
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  const toggleChecked = useAppStore((state) => state.toggleChecked);
  const hydrated = useStoreHydrated();
  const level = useEligibility(place)?.level;
  const [touched, setTouched] = useState(false);

  const needs = useMemo(
    () => itemNeedsAt(place, season, checkedItemIds),
    [place, season, checkedItemIds],
  );

  if (!hydrated || needs.length === 0 || !shouldShowPlaceItems(level)) return null;

  // '챙김' 은 체크한 것만 센다. 숙소에 있는 것까지 세면 체크가 하나도 없는 숙소에서 "1/5 챙김" 이 된다
  // (14 W261007.13). 숙소에 있는 것은 챙길 것이 아니라 분모에서도 빠진다 — 알약에 '숙소에 있어요' 가 따로 붙는다.
  const checkedCount = needs.filter((need) => need.status === 'checked').length;
  const toPackCount = needs.filter((need) => need.status !== 'provided').length;
  const providedCount = needs.length - toPackCount;

  if (checkedCount === toPackCount && !touched) {
    return (
      <Link
        href="/checklist"
        className={cx(
          // 놓이는 곳(상세 본문·지도 시트)이 크림이라 흰 판으로 띄운다 — 크림이면 바탕에 녹아 줄이 안 보인다.
          'flex min-h-11 items-center gap-2 rounded-xl border border-secondary bg-primary px-3 text-sm text-secondary transition-colors hover:bg-primary_hover',
          className,
        )}
      >
        <CheckCircle aria-hidden="true" className="size-4 shrink-0 text-fg-success-primary" />
        <span className="min-w-0 flex-1">
          {providedCount === 0
            ? `여기 필요한 준비물 ${needs.length}가지는 다 챙겼어요`
            : `여기 챙길 준비물 ${toPackCount}가지는 다 챙겼어요 · ${providedCount}가지는 숙소에 있어요`}
        </span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-tertiary" />
      </Link>
    );
  }

  return (
    <section
      aria-label="여기 필요한 준비물"
      className={cx('rounded-xl border border-secondary bg-primary p-3', className)}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-primary">
          여기 필요한 준비물
          <span className="ml-1.5 font-normal text-tertiary">
            {checkedCount}/{toPackCount} 챙김
          </span>
        </p>
        <Link
          href="/checklist"
          className="-mr-1 flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-brand-secondary"
        >
          전체 목록
        </Link>
      </div>

      <ul className="mt-1 flex flex-wrap gap-1.5">
        {needs.map(({ item, status }) => (
          <li key={item.id}>
            {status === 'provided' ? (
              // 이 숙소가 갖고 있는 것은 누를 것이 없다 — 체크 여부와 상관없이 여기서는 안 챙겨도 된다.
              <span className="flex h-11 items-center gap-1.5 rounded-lg bg-secondary px-3 text-sm text-tertiary">
                {/* item.emoji 는 데이터 콘텐츠라 장식용 이모지 금지 규칙의 예외다(준비물 화면과 같다). */}
                <span aria-hidden="true">{item.emoji}</span>
                {item.name}
                <span className="text-xs font-semibold text-utility-green-700">숙소에 있어요</span>
              </span>
            ) : (
              <button
                type="button"
                aria-pressed={status === 'checked'}
                onClick={() => {
                  setTouched(true);
                  toggleChecked(item.id);
                }}
                className={cx(
                  'flex h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 outline-focus-ring',
                  status === 'checked'
                    ? 'bg-brand-primary text-brand-secondary'
                    : 'bg-tertiary text-secondary hover:bg-quaternary',
                )}
              >
                {status === 'checked' ? (
                  <Check aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <span aria-hidden="true">{item.emoji}</span>
                )}
                {item.name}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
