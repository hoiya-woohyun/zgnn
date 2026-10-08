/**
 * 6권역 데이터 문턱 — `pnpm data coverage` 가 찍고, 나중에 '{이름}랑 가기 좋은 곳' 라벨(19 T6)이 볼 판정. 순수.
 *
 * 문턱은 **원형 셋**(토론 2026-10-08 §1)의 칸 수로 잰다 — 사용자 강아지가 아니라 고정된 셋이라 주마다 숫자를 견줄 수 있다.
 * "갈 수 있는 곳" 은 카드·히어로와 같은 `ok + outdoor` 다(19 §1). 다만 토론의 기준선(소형 6 · 다견 4)은 야외를 뺀 `ok` 로
 * 센 값이라, 같은 칸을 `ok` 만으로도 함께 센다 — 기준선과 견줄 길을 남기려는 것이지 문턱이 둘인 것은 아니다.
 */

import type { TAreaCounts } from './areaGroups';
import type { TLevelCounts } from './eligibilityCounts';
import type { TDogProfile, TPlaceType } from '../types';

export type TCoverageDogId = 'small' | 'big' | 'multi';

/** 토론 §1 의 세 원형. 순서가 출력 순서다. */
export const COVERAGE_DOGS: readonly { id: TCoverageDogId; label: string; dog: TDogProfile }[] = [
  { id: 'small', label: '두부 3kg · 가방', dog: { dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' } },
  { id: 'big', label: '보리 30kg · 이동 수단 없음', dog: { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' } },
  {
    id: 'multi',
    label: '콩 2.5kg + 해피 12kg · 유모차',
    dog: {
      dogs: [
        { name: '콩', weightKg: 2.5 },
        { name: '해피', weightKg: 12 },
      ],
      carrier: 'stroller',
    },
  },
];

/** 갈 수 있는 곳 — 히어로·카드와 같은 셈. */
export const reachOf = (counts: TLevelCounts): number => counts.ok + counts.outdoor;

/** 문턱을 재는 칸 — 숙소·카페만(식당은 카드 머리 숫자에 넣지 않는다, 19 §1). 6권역 × 2 = 12칸. */
const GATE_TYPES: readonly TPlaceType[] = ['stay', 'cafe'];

/** §4 의 목표. 날짜·목표를 바꾸면 19 §4 표도 같이 고친다. */
export const COVERAGE_GOALS = { smallCells: 10, multiCells: 8, bigStayAreas: 4, bigEmptyMax: 2, cellMin: 3, bigStayMin: 2 } as const;

const cells = (counts: TAreaCounts) => Object.values(counts).flatMap((byType) => GATE_TYPES.map((type) => byType[type]));

export type TCoverageGates = {
  /** 소형견 숙소·카페 12칸 중 갈 수 있는 곳 ≥3 인 칸. `okOnly` 는 야외를 뺀 같은 셈(토론 기준선과 견줄 때). */
  small: { cells: number; okOnly: number };
  multi: { cells: number; okOnly: number };
  /** 대형견 숙소 ≥2곳 권역 수(6 중). */
  bigStayAreas: number;
  /** 대형견 숙소·카페 12칸 중 0곳 칸 — `bigEmptyMax` 이하가 되기 전엔 라벨 없이 숫자만. */
  bigEmptyCells: number;
};

export const coverageGates = (byDog: Record<TCoverageDogId, TAreaCounts>): TCoverageGates => {
  const passing = (counts: TAreaCounts) => ({
    cells: cells(counts).filter((c) => reachOf(c) >= COVERAGE_GOALS.cellMin).length,
    okOnly: cells(counts).filter((c) => c.ok >= COVERAGE_GOALS.cellMin).length,
  });
  return {
    small: passing(byDog.small),
    multi: passing(byDog.multi),
    bigStayAreas: Object.values(byDog.big).filter((byType) => reachOf(byType.stay) >= COVERAGE_GOALS.bigStayMin).length,
    bigEmptyCells: cells(byDog.big).filter((c) => reachOf(c) === 0).length,
  };
};
