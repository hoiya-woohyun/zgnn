import { describe, expect, it } from 'vitest';
import { headlineFor, isOutdoorSeatOnly, judgeEligibility } from './eligibility';
import { mapPageCanvasMarkerLabel } from './mapPageCanvasMarkerLabel';
import { PLACES, TYPE_META } from './places';
import { PROFILES } from './placesVerdictView';

describe('mapPageCanvasMarkerLabel — 마커가 읽는 판정은 목록 배지와 같은 문장이다(14 W261013.3)', () => {
  it('강아지가 없으면 이름과 종류만', () => {
    expect(mapPageCanvasMarkerLabel({ name: '무히어', type: 'cafe' })).toBe(`무히어, ${TYPE_META.cafe.label}`);
  });

  const judged = PLACES.flatMap((place) =>
    PROFILES.map(({ dog }) => ({ place, eligibility: judgeEligibility(dog, place.policy) })),
  );

  it('실제 장소 × 강아지 다섯 — 마커 이름의 판정 칸이 목록 배지(`headlineFor`)와 같다', () => {
    for (const { place, eligibility } of judged) {
      expect(mapPageCanvasMarkerLabel(place, eligibility).split(', ').at(-1)).toBe(headlineFor(eligibility));
    }
  });

  // 레벨 이름과 머리글이 갈리는 두 갈래가 데이터에 실제로 있어야 위 비교가 뜻이 있다.
  it('야외 자리만 되는 곳은 "확인이 필요해요" 가 아니라 "야외 자리에서 갈 수 있어요" 로 읽는다', () => {
    const outdoor = judged.filter(({ eligibility }) => isOutdoorSeatOnly(eligibility));
    expect(outdoor.length).toBeGreaterThan(0);
    for (const { place, eligibility } of outdoor) {
      expect(mapPageCanvasMarkerLabel(place, eligibility)).toMatch(/, 야외 자리에서 갈 수 있어요$/);
    }
  });

  it('정보가 없는 곳은 목록처럼 "확인된 정보가 없어요" 로 읽는다', () => {
    const unknown = judged.filter(({ eligibility }) => eligibility.level === 'unknown');
    expect(unknown.length).toBeGreaterThan(0);
    for (const { place, eligibility } of unknown) {
      expect(mapPageCanvasMarkerLabel(place, eligibility)).toMatch(/, 확인된 정보가 없어요$/);
    }
  });
});
