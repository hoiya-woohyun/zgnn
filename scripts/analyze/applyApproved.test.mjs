import { describe, expect, it } from 'vitest';
import { homepageColumns, mergeIntoExisting, toNewPlaceRow, toRecheckCandidate } from './applyApproved.mjs';

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
      pet_policy: null,
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
      { ...candidate, extracted: { ...candidate.extracted, features: null, petPolicyText: null, address: null, geo: null } },
      { id: 'new-id' },
    );
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

describe('2026-09-28 설계 검토 — 지역 게이트 · 숙소 필드 · AI 구조화 판단 · review_url', () => {
  const candidate = {
    id: 'c2',
    post_url: 'https://blog.naver.com/dogjeju/223456790',
    extracted: { ...extracted, name: '새펜션', type: 'stay', match: { confidence: 0, reason: '없음', tier: 'new' } },
    match_place_id: null,
    status: 'approved',
  };
  const facts = { indoor: 'cage', leash: true, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: false, feeText: '1마리당 2만원', weightLimitKg: 10, maxDogs: 2, notes: null };

  it('regionRaw 가 없거나 형식이 아니면 신규 행을 만들지 않는다(permanent) — 사람이 채운 뒤 재승인', () => {
    for (const regionRaw of [null, '', '성산읍 어딘가']) {
      expect(() => toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, regionRaw } }, { id: 'x' })).toThrow(/regionRaw/);
    }
    expect(toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, regionRaw: '우도면' } }, { id: 'x' }).region_raw).toBe('우도면');
  });

  it('숙소면 stayPriceText·stayAmenitiesText 를 싣고, 숙소가 아니면 null', () => {
    const stay = toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, stayPriceText: '150,000원', stayAmenitiesText: '배변 패드, 식기' } }, { id: 'x' });
    expect(stay.stay_price_text).toBe('150,000원');
    expect(stay.stay_amenities_text).toBe('배변 패드, 식기');
    const cafe = toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, type: 'cafe', stayPriceText: '150,000원' } }, { id: 'x' });
    expect(cafe.stay_price_text).toBeNull();
  });

  it('pet_policy(AI 판단)는 원문이 있을 때만 싣는다', () => {
    expect(toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, petPolicy: facts } }, { id: 'x' }).pet_policy).toEqual(facts);
    expect(toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, petPolicy: facts, petPolicyText: null } }, { id: 'x' }).pet_policy).toBeNull();
  });

  it('보강 — pet_policy 는 pet_policy_text 를 채울 때만 함께, review_url·stay_* 는 빈 칸만', () => {
    const blank = { ...solsup, pet_policy_text: '', pet_policy: null, review_url: null, stay_price_text: null, stay_amenities_text: null, address: '있음', lat: 1, lng: 1, region_raw: '동쪽 (구좌읍)', features: '있음', category: '펜션' };
    const patch = mergeIntoExisting(blank, { ...extracted, petPolicy: facts, stayPriceText: '150,000원', stayAmenitiesText: '식기' }, { postUrl: 'https://blog.naver.com/x/1' });
    expect(patch).toEqual({
      pet_policy_text: '소형견만 실내 가능, 대형견은 테라스',
      pet_policy: facts,
      review_url: 'https://blog.naver.com/x/1',
      stay_price_text: '150,000원',
      stay_amenities_text: '식기',
    });
    // 사람이 쓴 원문이 있으면 다른 글의 판단(pet_policy)을 얹지 않는다
    expect(mergeIntoExisting({ ...blank, pet_policy_text: '1~5kg 1만원.' }, { ...extracted, petPolicy: facts }) ?? {}).not.toHaveProperty('pet_policy');
    // 숙소가 아니면 stay_* 를 건드리지 않는다
    expect(mergeIntoExisting({ ...blank, type: 'cafe' }, { ...extracted, stayPriceText: '150,000원' }) ?? {}).not.toHaveProperty('stay_price_text');
  });
});

