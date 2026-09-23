import { describe, expect, it } from 'vitest';
import { mergeIntoExisting, toNewPlaceRow, toRecheckCandidate } from './applyApproved.mjs';

// places 행(snake_case) — 시드된 86곳 중 하나의 모양. 사람이 쓴 features·pet_policy_text 가 들어 있다.
const solsup = {
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
  status: 'published',
  source: 'notion',
};

// candidates.extracted jsonb — { ...TExtractedPlace, geo, naverLink, regionRaw, match }
const extracted = {
  name: '솔숲펜션',
  type: 'stay',
  regionRaw: '동쪽 (구좌읍)',
  address: '제주 제주시 구좌읍 충렬로 141-15',
  petPolicyText: '소형견만 실내 가능, 대형견은 테라스',
  features: '마당이 넓고 불멍이 됩니다',
  isJeju: true,
  evidence: ['마당에서 불멍을 했어요'],
  confidence: 0.9,
  geo: { lat: 33.5111, lng: 126.8488 },
  naverLink: 'https://map.naver.com/p/entry/place/123',
  match: { confidence: 1, reason: 'naverPlaceId 일치', tier: 'auto' },
};

describe('mergeIntoExisting', () => {
  it('사람이 쓴 features·pet_policy_text 가 있으면 절대 덮지 않는다 — 다 차 있으면 null', () => {
    expect(mergeIntoExisting(solsup, extracted)).toBeNull();
  });

  it('features 가 비어 있을 때만 채우고, pet_policy_text 가 차 있으면 그대로 둔다', () => {
    const patch = mergeIntoExisting({ ...solsup, features: '' }, extracted);
    expect(patch).toEqual({ features: '마당이 넓고 불멍이 됩니다' });
  });

  it('pet_policy_text 가 null 이어도 빈 칸으로 본다', () => {
    const patch = mergeIntoExisting({ ...solsup, pet_policy_text: null }, extracted);
    expect(patch).toEqual({ pet_policy_text: '소형견만 실내 가능, 대형견은 테라스' });
  });

  it('공백뿐인 칸도 빈 칸이다', () => {
    const patch = mergeIntoExisting({ ...solsup, features: '  \n ' }, extracted);
    expect(patch).toEqual({ features: '마당이 넓고 불멍이 됩니다' });
  });

  it('address 가 비어 있으면 채운다', () => {
    const patch = mergeIntoExisting({ ...solsup, address: null }, extracted);
    expect(patch).toEqual({ address: '제주 제주시 구좌읍 충렬로 141-15' });
  });

  it('lat·lng 가 둘 다 없을 때만 geo 로 쌍으로 채운다', () => {
    const patch = mergeIntoExisting({ ...solsup, lat: null, lng: null }, extracted);
    expect(patch).toEqual({ lat: 33.5111, lng: 126.8488 });
  });

  it('lat 만 있고 lng 가 없는 반쪽 행은 건드리지 않는다 — 어느 쪽이 맞는지 코드가 모른다', () => {
    expect(mergeIntoExisting({ ...solsup, lng: null }, extracted)).toBeNull();
  });

  it('extracted.geo 가 null 이면 좌표를 채우지 않는다', () => {
    expect(mergeIntoExisting({ ...solsup, lat: null, lng: null }, { ...extracted, geo: null })).toBeNull();
  });

  it('extracted.geo 가 반쪽이면 좌표를 채우지 않는다', () => {
    expect(mergeIntoExisting({ ...solsup, lat: null, lng: null }, { ...extracted, geo: { lat: 33.5 } })).toBeNull();
  });

  it("region_raw 가 '' 일 때만 regionRaw 로 채운다", () => {
    expect(mergeIntoExisting({ ...solsup, region_raw: '' }, extracted)).toEqual({ region_raw: '동쪽 (구좌읍)' });
    expect(mergeIntoExisting({ ...solsup, region_raw: '서쪽 (한림읍)' }, extracted)).toBeNull();
  });

  it("extracted 값이 null · '' 이면 빈 칸이어도 채우지 않는다(지어내지 않는다)", () => {
    const empty = { ...extracted, address: null, regionRaw: '', features: null, petPolicyText: '  ' };
    const blankRow = { ...solsup, address: null, region_raw: '', features: '', pet_policy_text: '' };
    expect(mergeIntoExisting(blankRow, empty)).toBeNull();
  });

  it('naver_url 은 비어 있어도 건드리지 않는다 — 지역 검색의 link(naverLink)를 naver_url 에 넣지 않는다 — 네이버 플레이스가 아닐 수 있다', () => {
    expect(mergeIntoExisting({ ...solsup, naver_url: null }, extracted)).toBeNull();
  });

  it('category 는 extracted 에 있을 때만 채운다 — 없으면(TExtractedPlace 기본 모양) 빈 칸이어도 그대로', () => {
    expect(mergeIntoExisting({ ...solsup, category: null }, extracted)).toBeNull();
    expect(mergeIntoExisting({ ...solsup, category: '' }, { ...extracted, category: '커피전문점' })).toEqual({ category: '커피전문점' });
    expect(mergeIntoExisting(solsup, { ...extracted, category: '커피전문점' })).toBeNull();
  });

  it('빈 칸이 여럿이면 한 patch 에 모두 담고, 채운 값은 양끝 공백을 지운다', () => {
    const blankRow = { ...solsup, address: '', lat: null, lng: null, features: null, pet_policy_text: '' };
    const patch = mergeIntoExisting(blankRow, { ...extracted, features: '  마당이 넓어요  ' });
    expect(patch).toEqual({
      address: '제주 제주시 구좌읍 충렬로 141-15',
      lat: 33.5111,
      lng: 126.8488,
      features: '마당이 넓어요',
      pet_policy_text: '소형견만 실내 가능, 대형견은 테라스',
    });
  });
});

