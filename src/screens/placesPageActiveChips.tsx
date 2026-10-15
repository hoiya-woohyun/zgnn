import { XClose } from '@untitledui/icons';
import { FilterChip } from '../components/filterChip';
import { cx } from '../utils/cx';

export type TActiveChip = {
  key: string;
  label: string;
  /** 이 조건 하나만 끈다. */
  onRemove: () => void;
};

/**
 * lg 부터 이 줄에서만 보이는 칩 — 권역은 홈 동네 카드만 걸고 머리에 고르는 자리가 없다(19 T3).
 * 나머지는 lg 머리에 같은 말이 이미 있다: 읍면·방향·조건·판정은 줄바꿈한 판에 눌린 채, 검색어는 검색창, 정렬은 셀렉트.
 */
const ONLY_IN_THIS_ROW = new Set(['area']);

/**
 * 결과 머리 아래의 "켜진 조건" 줄 — `애월읍 ✕` · `동쪽 ✕` · `"검색어" ✕`.
 *
 * 읍면은 스토어에 남아(퍼시스트) 홈 칩 한 번에 조용히 걸리고 다음 방문에도 남는데, 모바일에선
 * 조건 판이 시트 안에 접혀 있어 "카페 1곳" 의 이유가 버튼의 숫자 하나뿐이었다(D4). 켜진 것을
 * 목록 바로 위에 이름으로 보이고, ✕ 로 그것만 끄게 한다. 켜진 게 없으면 줄 자체를 그리지 않는다.
 *
 * lg 부터는 판에 없는 칩(`ONLY_IN_THIS_ROW`)만 남긴다(14 W261013.10b) — D4 의 까닭(판이 접혀 있다)이 거기선 없고,
 * 같은 말을 한 줄 더 세운 것이 1280×800 에서 0곳 안내의 버튼을 접힘 아래로 밀었다. md 는 판의 칩 줄이 가로 스크롤이라
 * 눌린 칩이 화면 밖에 있을 수 있어 그대로 둔다.
 *
 * 모양은 조건 판(`placesPageFilters`)의 켜진 칩과 같은 `FilterChip` 이다. 누르면 켜고 끄는 게 아니라
 * 사라지는 칩이라 `toggle={false}` — 켜진 모양만 빌리고 `aria-pressed` 는 달지 않는다.
 */
export function PlacesPageActiveChips({ chips }: { chips: TActiveChip[] }) {
  if (chips.length === 0) return null;
  const rowAtLg = chips.some((chip) => ONLY_IN_THIS_ROW.has(chip.key));

  return (
    <ul className={cx('flex flex-wrap gap-2 px-4 pt-2 md:px-6', !rowAtLg && 'lg:hidden')} aria-label="켜진 조건">
      {chips.map((chip) => (
        <li key={chip.key} className={ONLY_IN_THIS_ROW.has(chip.key) ? undefined : 'lg:hidden'}>
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
