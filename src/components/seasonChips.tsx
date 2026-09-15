import { cx } from '../utils/cx';
import type { TSeasonFilter } from '../store/useAppStore';

const SEASON_CHIPS: { label: string; value: TSeasonFilter }[] = [
  { label: '사계절', value: null },
  { label: '여름', value: '여름' },
  { label: '겨울', value: '겨울' },
];

type TSeasonChipsProps = {
  value: TSeasonFilter;
  onSelect: (value: TSeasonFilter) => void;
  /** 그룹의 접근성 이름. 홈은 "계절 선택", 준비물은 "계절". */
  label: string;
  className?: string;
};

/**
 * 계절 선택 칩. 홈(고르면 준비물로 이동)과 준비물(목록 필터) 두 곳이 같은 선택을 보여준다 —
 * 같은 값을 다른 모양으로 그리면 사용자가 다른 설정이라고 오해하므로 한 컴포넌트로 묶는다.
 *
 * 탭이 아니라 세그먼트 컨트롤이다. 탭에는 짝이 되는 패널이 있어야 하는데 여기엔 없어서,
 * aria-pressed 로 눌림 상태만 말하는 버튼 그룹으로 만든다.
 * 활성은 브랜드 워시(연분홍 바탕 + 분홍 글씨), 비활성은 크림 칩 — 둘러보기의 종류 탭과 같은 어법이다.
 */
export function SeasonChips({ value, onSelect, label, className }: TSeasonChipsProps) {
  return (
    <div className={cx('flex gap-2', className)} role="group" aria-label={label}>
      {SEASON_CHIPS.map((chip) => {
        const active = value === chip.value;
        return (
          <button
            key={chip.label}
            type="button"
            onClick={() => onSelect(chip.value)}
            aria-pressed={active}
            className={cx(
              'h-10 rounded-full px-4 text-sm font-semibold transition-colors',
              active ? 'bg-brand-primary text-brand-secondary' : 'bg-tertiary text-secondary hover:bg-quaternary',
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
