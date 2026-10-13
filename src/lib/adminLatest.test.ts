/**
 * 최신본으로 저장하기의 미리보기. 미리보기가 쓰기와 **같은 patch** 에서 나오는지가 요점이다 —
 * 어긋나면 운영자가 본 것과 다른 칸이 덮인다.
 */
import { describe, expect, it } from 'vitest';
import { defaultOverwritePick, filledColumnLabels, latestPlan, toggleOverwritePick } from './adminLatest';
import { EMPTY_VALUE } from './adminEdit';
import type { TCandidateExtracted, TPlaceRow } from './adminCandidates';

const place = {
  id: 'p1',
  type: 'stay',
  name: '솔숲펜션',
  region_raw: '동쪽 (구좌읍)',
  features: '옛 소개예요.',
  pet_policy_text: '소형견만',
  pet_policy: null,
  review_url: null,
  naver_url: null,
  naver_place_id: null,
  lat: 33.5,
  lng: 126.8,
  address: '제주 제주시 구좌읍 1',
  category: null,
  stay_price_text: null,
  stay_amenities_text: null,
  sort: null,
  status: 'archived',
  source: 'blog',
} as unknown as TPlaceRow;

const extracted = (over: Partial<TCandidateExtracted> = {}): TCandidateExtracted => ({
  name: '솔숲펜션',
  type: 'stay',
  regionRaw: '동쪽 (구좌읍)',
  address: '제주 제주시 구좌읍 1',
  petPolicyText: '소형견만',
  petPolicy: null,
  features: '옛 소개예요.',
  geo: { lat: 33.5, lng: 126.8 },
  ...over,
});

describe('latestPlan', () => {
  it('같으면 바뀌는 칸이 없다', () => {
    expect(latestPlan(place, extracted())).toEqual({ patch: null, previous: {}, changes: [] });
  });

  it('바뀐 칸을 사람 말로 — 판단은 한 줄로, 좌표는 한 칸으로', () => {
    const plan = latestPlan(place, extracted({ features: '새 소개예요.', petPolicy: { indoor: 'outdoorOnly', leash: true } as never, geo: { lat: 33.6, lng: 126.9 } }));
    // 원문은 같고 판단만 바뀌면 원문 줄은 세우지 않는다(patch 에는 짝으로 들어간다)
    expect(plan.changes.map((c) => c.label)).toEqual(['좌표', '소개', '동반 판단']);
    expect(plan.patch).toHaveProperty('pet_policy_text');
    expect(plan.changes.find((c) => c.key === 'features')).toMatchObject({ before: '옛 소개예요.', after: '새 소개예요.' });
    expect(plan.changes.find((c) => c.key === 'geo')).toMatchObject({ before: '33.5, 126.8', after: '33.6, 126.9' });
    expect(plan.previous.features).toBe('옛 소개예요.');
  });

  it('후보가 비어 있는 칸은 목록에도 없다(지우지 않는다)', () => {
    const plan = latestPlan({ ...place, category: '펜션' } as TPlaceRow, extracted({ name: '솔숲펜션2' }));
    expect(plan.changes).toEqual([{ key: 'name', label: '이름', before: '솔숲펜션', after: '솔숲펜션2' }]);
    expect(plan.changes.some((c) => c.after === EMPTY_VALUE)).toBe(false);
  });
});

describe('칸 고르기(11 T1.4)', () => {
  const changed = extracted({ features: '새 소개예요.', petPolicyText: '대형견도 돼요', geo: { lat: 33.6, lng: 126.9 } });

  it('고른 칸만 patch 에 — 원문만 골라도 판단이 함께', () => {
    const plan = latestPlan(place, changed, ['pet_policy_text']);
    expect(Object.keys(plan.patch ?? {})).toEqual(['pet_policy_text', 'pet_policy']);
    expect(plan.changes.map((c) => c.key)).toEqual(['pet_policy_text']);
  });

  it('체크는 짝으로 움직인다 · 처음(undefined)은 전부 켜진 상태에서 시작한다 · 다 끄면 빈 배열', () => {
    const all = ['geo', 'features', 'pet_policy_text', 'pet_policy'];
    expect(toggleOverwritePick(all, undefined, 'features')).toEqual(['geo', 'pet_policy_text', 'pet_policy']);
    expect(toggleOverwritePick(all, undefined, 'pet_policy')).toEqual(['geo', 'features']);
    expect(toggleOverwritePick(all, ['geo'], 'pet_policy_text')).toEqual(['geo', 'pet_policy_text', 'pet_policy']);
    expect(toggleOverwritePick(all, ['geo'], 'geo')).toEqual([]);
    expect(latestPlan(place, changed, []).patch).toBeNull();
  });
});