describe('naverPlaceId — 사람이 검수 화면에서 넣은 플레이스 id (ADR-002 v2)', () => {
  const withId = { ...extracted, naverPlaceId: '1234567890' };
  const candidate = {
    id: 'c1',
    post_url: 'https://blog.naver.com/dogjeju/223456789',
    extracted: { ...withId, name: '새로운카페', type: 'cafe', match: { confidence: 0.1, reason: '없음', tier: 'new' } },
    match_place_id: null,
    status: 'approved',
  };

  it('신규 장소는 id 와 플레이스 홈 주소를 함께 얻는다', () => {
    const row = toNewPlaceRow(candidate, { id: 'new-id' });
    expect(row.naver_place_id).toBe('1234567890');
    expect(row.naver_url).toBe('https://m.place.naver.com/place/1234567890/home');
  });

  it('검색이 준 naverLink 만으로는 채우지 않는다 — 사람이 확인한 값이 아니다', () => {
    const row = toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, naverPlaceId: null } }, { id: 'new-id' });
    expect(row.naver_place_id).toBeNull();
    expect(row.naver_url).toBeNull();
  });

  it('숫자가 아닌 id 는 버린다(Studio 로 고친 값도 여기를 지난다)', () => {
    const row = toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, naverPlaceId: 'https://naver.me/x' } }, { id: 'new-id' });
    expect(row.naver_place_id).toBeNull();
  });

  it('병합은 빈 칸만 — 비어 있으면 id·주소를 채우고, 사람이 넣은 단축 링크는 덮지 않는다', () => {
    const empty = { ...solsup, naver_place_id: null, naver_url: null };
    expect(mergeIntoExisting(empty, withId)).toMatchObject({
      naver_place_id: '1234567890',
      naver_url: 'https://m.place.naver.com/place/1234567890/home',
    });
    const keepsUrl = mergeIntoExisting({ ...solsup, naver_place_id: null }, withId);
    expect(keepsUrl.naver_place_id).toBe('1234567890');
    expect(keepsUrl).not.toHaveProperty('naver_url');
    expect(mergeIntoExisting(solsup, withId)?.naver_place_id).toBeUndefined();
  });

  it('재대조 입력에 id 를 싣는다 — matchPlace 가 그것으로 1.0 짝을 낸다', () => {
    expect(toRecheckCandidate(candidate).naverPlaceId).toBe('1234567890');
  });
});

describe('homepage — 공식 홈페이지 링크 카드 (ADR-002 v2)', () => {
  const card = { url: 'https://www.solsup.com/', siteName: '솔숲펜션', image: 'https://www.solsup.com/a.jpg' };
  const cols = { homepage_url: 'https://www.solsup.com/', homepage_name: '솔숲펜션', homepage_image: 'https://www.solsup.com/a.jpg' };
  const candidate = {
    id: 'c1',
    post_url: 'https://blog.naver.com/dogjeju/1',
    extracted: { ...extracted, name: '새로운카페', type: 'cafe', homepage: card, match: { confidence: 0.1, reason: '없음', tier: 'new' } },
    match_place_id: null,
  };

  it('카드를 세 칸으로 — 주소가 http(s) 가 아니면 통째로 버리고, 사진은 https 만', () => {
    expect(homepageColumns({ homepage: card })).toEqual(cols);
    expect(homepageColumns({ homepage: { ...card, url: 'javascript:x' } })).toBeNull();
    expect(homepageColumns({ homepage: { ...card, image: 'http://x/a.jpg' } }).homepage_image).toBeNull();
    expect(homepageColumns({ homepage: null })).toBeNull();
    expect(homepageColumns({})).toBeNull();
  });

  it('신규 장소는 카드가 있을 때만 칸을 싣는다 — 없으면 키도 없다(마이그레이션 전후 같은 모양)', () => {
    expect(toNewPlaceRow(candidate, { id: 'n' })).toMatchObject(cols);
    const without = toNewPlaceRow({ ...candidate, extracted: { ...candidate.extracted, homepage: null } }, { id: 'n' });
    expect(without).not.toHaveProperty('homepage_url');
  });

  it('병합은 주소가 빈 곳에만 세 칸을 한 벌로 — 사람이 비운 사진이 되살아나지 않는다', () => {
    const empty = { ...solsup, homepage_url: null, homepage_name: null, homepage_image: null };
    expect(mergeIntoExisting(empty, { ...extracted, homepage: card })).toMatchObject(cols);
    const imageCleared = { ...solsup, homepage_url: 'https://www.solsup.com/', homepage_name: '솔숲펜션', homepage_image: null };
    expect(mergeIntoExisting(imageCleared, { ...extracted, homepage: card })?.homepage_image).toBeUndefined();
  });

  it('행에 칸이 없으면(마이그레이션 전) 건드리지 않는다', () => {
    expect(mergeIntoExisting(solsup, { ...extracted, homepage: card })?.homepage_url).toBeUndefined();
  });
});
