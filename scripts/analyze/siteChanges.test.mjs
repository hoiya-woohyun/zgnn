import { describe, expect, it } from 'vitest';
import { fillColumns, petPolicyFactChanges, siteChanges } from './siteChanges.mjs';

const facts = (over = {}) => ({
  indoor: 'free',
  leash: true,
  largeDogOk: true,
  smallDogOnly: false,
  callFirst: false,
  feeFree: false,
  fees: [{ label: '1마리당 2만원', amountWon: 20000, basis: 'perDog', minKg: null, maxKg: null, fromDog: null, perNight: true }],
  weightLimitKg: null,
  maxDogs: 2,
  notes: null,
  ...over,
});

/** 게시된 숙소 한 곳(snake_case) — 칸이 다 차 있다. */
const row = {
  id: 'p1',
  type: 'stay',
  name: '솔숲펜션',
  region_raw: '동쪽 (구좌읍)',
  address: '제주 제주시 구좌읍 충렬로 141-15',
  lat: 33.5,
  lng: 126.8,
  features: '마당이 넓다',
  pet_policy_text: '1마리당 2만원, 2마리까지, 대형견 가능',
  pet_policy: facts(),
  category: '펜션',
  review_url: 'https://blog.naver.com/a/1',
  naver_place_id: null,
  naver_url: null,
  homepage_url: null,
  stay_price_text: '1박 15만원',
  stay_amenities_text: '바베큐',
  stay_environment: { standalone: true, yard: true, fencedYard: null, stairs: null },
  status: 'published',
};

/** 같은 가게를 쓴 다른 글 — 문장은 다르지만 사실은 같다. 주소 표기·좌표도 네이버라 조금 다르다. */
const same = {
  name: '솔숲 펜션',
  type: 'stay',
  regionRaw: '동쪽 (구좌읍)',
  address: '제주특별자치도 제주시 구좌읍 충렬로 141-15',
  geo: { lat: 33.5001, lng: 126.8002 },
  features: '불멍 하기 좋은 마당',
  petPolicyText: '강아지 한 마리당 2만원이고 두 마리까지 돼요. 대형견도 가능!',
  petPolicy: facts({ leash: false, notes: '사장님이 친절' }),
  category: '펜션,민박',
  stayPriceText: '1박에 15만원',
  stayAmenitiesText: '바베큐 그릴, 수영장',
  stayEnvironment: { standalone: true, yard: true, fencedYard: null, stairs: null },
};

describe('petPolicyFactChanges — 사실끼리 대 본다', () => {
  it('문장·notes 가 달라도 사실이 같으면 차이 없음 · 후보의 false(근거 없음)는 세지 않는다', () => {
    expect(petPolicyFactChanges(facts(), facts({ leash: false, notes: '다른 말' }))).toEqual([]);
  });
  it('대형견 가능 → 불가 · 마릿수 · 요금 인상은 차이다', () => {
    expect(petPolicyFactChanges(facts(), facts({ largeDogOk: false }))).toEqual(['largeDogOk']);
    expect(petPolicyFactChanges(facts(), facts({ maxDogs: 1 }))).toEqual(['maxDogs']);
    expect(petPolicyFactChanges(facts(), facts({ fees: [{ label: '1마리당 3만원', amountWon: 30000 }] }))).toEqual(['fees']);
  });
  it('후보가 모르는 칸(unknown · null)은 차이가 아니다', () => {
    expect(petPolicyFactChanges(facts(), facts({ indoor: 'unknown', largeDogOk: null, maxDogs: null, fees: [] }))).toEqual([]);
  });
  it('사이트 판단이 없으면(시드) 후보가 말한 것이 전부 차이다 · 후보 판단이 없으면 차이 없음', () => {
    expect(petPolicyFactChanges(null, facts()).length).toBeGreaterThan(0);
    expect(petPolicyFactChanges(facts(), null)).toEqual([]);
  });
  it('옛 모양(feeText)도 금액으로 본다', () => {
    expect(petPolicyFactChanges({ ...facts(), fees: undefined, feeText: '1마리당 2만원' }, facts())).toEqual([]);
  });
});

describe('siteChanges — 이름·주소·좌표·소개·카테고리 표기 차이는 갱신이 아니다', () => {
  it('같은 사실을 다른 문장으로 쓴 글은 차이 없음', () => {
    expect(siteChanges(row, same)).toEqual([]);
  });
  it('조건이 바뀌면 pet_policy_text', () => {
    expect(siteChanges(row, { ...same, petPolicy: facts({ largeDogOk: false }) })).toEqual(['pet_policy_text']);
  });
  it('사이트 조건 원문이 비었으면 갱신이 아니라 보강이다', () => {
    const blank = { ...row, pet_policy_text: '', pet_policy: null };
    expect(siteChanges(blank, same)).toEqual([]);
    expect(fillColumns(blank, same)).toContain('pet_policy_text');
  });
  it('숙박 요금 금액이 다르면 stay_price_text · 금액 없는 문장은 세지 않는다', () => {
    expect(siteChanges(row, { ...same, stayPriceText: '1박 18만원' })).toEqual(['stay_price_text']);
    expect(siteChanges(row, { ...same, stayPriceText: '가격은 문의' })).toEqual([]);
  });
  it('숙소 환경은 둘 다 값이 있는 칸이 다를 때만', () => {
    expect(siteChanges(row, { ...same, stayEnvironment: { standalone: false, yard: true, fencedYard: null, stairs: null } })).toEqual(['stay_environment']);
    expect(siteChanges(row, { ...same, stayEnvironment: { standalone: true, yard: true, fencedYard: true, stairs: null } })).toEqual([]);
  });
});

describe('fillColumns — 빈 칸만', () => {
  it('다 찬 장소에 같은 말이면 빈 칸이 없다 · review_url 은 세지 않는다', () => {
    expect(fillColumns({ ...row, review_url: null }, same)).toEqual([]);
  });
  it('홈페이지가 빈 장소에 카드가 있으면 보강이다', () => {
    expect(fillColumns(row, { ...same, homepage: { url: 'https://solsup.com/', siteName: '솔숲' } })).toEqual(['homepage_url', 'homepage_name', 'homepage_image']);
  });
});
