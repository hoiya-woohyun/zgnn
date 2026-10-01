import { describe, expect, it } from 'vitest';
import { fromPlaceRow, toPlace } from './placeFields.mjs';

/** places 테이블 행(snake_case) — 시드된 86곳 중 하나. */
const row = {
  id: '278ddc10-ceae-81e3-a299-fd3f2515be4f',
  type: 'stay',
  name: '솔숲펜션',
  region_raw: '동쪽 (구좌읍)',
  features: '세화 해수욕장에서 차로 5분 거리에 위치한 곳이에요.',
  pet_policy_text: '1~5kg 1만원.\n6~10kg 1.5만원.',
  review_url: 'https://blog.naver.com/sorkekajrdj777/223444269811',
  naver_url: 'https://naver.me/xIgKjUqT',
  naver_place_id: '1118214877',
  lat: 33.5111848,
  lng: 126.8488419,
  address: '제주 제주시 구좌읍 충렬로 141-15 솔숲펜션',
  category: '펜션',
  stay_price_text: '59,000원 ~ 79,000원',
  stay_amenities_text: '강아지 계단, 식기, 배변 패드',
  sort: 0,
  status: 'published',
  source: 'notion',
  created_at: '2026-09-20T00:00:00Z',
  updated_at: '2026-09-20T00:00:00Z',
};

describe('fromPlaceRow', () => {
  it('snake_case 행을 toPlace 와 같은 TPlace 로 — matchPlace 가 보는 geo·region.town·naverPlaceId 가 살아 있다', () => {
    const place = fromPlaceRow(row);
    expect(place.geo).toEqual({ lat: 33.5111848, lng: 126.8488419 });
    expect(place.region).toEqual({ direction: 'east', town: '구좌읍', detail: undefined, raw: '동쪽 (구좌읍)' });
    expect(place.naverPlaceId).toBe('1118214877');
    expect(place.stay).toEqual({ price: { text: '59,000원 ~ 79,000원', min: 59000, max: 79000, note: undefined }, amenitiesText: '강아지 계단, 식기, 배변 패드' });
    expect(place.images).toEqual([]);
  });
  it('DB 메타 컬럼(status·source·sort·created_at)은 TPlace 에 새지 않는다', () => {
    const place = fromPlaceRow(row);
    for (const key of ['status', 'source', 'sort', 'created_at', 'updated_at']) expect(place).not.toHaveProperty(key);
  });
  it('좌표 한쪽이 null 이면 geo 자체가 없다(toPlace 규칙 그대로)', () => {
    expect(fromPlaceRow({ ...row, lat: null }).geo).toBeUndefined();
    expect(fromPlaceRow({ ...row, lng: null }).geo).toBeUndefined();
  });
  it('draft 신규 행(blog 출처, 빈 칸 많음)도 TPlace 가 된다', () => {
    const draft = { ...row, id: 'x', type: 'cafe', name: '새카페', region_raw: '', features: '', pet_policy_text: '', review_url: 'https://blog.naver.com/a/1', naver_url: null, naver_place_id: null, lat: null, lng: null, address: null, category: null, stay_price_text: null, stay_amenities_text: null, status: 'draft', source: 'blog' };
    const place = fromPlaceRow(draft);
    expect(place).toEqual(toPlace({ id: 'x', type: 'cafe', name: '새카페', regionRaw: '', features: '', petPolicyText: '', reviewUrl: 'https://blog.naver.com/a/1', naverUrl: null, naverPlaceId: null, lat: null, lng: null, address: null, category: null, stayPriceText: null, stayAmenitiesText: null }));
    expect(place.region.direction).toBe('unknown');
    expect(place.stay).toBeUndefined();
  });
});

describe('petPolicy(AI 구조화 판단) 통과', () => {
  it('없으면 키가 빠져(시드 JSON 바이트 불변) 있으면 petPolicyText 다음 자리에 실린다', () => {
    const base = { id: 'x', type: 'cafe', name: 'n', regionRaw: '동쪽 (구좌읍)', features: '', petPolicyText: '' };
    // 없는 값은 undefined 라 JSON.stringify 가 떨어뜨린다(toPlace 의 규칙) — 직렬화 뒤의 키를 본다
    expect(Object.keys(JSON.parse(JSON.stringify(toPlace(base))))).not.toContain('petPolicy');
    const facts = { indoor: 'free', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: null, feeText: null, weightLimitKg: null, maxDogs: null, notes: null };
    const keys = Object.keys(toPlace({ ...base, petPolicy: facts }));
    expect(keys.indexOf('petPolicy')).toBe(keys.indexOf('petPolicyText') + 1);
    expect(fromPlaceRow({ id: 'x', type: 'cafe', name: 'n', region_raw: '동쪽 (구좌읍)', features: '', pet_policy_text: 't', pet_policy: facts }).petPolicy).toEqual(facts);
  });
});

describe('fromPlaceRow — 홈페이지 카드 (ADR-002 v2)', () => {
  const base = { id: 'x', type: 'cafe', name: 'n', region_raw: '동쪽 (구좌읍)', features: '', pet_policy_text: '' };

  it('주소가 있으면 카드, 빈 칸은 키를 떨군다', () => {
    expect(fromPlaceRow({ ...base, homepage_url: 'https://a.kr/', homepage_name: null, homepage_image: 'https://a.kr/a.jpg' }).homepage).toEqual({
      url: 'https://a.kr/',
      name: undefined,
      image: 'https://a.kr/a.jpg',
    });
  });

  it('주소가 없으면(시드 · 마이그레이션 전) 카드도 없다 — places.json 바이트가 그대로다', () => {
    expect(fromPlaceRow(base)).not.toHaveProperty('homepage', expect.anything());
    expect(JSON.stringify(fromPlaceRow({ ...base, homepage_url: null, homepage_image: 'https://a.kr/a.jpg' }))).not.toContain('homepage');
  });
});

describe('verifiedAt', () => {
  it('확인 시각을 한국 날짜로 싣고, 없으면 키가 빠진다', async () => {
    const { kstDay } = await import('./placeFields.mjs');
    expect(kstDay('2026-10-01T16:00:00Z')).toBe('2026-10-02');
    expect(kstDay('nope')).toBeUndefined();
    expect(fromPlaceRow({ ...row, verified_at: '2026-10-01T01:00:00+00:00' }).verifiedAt).toBe('2026-10-01');
    expect('verifiedAt' in JSON.parse(JSON.stringify(fromPlaceRow({ ...row, verified_at: null })))).toBe(false);
  });
});
