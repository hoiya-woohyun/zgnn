/**
 * 6권역 — 홈 「두부랑 갈 동네」 카드가 세는 묶음(19 T1). 순수.
 *
 * 장소는 읍면 태그(`region.town`, 13) 하나만 갖는다. 그래서 **셈은 읍면 → 권역**이고, 관광지 칩을 어느 카드에 둘지는
 * **관광지 키(`LANDMARKS_BY_AREA`, 13) → 권역**이다. 매핑이 둘이라 서로 맞아야 한다 — 같은 이름(애월 ↔ 애월읍)이 다른 권역으로
 * 가면 카드의 수와 그 밑 칩이 다른 동네를 말한다(테스트가 잡는다). 읍면이 매핑에서 빠지면 그 곳이 6권역 어디에도 안 세여
 * 조용히 사라진다 — 그래서 `areaOf` 는 모르는 읍면에 null 을 돌려주고, 테스트가 "6권역 합 = 전체" 로 묶는다.
 *
 * 셈은 홈 히어로와 같은 함수(`countByLevel`)다 — 따로 세면 "홈은 12곳, 눌렀더니 11곳" 이 생긴다.
 */

import { countByLevel, type TLevelCounts } from './eligibilityCounts';
import type { LANDMARKS_BY_AREA } from './landmarks';
import type { TPetPolicy } from './petPolicy';
import type { TDogProfile, TPlaceType } from '../types';

/** 지금 앱이 다루는 여행지(지역) 하나 — 홈 동네 섹션 머리가 적는다. 지역이 늘면 `DESTS` 표의 첫 칸이 될 자리(19 §7.2). 화면에 '제주' 를 직접 적지 않는다. */
export const DEST = { id: 'jeju', label: '제주' } as const;

export type TAreaId = 'west' | 'southwest' | 'south' | 'southeast' | 'east' | 'north';

/** 서쪽부터 시계 방향 — 관광지 키·수집 키워드와 같은 순서다. 이름은 임시안(19 T4 에서 "서부(애월·협재)" 처럼 정한다). */
export const AREAS: readonly { id: TAreaId; label: string }[] = [
  { id: 'west', label: '서부' },
  { id: 'southwest', label: '서남' },
  { id: 'south', label: '남부' },
  { id: 'southeast', label: '동남' },
  { id: 'east', label: '동부' },
  { id: 'north', label: '북부' },
];

/** 권역 이름 — "북부". 보이는 지역 말은 이 하나다(필터 칩·상세 머리·홈 카드, 14 W261027.4). */
export const areaLabel = (id: TAreaId): string => AREAS.find((area) => area.id === id)?.label ?? id;

/** 읍면 → 권역. 셈이 쓴다. 키는 데이터의 `region.town` 표기 그대로다. */
export const TOWN_TO_AREA: Readonly<Record<string, TAreaId>> = {
  애월읍: 'west',
  한림읍: 'west',
  한경면: 'west',
  대정읍: 'southwest',
  안덕면: 'southwest',
  서귀포시: 'south',
  남원읍: 'south',
  표선면: 'southeast',
  성산읍: 'southeast',
  구좌읍: 'east',
  우도면: 'east',
  조천읍: 'north',
  제주시: 'north',
};

/**
 * 관광지 키 → 권역. 칩 배치가 쓴다. `Record<keyof …>` 라 `LANDMARKS_BY_AREA` 에 키가 늘면 여기서 타입 에러가 난다.
 * 중문은 읍면이 아니라 서귀포시의 동이라 남부다(ADR-022). 우도는 관광지 키가 없다.
 */
export const LANDMARK_KEY_TO_AREA: Readonly<Record<keyof typeof LANDMARKS_BY_AREA, TAreaId>> = {
  애월: 'west',
  한림: 'west',
  한경: 'west',
  대정: 'southwest',
  안덕: 'southwest',
  중문: 'south',
  서귀포: 'south',
  남원: 'south',
  표선: 'southeast',
  성산: 'southeast',
  구좌: 'east',
  조천: 'north',
  제주시: 'north',
};

/**
 * 권역 목록에 적는 읍면 이름 — 읍·면 꼬리를 뗀다. 시내(동 지역) 태그는 시 이름 그대로라(`제주시`·`서귀포시`) '제주 시내' 로 부른다 —
 * "북부(조천·제주시)" 는 시 전체로 읽혀 애월·성산까지 그 권역에 든 것처럼 읽혔다(14 W261010.30b). 읍면 필터 칩의 `townFilterLabel`
 * ('제주시 시내')과 같은 축인데, 여기는 꼬리를 뗀 짧은 이름들 사이라 '시' 도 뗀다. 필터 시트의 읍면 칸(3열, 22 D-7)도 이 이름이다 — 320px 칸에 '서귀포시 시내' 가 안 든다.
 */
export const areaTownName = (town: string): string =>
  town.endsWith('시') ? `${town.slice(0, -1)} 시내` : town.replace(/(읍|면)$/, '');

/** 권역의 읍면 — "애월·한림·한경". 매핑에서 읽는다(손으로 적으면 매핑과 갈린다). 홈 동네 카드가 권역 이름 밑에 쓴다. */
export const areaTownNames = (id: TAreaId): string =>
  Object.entries(TOWN_TO_AREA)
    .filter(([, area]) => area === id)
    .map(([town]) => areaTownName(town))
    .join('·');

/** 권역 이름 + 읍면 — "서부(애월·한림·한경)". 둘러보기 칩·0곳 안내와 `pnpm data coverage` 가 쓴다. */
export const areaTownsLabel = (id: TAreaId): string =>
  `${areaLabel(id)}(${areaTownNames(id)})`;

/** 장소의 권역. 매핑에 없는 읍면이면 null — 셈에서 빠진다(테스트가 그런 읍면이 없음을 지킨다). */
export const areaOf = (place: { region: { town: string } }): TAreaId | null => TOWN_TO_AREA[place.region.town] ?? null;

export type TAreaCounts = Record<TAreaId, Record<TPlaceType, TLevelCounts>>;

/**
 * 권역 × 종류의 판정 레벨 수. 칸마다 `countByLevel` 을 부른다 — "갈 수 있는 곳" 은 히어로와 같이 `ok + outdoor` 다.
 * 받은 곳만 센다(종류·권역이 빈 칸은 전부 0). 권역을 모르는 곳은 어느 칸에도 안 들어간다.
 */
export const countByArea = (
  places: readonly { type: TPlaceType; region: { town: string }; policy: TPetPolicy }[],
  dog: TDogProfile,
  opts: { needsIndoor?: boolean } = {},
): TAreaCounts => {
  const grouped = new Map<string, { policy: TPetPolicy }[]>();
  for (const place of places) {
    const area = areaOf(place);
    if (!area) continue;
    const key = `${area}/${place.type}`;
    grouped.set(key, [...(grouped.get(key) ?? []), place]);
  }
  const counts = {} as TAreaCounts;
  for (const { id } of AREAS) {
    counts[id] = {
      stay: countByLevel(grouped.get(`${id}/stay`) ?? [], dog, opts),
      restaurant: countByLevel(grouped.get(`${id}/restaurant`) ?? [], dog, opts),
      cafe: countByLevel(grouped.get(`${id}/cafe`) ?? [], dog, opts),
    };
  }
  return counts;
};
