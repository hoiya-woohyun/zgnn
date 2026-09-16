import { CARRIER_LABELS } from '../lib/eligibility';
import { Label } from '../components/base/label';
import { cx } from '../utils/cx';
import type { TCarrier } from '../types';

const CARRIER_ORDER: TCarrier[] = ['none', 'bag', 'cage', 'stroller'];

type TDogProfileCarrierPickerProps = {
  value: TCarrier;
  onChange: (carrier: TCarrier) => void;
};

/**
 * 이동 수단 4택. 리뷰 §1 지적③ — "이동가방 있음" 한 칸으로 뭉치면 슬링백을 케이지로
 * 오해해 32곳이 잘못 가능으로 뜬다. 케이지·이동가방·유모차·없음을 구분해야 판정
 * (`eligibility.ts` 의 C2/C3/C4/H5)이 정확해진다 — 라벨·설명은 그 판정 문구와 짝을
 * 맞추기 위해 `CARRIER_LABELS` 에 함께 둔다.
 *
 * 세그먼트 버튼 그룹(`SeasonChips` 와 같은 어법) 대신 세로 목록 + 설명 한 줄을 쓴다.
 * 네 선택지 각각 설명이 필요해서 가로 칩엔 안 들어간다.
 */
export function DogProfileCarrierPicker({ value, onChange }: TDogProfileCarrierPickerProps) {
  return (
    <div role="radiogroup" aria-label="이동 수단">
      <Label>이동 수단</Label>
      <div className="mt-1.5 space-y-2">
        {CARRIER_ORDER.map((carrier) => {
          const selected = value === carrier;
          const { label, hint } = CARRIER_LABELS[carrier];
          return (
            <button
              key={carrier}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(carrier)}
              className={cx(
                'flex w-full min-h-11 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors',
                selected ? 'border-brand bg-brand-primary' : 'border-secondary bg-primary hover:bg-primary_hover',
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'grid size-5 shrink-0 place-items-center rounded-full border-2',
                  selected ? 'border-brand-solid' : 'border-secondary',
                )}
              >
                {selected && <span className="size-2.5 rounded-full bg-brand-solid" />}
              </span>
              <span>
                <span className={cx('block text-sm font-semibold', selected ? 'text-brand-secondary' : 'text-primary')}>
                  {label}
                </span>
                <span className="block text-xs text-tertiary">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
