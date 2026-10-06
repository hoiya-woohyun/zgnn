import { useState } from 'react';
import { ChevronDown } from '@untitledui/icons';
import { Select } from '../components/base/select';
import { cx } from '../utils/cx';
import type { TDogSize } from '../types';
import { CARD_SURFACE } from '../components/cardSurface';

export const SIZE_LABEL: Record<TDogSize, string> = { small: '소형견', medium: '중형견', large: '대형견' };

const SIZE_OPTIONS: { id: TDogSize; label: string }[] = [
  { id: 'small', label: '소형견 (10kg 미만)' },
  { id: 'medium', label: '중형견 (10~25kg)' },
  { id: 'large', label: '대형견 (25kg 초과)' },
];

type TDogProfileSizeOverrideProps = {
  /** 몸무게로 자동 계산한 크기. 몸무게를 아직 못 정했으면 undefined. */
  computedSize: TDogSize | undefined;
  value: TDogSize | undefined;
  onChange: (size: TDogSize | undefined) => void;
};

/**
 * "크기 수정" 접힘. 리뷰 §1 지적① — 몸무게 칸과 크기 칸을 따로 받으면 사용자가 매번 계산해야
 * 한다. 기본은 몸무게에서 자동 계산하고, 원문의 "대형견" 기준과 어긋날 수 있는 경우에만
 * 여기서 고치게 한다(ADR-005).
 */
export function DogProfileSizeOverride({ computedSize, value, onChange }: TDogProfileSizeOverrideProps) {
  const [open, setOpen] = useState(value !== undefined);
  const shownSize = value ?? computedSize;

  return (
    <div className={CARD_SURFACE}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        {/* "크기 수정 — 자동 계산: 소형견" 은 만드는 사람의 말이었다(D12). 지금 값이 먼저, 어떻게
            정했는지는 괄호로, 할 수 있는 일은 끝에 "바꾸기" 로. 직접 고른 값이 있으면 그것이 지금
            값이다 — 몸무게로 정한 값을 계속 보이면 고친 게 안 먹은 것처럼 읽힌다. */}
        <span className="text-sm">
          <span className="font-semibold text-primary">
            크기: {shownSize ? SIZE_LABEL[shownSize] : '몸무게를 입력하면 정해져요'}
          </span>
          {shownSize && (
            <span className="text-tertiary">{value ? '(직접 골랐어요)' : '(몸무게로 정했어요)'}</span>
          )}
          <span className="text-tertiary"> · </span>
          <span className="font-semibold text-brand-secondary">바꾸기</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cx('size-5 shrink-0 text-tertiary transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-secondary px-4 py-3">
          <Select
            aria-label="강아지 크기"
            size="sm"
            placeholder="몸무게로 정한 크기 쓰기"
            selectedKey={value ?? null}
            onSelectionChange={(key) => onChange(key ? (key as TDogSize) : undefined)}
          >
            {SIZE_OPTIONS.map((option) => (
              <Select.Item key={option.id} id={option.id}>
                {option.label}
              </Select.Item>
            ))}
          </Select>
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="mt-2 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-secondary"
            >
              몸무게로 정한 크기로 되돌리기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
