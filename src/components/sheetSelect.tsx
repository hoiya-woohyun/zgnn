'use client';

import { useId, useState } from 'react';
import { Check, ChevronDown } from '@untitledui/icons';
import {
  Header as AriaHeader,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
} from 'react-aria-components';
import { BottomSheet } from '@/components/base/bottom-sheet';
import { Select } from '@/components/base/select';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cx } from '@/utils/cx';

export type TSheetSelectOption = {
  id: string;
  label: string;
  /** 이름 옆에 작게 붙는 보조 정보(숙소의 읍면 등). */
  supportingText?: string;
};

export type TSheetSelectSection = {
  /** 없으면 구분선 없이 이어 붙인다. */
  title?: string;
  options: TSheetSelectOption[];
};

type TSheetSelectProps = {
  /** 스크린리더 이름이자 시트 제목. */
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  sections: TSheetSelectSection[];
  /** 맨 위에 "선택 안 함" 행을 둔다. 고르면 `onChange(null)`. 트리거에는 이 글자가 값처럼 보인다. */
  noneLabel: string;
  className?: string;
};

/** react-aria 키는 빈 문자열을 못 쓴다. `null` 값을 이 키로 바꿔 다룬다. */
const NONE_KEY = '__none__';

/** placesPage 가 조건 판을 시트로 접는 지점(md)과 같다 — 같은 화면에서 한쪽만 시트면 어색하다. */
const NARROW_QUERY = '(max-width: 47.99rem)';

/**
 * 긴 목록용 select. 좁은 화면에서는 하단 시트, 넓은 화면에서는 보통 드롭다운.
 *
 * Untitled UI 의 Select 는 트리거 폭에 맞춘 팝오버(최대 224px)라 읍면 20여 개·숙소 26곳을
 * 넣으면 손가락으로 훑기 어렵다. 항목이 서너 개면 그냥 Select 를 쓴다 — 시트는 무겁다.
 *
 * 폭 기준(md)으로 가르는 이유: 시트를 CSS 로 숨길 수 없어서(useMediaQuery 참조) 자바스크립트로
 * 갈라야 하고, 이왕 가르는 김에 placesPage 의 조건 시트와 같은 지점에서 갈라 화면마다 규칙이
 * 다르지 않게 했다. 정적 HTML 의 첫 프레임은 드롭다운 쪽으로 그려지지만 트리거 모양이 같아
 * 티가 나지 않고, 열기 전에는 어느 쪽인지 의미가 없다.
 */
export function SheetSelect({ label, value, onChange, sections, noneLabel, className }: TSheetSelectProps) {
  const isNarrow = useMediaQuery(NARROW_QUERY);

  return isNarrow ? (
    <SheetPicker
      label={label}
      value={value}
      onChange={onChange}
      sections={sections}
      noneLabel={noneLabel}
      className={className}
    />
  ) : (
    <Select
      aria-label={label}
      size="sm"
      selectedKey={value ?? NONE_KEY}
      onSelectionChange={(key) => onChange(key === NONE_KEY ? null : String(key))}
      className={className}
      // 기본은 트리거 폭×224px 이라 긴 목록엔 좁다(읍면 트리거는 w-40). 데스크톱은 자리가 넉넉하니 더 보여 준다.
      popoverClassName="max-h-96! min-w-60"
    >
      <Select.Item id={NONE_KEY}>{noneLabel}</Select.Item>
      {sections.map((section, index) =>
        section.title ? (
          <AriaListBoxSection key={section.title} id={section.title}>
            <AriaHeader className="px-3 pt-2 pb-1 text-xs font-semibold text-tertiary">{section.title}</AriaHeader>
            {section.options.map((option) => (
              <Select.Item key={option.id} id={option.id} supportingText={option.supportingText}>
                {option.label}
              </Select.Item>
            ))}
          </AriaListBoxSection>
        ) : (
          <AriaListBoxSection key={index} id={`section-${index}`}>
            {section.options.map((option) => (
              <Select.Item key={option.id} id={option.id} supportingText={option.supportingText}>
                {option.label}
              </Select.Item>
            ))}
          </AriaListBoxSection>
        ),
      )}
    </Select>
  );
}

