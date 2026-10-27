import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { judgeEligibility } from '../lib/eligibility';
import { PLACES } from '../lib/places';
import { PlaceCard } from './placeCard';

// 서버 렌더는 스토어 초기값(강아지 없음)을 읽는다 — 판정 단어가 서는 행을 그리려고 판정 훅만 '두부 5kg' 으로 바꾼다.
vi.mock('../store/useDogEligibility', () => ({
  useEligibility: (place: (typeof PLACES)[number]) =>
    judgeEligibility({ dogs: [{ name: '두부', weightKg: 5 }], carrier: 'none' }, place.policy, { needsIndoor: false }),
  useDogMaxWeightKg: () => 5,
  useDogCount: () => 1,
}));
// 하트(`SaveButton`)가 주소를 읽는다 — 앱 라우터 밖이라 null 이 온다.
vi.mock('next/navigation', () => ({ usePathname: () => '/places/stay/' }));

const BOLD_CLASS = /class="[^"]*(?<![\w-])font-(?:semibold|bold)(?![\w-])[^"]*"/g;

describe('PlaceCard', () => {
  it('굵은 자리는 행당 둘 — 이름 600 + 판정 단어 600, 숙소 가격은 400(ADR-006 v11 · 22 R27.11)', () => {
    const stays = PLACES.filter((place) => place.stay && place.stay.price.text !== '');
    expect(stays.length).toBeGreaterThan(0);
    for (const place of stays) {
      const html = renderToStaticMarkup(<PlaceCard place={place} />);
      expect(html, place.name).toContain(place.name);
      expect(html.match(BOLD_CLASS) ?? [], place.name).toHaveLength(2);
    }
  });
});