describe('toNewPlaceRow', () => {
  const candidate = {
    id: 'c1',
    post_url: 'https://blog.naver.com/dogjeju/223456789',
    extracted: { ...extracted, name: '새로운카페', type: 'cafe', match: { confidence: 0.1, reason: '없음', tier: 'new' } },
    match_place_id: null,
    status: 'approved',
  };

  it('extracted 로 places 행을 만든다 — draft · blog · sort null · review_url 은 글 링크', () => {
    expect(toNewPlaceRow(candidate, { id: 'new-id' })).toEqual({
      id: 'new-id',
      type: 'cafe',
      name: '새로운카페',
      region_raw: '동쪽 (구좌읍)',
      features: '마당이 넓고 불멍이 됩니다',
      pet_policy_text: '소형견만 실내 가능, 대형견은 테라스',
      review_url: 'https://blog.naver.com/dogjeju/223456789',
      naver_url: null,
      naver_place_id: null,
      lat: 33.5111,
      lng: 126.8488,
      address: '제주 제주시 구좌읍 충렬로 141-15',
      category: null,
      stay_price_text: null,
      stay_amenities_text: null,
      sort: null,
      status: 'draft',
      source: 'blog',
    });
  });

  it("null 인 문장 칸은 '' 로(NOT NULL 제약), geo 없으면 lat·lng null", () => {
    const row = toNewPlaceRow(
      { ...candidate, extracted: { ...candidate.extracted, regionRaw: null, features: null, petPolicyText: null, address: null, geo: null } },
      { id: 'new-id' },
    );
    expect(row.region_raw).toBe('');
    expect(row.features).toBe('');
    expect(row.pet_policy_text).toBe('');
    expect(row.address).toBeNull();
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
  });

  it('category 는 extracted 에 있으면 싣고, 없으면 null', () => {
    expect(toNewPlaceRow(candidate, { id: 'new-id' }).category).toBeNull();
    expect(toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, category: '커피전문점' } }, { id: 'new-id' }).category).toBe('커피전문점');
  });

  it('post_url 이 없으면 review_url 도 null', () => {
    expect(toNewPlaceRow({ ...candidate, post_url: null }, { id: 'new-id' }).review_url).toBeNull();
  });

  it("type 'other' 는 신규 장소가 될 수 없다", () => {
    expect(() => toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, type: 'other' } }, { id: 'x' })).toThrow(/other/);
  });

  it('places.type 에 없는 값도 막는다', () => {
    expect(() => toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, type: 'bar' } }, { id: 'x' })).toThrow(/bar/);
  });

  it('name 이 비어 있으면 막는다', () => {
    expect(() => toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, name: '  ' } }, { id: 'x' })).toThrow(/name/);
  });

  it('naverLink · evidence · match 는 행에 들어가지 않는다', () => {
    const row = toNewPlaceRow(candidate, { id: 'new-id' });
    expect(row).not.toHaveProperty('naverLink');
    expect(row).not.toHaveProperty('evidence');
    expect(row).not.toHaveProperty('match');
  });
});

describe('toRecheckCandidate — 승인된 후보를 반영 시점에 다시 대조할 입력', () => {
  it('extracted 의 geo·address·regionRaw 를 matchPlace 입력으로, 없는 값은 undefined', () => {
    const c = { extracted: { name: '살레', type: 'cafe', geo: { lat: 33.5, lng: 126.9 }, address: '제주 제주시 우도면 1', regionRaw: '우도' } };
    expect(toRecheckCandidate(c)).toEqual({ name: '살레', type: 'cafe', geo: { lat: 33.5, lng: 126.9 }, address: '제주 제주시 우도면 1', regionRaw: '우도' });
    expect(toRecheckCandidate({ extracted: { name: 'x', type: 'cafe', geo: null, address: '', regionRaw: null } })).toEqual({
      name: 'x', type: 'cafe', geo: undefined, address: undefined, regionRaw: undefined,
    });
  });
});
