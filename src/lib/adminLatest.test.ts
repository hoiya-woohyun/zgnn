/**
 * 최신본으로 저장하기의 미리보기. 미리보기가 쓰기와 **같은 patch** 에서 나오는지가 요점이다 —
 * 어긋나면 운영자가 본 것과 다른 칸이 덮인다.
 */
import { describe, expect, it } from 'vitest';
import { defaultOverwritePick, latestPlan, toggleOverwritePick } from './adminLatest';
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
});