describe('defaultOverwritePick — 완화는 꺼진 채(11 U6)', () => {
  const all = ['geo', 'features', 'pet_policy_text', 'pet_policy'];
  it('완화가 아니면 전부 · 완화면 조건 짝만 끈다', () => {
    expect(defaultOverwritePick(all)).toEqual(all);
    expect(defaultOverwritePick(all, { loosen: true })).toEqual(['geo', 'features']);
  });
  it('사이트에 값이 있는 이름·종류·소개는 꺼진 채 — 빈 칸을 채우는 것은 켠다(2026-10-04 프릳츠 사례)', () => {
    const keys = ['name', 'type', 'address', 'features', 'pet_policy_text', 'pet_policy'];
    expect(defaultOverwritePick(keys, { place: { name: '프릳츠', type: 'cafe', features: '커피 맛집이지만 빵 맛집… 성산일출봉 뷰' } })).toEqual([
      'address',
      'pet_policy_text',
      'pet_policy',
    ]);
    expect(defaultOverwritePick(keys, { place: { name: '프릳츠', type: 'cafe', features: '  ' } })).toEqual(['address', 'features', 'pet_policy_text', 'pet_policy']);
    expect(defaultOverwritePick(keys, { loosen: true, place: { name: '', type: 'cafe', features: '소개' } })).toEqual(['name', 'address']);
  });
  it("짝이 '확인'(같은 곳인지 미확정)이면 전부 꺼진 채 — 주소·좌표·조건이 다른 가게 값으로 기본 덮이던 것(todo/14 W261010.26)", () => {
    const keys = ['address', 'geo', 'category', 'pet_policy_text', 'pet_policy'];
    expect(defaultOverwritePick(keys, { tier: 'ask' })).toEqual([]);
    expect(defaultOverwritePick(keys, { tier: 'auto' })).toEqual(keys);
  });
});

describe('원문 공개·이용 안내 — 조건 짝의 두 칸도 사람 말로(21 S4)', () => {
  const guide = { text: '입구에 발 닦을 수건이 준비돼 있어요', basis: '00000000abcdef' };
  const seed = { ...place, source: 'notion', pet_policy_text_public: true, pet_policy_guide: null } as TPlaceRow;

  it('시드 원문을 덮으면 원문 공개가 숨김으로, 안내가 문장으로 선다 — patch 의 칸은 전부 목록에 있다', () => {
    const plan = latestPlan(seed, extracted({ petPolicyText: '블로그 문장', petPolicyGuide: guide }));
    expect(plan.changes.map((c) => [c.label, c.before, c.after])).toEqual([
      ['조건 원문', '소형견만', '블로그 문장'],
      ['원문 공개', '그대로 내보냄', '숨김'],
      ['이용 안내', EMPTY_VALUE, guide.text],
    ]);
    // 판단은 둘 다 null 이라 patch 에 짝으로만 실리고 목록에는 서지 않는다(원문만 바뀐 짝 — 기존 규칙)
    const keys = plan.changes.map((c) => c.key);
    expect(Object.keys(plan.patch ?? {}).filter((key) => key !== 'pet_policy' && !keys.includes(key))).toEqual([]);
  });

  it('완화면 조건 짝 넷이 함께 꺼진 채 시작한다', () => {
    const all = ['features', 'pet_policy_text', 'pet_policy', 'pet_policy_text_public', 'pet_policy_guide'];
    expect(defaultOverwritePick(all, { loosen: true })).toEqual(['features']);
    expect(toggleOverwritePick(all, [], 'pet_policy_guide')).toEqual(['pet_policy_text', 'pet_policy', 'pet_policy_text_public', 'pet_policy_guide']);
  });
});

describe('filledColumnLabels — 채움 토스트의 칸 이름(21 S4.1)', () => {
  it('조건 짝의 두 칸도 사람 말로 · 좌표 두 칸은 한 번 · 짝으로 따라오는 칸은 겹치지 않는다', () => {
    expect(filledColumnLabels(['address', 'lat', 'lng', 'pet_policy_text', 'pet_policy', 'pet_policy_text_public', 'pet_policy_guide'])).toEqual([
      '주소',
      '좌표',
      '조건 원문',
      '동반 판단',
      '원문 공개',
      '이용 안내',
    ]);
    expect(filledColumnLabels(['naver_place_id', 'naver_url', 'homepage_url', 'homepage_name', 'homepage_image'])).toEqual([
      '네이버 플레이스',
      '홈페이지',
      '홈페이지 사진',
    ]);
    expect(filledColumnLabels(['review_url', 'status'])).toEqual(['후기 링크', '게시 상태']);
  });

  it('모르는 키는 영문 그대로 — 새 칸이 목록에서 조용히 빠지지 않게', () => {
    expect(filledColumnLabels(['features', 'some_new_column'])).toEqual(['소개', 'some_new_column']);
  });
});
