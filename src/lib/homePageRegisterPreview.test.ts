import { describe, expect, it } from 'vitest';
import { homePageRegisterPreview, homePageRegisterPreviewText } from './homePageRegisterPreview';
import { countByLevel } from './eligibilityCounts';
import { placesOfType } from './places';

describe('홈 등록 카드 미리보기 (14 C2610.2)', () => {
  const stays = placesOfType('stay');

  it('시드 숙소에서 소형견과 대형견의 수가 갈린다', () => {
    const preview = homePageRegisterPreview(stays);
    expect(preview).not.toBeNull();
    const [small, large] = preview!.byWeight;
    expect(small.kg).toBe(7);
    expect(large.kg).toBe(25);
    expect(small.ok).toBeGreaterThan(large.ok);
    expect(preview!.total).toBe(stays.length);
  });

  it('등록 뒤 홈 종류 카드가 보여 줄 수와 같은 함수로 센다', () => {
    const preview = homePageRegisterPreview(stays)!;
    const dog = { dogs: [{ name: '두부', weightKg: 7 }], carrier: 'none' as const };
    expect(preview.byWeight[0].ok).toBe(countByLevel(stays, dog).ok);
  });

  it('두 수가 같거나 숙소가 없으면 그리지 않는다', () => {
    expect(homePageRegisterPreview([])).toBeNull();
    // 25kg 도 갈 수 있는 숙소만 모으면 두 수가 같다 — "아이마다 다르다" 를 말할 수 없다.
    const large = { dogs: [{ name: '대장', weightKg: 25 }], carrier: 'none' as const };
    const openToAll = stays.filter((s) => countByLevel([s], large).ok === 1);
    expect(openToAll.length).toBeGreaterThan(0);
    expect(homePageRegisterPreview(openToAll)).toBeNull();
  });

  it('문장', () => {
    expect(
      homePageRegisterPreviewText({ total: 26, byWeight: [{ kg: 7, ok: 18 }, { kg: 25, ok: 6 }] }),
    ).toBe('숙소 26곳 중 7kg 아이는 18곳, 25kg 아이는 6곳 갈 수 있어요');
  });
});
