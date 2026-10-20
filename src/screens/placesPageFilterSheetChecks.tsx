'use client';

import { useId } from 'react';
import { Checkbox as AriaCheckbox } from 'react-aria-components';
import { CheckboxBase } from '../components/base/checkbox';
import type { TPetFilter, TPetFilterKey } from '../lib/placeFilters';
import { cx } from '../utils/cx';

type TPlacesPageFilterSheetChecksProps = {
  title: string;
  /** 섹션 밑 한 줄 — 원문 조건만 갖는다(무엇으로 거르는지가 판정과 다른 축이라, 14 W261007.7). */
  hint?: string;
  filters: readonly TPetFilter[];
  petKeys: readonly TPetFilterKey[];
  onToggle: (key: TPetFilterKey) => void;
};

/**
 * 필터 시트의 2열 체크박스 섹션(22 D-8) — 원문에 적힌 조건 · 숙소 환경.
 *
 * 여럿을 고르면 **모두 맞는 곳**만 남는다(AND). 알약 칩을 줄바꿈으로 늘어놓으면 "하나 고르기" 인지 "여럿 다" 인지 모양이 말하지 않았다 —
 * 체크박스는 그 말을 모양으로 한다(실서비스도 긴 목록은 체크박스). 칸 44px · 상자 20px(`CheckboxBase` md — base 는 감싸서 쓴다).
 */
export function PlacesPageFilterSheetChecks({ title, hint, filters, petKeys, onToggle }: TPlacesPageFilterSheetChecksProps) {
  const titleId = useId();
  const hintId = useId();

  return (
    <section role="group" aria-labelledby={titleId} aria-describedby={hint ? hintId : undefined}>
      <h3 id={titleId} className="text-md font-bold text-primary">
        {title}
      </h3>
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-tertiary">
          {hint}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-x-2">
        {filters.map((filter) => (
          <AriaCheckbox
            key={filter.key}
            isSelected={petKeys.includes(filter.key)}
            onChange={() => onToggle(filter.key)}
            className="flex h-11 min-w-0 cursor-pointer items-center gap-2 select-none"
          >
            {({ isSelected, isFocusVisible }) => (
              <>
                <CheckboxBase size="md" isSelected={isSelected} isFocusVisible={isFocusVisible} className="rounded-sm" />
                <span className={cx('truncate text-md', isSelected ? 'text-primary' : 'text-secondary')}>{filter.label}</span>
              </>
            )}
          </AriaCheckbox>
        ))}
      </div>
    </section>
  );
}
