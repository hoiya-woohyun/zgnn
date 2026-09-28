'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from '@untitledui/icons';
import { missingItemsAt } from '../lib/itemNeeds';
import { useStoreHydrated } from '../providers/storeHydration';
import type { TPlaceEntry } from '../lib/places';
import { useAppStore } from '../store/useAppStore';
import { cx } from '../utils/cx';

type TMissingItemsNoteProps = {
  place: TPlaceEntry;
  className?: string;
};

/**
 * "여기 가려면 이게 아직이에요" — 장소 하나에 필요한데 준비물 화면에서 아직 체크하지 않은 것.
 *
 * 이동가방·케이지·유모차는 여기서 다루지 않는다(`itemNeeds.ts` 참고). 그건 판정 배지의
 * 몫이고, 같은 화면에서 두 줄이 서로 다른 말을 하게 된다.
 *
 * **여행 계획이 시작된 뒤에만 말을 거는 조건을 뺐다**(2026-09-17). 저장도 체크도 안 한
 * 사람에게는 이 줄이 배경이 된다고 봤는데, 실제로는 그 사람이야말로 "여기 가려면 뭐가
 * 필요한지" 를 처음 보는 사람이라 이 줄을 아예 못 만나고 있었다. 이제 안 챙긴 것이 하나라도
 * 있으면 언제나 뜬다 — 다 챙겼으면 사라지므로, 잘 쓰는 사람에게 저절로 조용해진다.
 *
 * 준비물을 이름만 죽 잇지 않고 알약으로 끊어 놓는다. 장소마다 3~8가지로 개수가 들쭉날쭉한데,
 * 한 줄로 이으면 어디서 끊어 읽어야 할지가 매번 달라진다.
 *
 * **localStorage 를 읽기 전에는 아무 말도 하지 않는다**(`useStoreHydrated`). 읽기 전에는 체크한
 * 것이 하나도 없어 보이므로, 그냥 그리면 다 챙긴 사람에게도 경고가 떴다가 사라진다 —
 * 저장 개수가 0 에서 채워지는 것과 달리, 이것은 한 말을 무르는 쪽이라 보고 나서 말한다.
 */
export function MissingItemsNote({ place, className }: TMissingItemsNoteProps) {
  const season = useAppStore((state) => state.season);
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  const hydrated = useStoreHydrated();

  const missing = useMemo(
    () => missingItemsAt(place, season, checkedItemIds),
    [place, season, checkedItemIds],
  );

  if (!hydrated || missing.length === 0) return null;

  return (
    <Link
      href="/checklist"
      className={cx(
        'block rounded-xl bg-warning-primary p-3 transition-opacity hover:opacity-80',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-warning-primary">
          여기 가려면 {missing.length}가지를 더 챙겨야 해요
        </p>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-warning-primary" />
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {missing.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-secondary"
          >
            {/* item.emoji 는 데이터 콘텐츠라 장식용 이모지 금지 규칙의 예외다(준비물 화면과 같다). */}
            <span aria-hidden="true">{item.emoji}</span>
            {item.name}
          </li>
        ))}
      </ul>
    </Link>
  );
}
