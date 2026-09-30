import { XClose } from '@untitledui/icons';
import { FilterChip } from '../components/filterChip';

export type TActiveChip = {
  key: string;
  label: string;
  /** 이 조건 하나만 끈다. */
  onRemove: () => void;
};

/**
 * 결과 머리 아래의 "켜진 조건" 줄 — `애월읍 ✕` · `동쪽 ✕` · `"검색어" ✕`.
 *
 * 읍면은 스토어에 남아(퍼시스트) 홈 칩 한 번에 조용히 걸리고 다음 방문에도 남는데, 모바일에선
 * 조건 판이 시트 안에 접혀 있어 "카페 1곳" 의 이유가 버튼의 숫자 하나뿐이었다(D4). 켜진 것을
 * 목록 바로 위에 이름으로 보이고, ✕ 로 그것만 끄게 한다. 켜진 게 없으면 줄 자체를 그리지 않는다.
 *
 * 모양은 조건 판(`placesPageFilters`)의 켜진 칩과 같은 `FilterChip` 이다. 누르면 켜고 끄는 게 아니라
 * 사라지는 칩이라 `toggle={false}` — 켜진 모양만 빌리고 `aria-pressed` 는 달지 않는다.
 */
export function PlacesPageActiveChips({ chips }: { chips: TActiveChip[] }) {
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2 px-4 pt-2 md:px-6" aria-label="켜진 조건">
      {chips.map((chip) => (
        <li key={chip.key}>
          <FilterChip
            pressed
            toggle={false}
            iconTrailing={XClose}
            aria-label={`${chip.label} 조건 끄기`}
            onClick={chip.onRemove}
          >
            {chip.label}
          </FilterChip>
        </li>
      ))}
    </ul>
  );
}