function SheetPicker({ label, value, onChange, sections, noneLabel, className }: TSheetSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const labelId = useId();
  const valueId = useId();

  const selected = sections.flatMap((section) => section.options).find((option) => option.id === value);
  const selectedKey = selected ? selected.id : NONE_KEY;

  return (
    <>
      {/*
        Untitled Select 의 트리거(select.tsx SelectValue, size=sm)와 같은 모양. 넓은 화면과 바뀌어도 티가 안 나야 한다.
        접근성 이름은 "라벨 + 현재 값" — aria-label 로 라벨만 주면 스크린리더가 지금 골라 둔 것을 못 읽는다
        (native select 와 react-aria Select 는 둘 다 읽어 준다).
      */}
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <button
        type="button"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className={cx(
          'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg bg-primary py-2 pr-2.5 pl-3 text-left shadow-xs ring-1 ring-primary outline-hidden transition duration-100 ease-linear ring-inset',
          'focus-visible:ring-2 focus-visible:ring-brand',
          isOpen && 'ring-2 ring-brand',
          className,
        )}
      >
        <span id={valueId} className="truncate text-sm font-medium text-primary">
          {selected?.label ?? noneLabel}
        </span>
        <ChevronDown aria-hidden="true" className="ml-auto size-4 shrink-0 stroke-[2.25px] text-fg-quaternary" />
      </button>

      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label={label}>
        <h2 className="pt-2 pr-10 text-md font-bold text-primary">{label}</h2>

        {/*
          selectionMode=single 에서는 항목을 눌러도 onAction 이 안 불리고, 이미 고른 항목을
          다시 누르면 선택이 비워진다(react-aria useSelectableItem). 그래서 onSelectionChange
          하나로 받되, 빈 선택은 "값 그대로 두고 닫기" 로 다룬다 — 어느 행을 눌러도 시트가 닫힌다.
          autoFocus 는 지금 고른 행에 포커스를 줘 긴 목록에서 그 자리로 스크롤한다.
        */}
        <AriaListBox
          aria-label={label}
          selectionMode="single"
          selectedKeys={[selectedKey]}
          onSelectionChange={(keys) => {
            if (keys !== 'all' && keys.size > 0) {
              const key = String([...keys][0]);
              onChange(key === NONE_KEY ? null : key);
            }
            setIsOpen(false);
          }}
          autoFocus
          className="-mx-2 mt-3 max-h-[65dvh] overflow-y-auto outline-hidden"
        >
          <SheetRow id={NONE_KEY} label={noneLabel} />
          {sections.map((section, index) => (
            <AriaListBoxSection key={section.title ?? index} id={section.title ?? `section-${index}`}>
              {section.title && (
                <AriaHeader className="px-3 pt-4 pb-1 text-xs font-semibold text-tertiary">{section.title}</AriaHeader>
              )}
              {section.options.map((option) => (
                <SheetRow key={option.id} id={option.id} label={option.label} supportingText={option.supportingText} />
              ))}
            </AriaListBoxSection>
          ))}
        </AriaListBox>
      </BottomSheet>
    </>
  );
}

function SheetRow({ id, label, supportingText }: TSheetSelectOption) {
  return (
    <AriaListBoxItem
      id={id}
      textValue={supportingText ? `${label} ${supportingText}` : label}
      className={({ isSelected, isFocusVisible, isPressed }) =>
        cx(
          'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 outline-hidden select-none',
          isSelected ? 'bg-brand-primary text-brand-secondary' : 'text-primary hover:bg-primary_hover',
          isPressed && 'bg-primary_hover',
          isFocusVisible && 'ring-2 ring-focus-ring ring-inset',
        )
      }
    >
      {({ isSelected }) => (
        <>
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <span className="truncate text-md font-medium">{label}</span>
            {supportingText && <span className="text-sm text-tertiary">{supportingText}</span>}
          </span>
          {isSelected && <Check aria-hidden="true" className="size-5 shrink-0 text-fg-brand-primary" />}
        </>
      )}
    </AriaListBoxItem>
  );
}
