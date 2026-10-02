import { describe, expect, it } from 'vitest';
import type { TCandidateRow, TPlaceRow } from './adminCandidates';
import { latestPlan } from './adminLatest';
import { liveProposal, proposalPick, proposalView, withProposal, type TProposal } from './adminProposal';

const strict = { indoor: 'cage', leash: true, largeDogOk: false, smallDogOnly: false, callFirst: false, feeFree: null, weightLimitKg: 10, maxDogs: null, notes: null } as const;
const place = {
  id: 'p1', type: 'stay', name: '솔숲펜션', region_raw: '동쪽 (구좌읍)', features: '사람이 쓴 소개', pet_policy_text: '10kg 이하, 케이지', pet_policy: strict,
  review_url: null, naver_url: null, naver_place_id: null, lat: 33.5, lng: 126.8, address: '제주 제주시 구좌읍 1', category: '펜션',
  stay_price_text: '1박 15만원', stay_amenities_text: null, sort: null, status: 'published', source: 'notion', archived_at: null, archive_note: null,
} as TPlaceRow;

const proposal = (fields: TProposal['fields'], over: Partial<TProposal> = {}): TProposal => ({ summary: 's', fields, conflicts: [], at: '2026-10-02T00:00:00Z', superseded: false, ...over });
const row = (id: string, extracted: Partial<TCandidateRow['extracted']> = {}): TCandidateRow => ({
  id, post_url: `https://blog/${id}`, extracted: { name: '솔숲펜션', type: 'stay', regionRaw: null, address: '제주특별자치도 제주시 구좌읍 1', petPolicyText: '블로그 문장', petPolicy: null, features: '블로그 소개', ...extracted },
  match_place_id: 'p1', match_confidence: 0.9, status: 'pending', reviewer_note: null, reviewed_at: null, created_at: '', blog_posts: null, places: null,
});

describe('proposalView — 제안 없음은 "안 봤다" 다', () => {
  it('갱신 묶음이 아니면 그리지 않는다 · 제안이 없으면 제안 없음(초록 아님) · superseded 는 없는 것', () => {
    expect(proposalView({ kind: 'fill', rows: [row('a')] })).toBeNull();
    expect(proposalView({ kind: 'update', rows: [row('a')] })).toEqual({ state: 'missing', label: '제안 없음' });
    expect(proposalView({ kind: 'update', rows: [row('a', { proposal: proposal({}, { superseded: true }) })] })?.state).toBe('missing');
  });
  it('살아 있는 것 중 가장 새 제안 · change 칸 수', () => {
    const older = proposal({ category: { action: 'change', value: 'x', basedOn: [], quote: null, why: null } }, { at: '2026-09-01' });
    const newer = proposal({ stay_price_text: { action: 'change', value: '1박 18만원', basedOn: ['https://blog/a'], quote: 'q', why: null } }, { at: '2026-10-01' });
    const rows = [row('a', { proposal: older }), row('b', { proposal: newer })];
    expect(liveProposal(rows)).toBe(newer);
    expect(proposalView({ kind: 'update', rows })).toMatchObject({ state: 'ready', label: '제안 1칸', changed: ['stay_price_text'] });
  });
});

describe('withProposal · proposalPick — 본 것과 덮이는 것이 같다', () => {
  const p = proposal({
    stay_price_text: { action: 'change', value: '1박 18만원', basedOn: ['https://blog/a'], quote: 'q', why: '요금 인상' },
    features: { action: 'append', value: '테라스가 생겼어요', basedOn: ['https://blog/a'], quote: 'q', why: null },
    pet_policy_text: { action: 'keep', value: null, basedOn: [], quote: null, why: null },
  });

  it('keep 칸은 사이트 값 그대로라 전·후 목록에 안 선다 · 소개는 덧붙임 · 제안 밖 칸(주소)은 대표 값', () => {
    const effective = withProposal(row('a').extracted, p, place);
    const keys = latestPlan(place, effective).changes.map((c) => c.key);
    expect(keys).toContain('stay_price_text');
    expect(keys).toContain('features');
    expect(keys).toContain('address');
    expect(keys).not.toContain('pet_policy_text');
    expect(effective.features).toBe('사람이 쓴 소개\n테라스가 생겼어요');
  });

  it('기본 체크는 제안의 change 칸만(소개 덧붙임·주소는 꺼짐) · 제안이 없으면 null', () => {
    const all = latestPlan(place, withProposal(row('a').extracted, p, place)).changes.map((c) => c.key);
    expect(proposalPick(all, p, place)).toEqual(['stay_price_text']);
    expect(proposalPick(all, null, place)).toBeNull();
  });

  it('완화는 근거 글이 둘 이상일 때만 기본으로 켠다', () => {
    const loose = { ...strict, largeDogOk: true, weightLimitKg: null };
    const one = proposal({ pet_policy_text: { action: 'change', value: '대형견도 돼요', petPolicy: loose, basedOn: ['https://blog/a'], quote: 'q', why: null } });
    const two = proposal({ pet_policy_text: { action: 'change', value: '대형견도 돼요', petPolicy: loose, basedOn: ['https://blog/a', 'https://blog/b'], quote: 'q', why: null } });
    const all = ['pet_policy_text', 'pet_policy', 'address'];
    expect(proposalPick(all, one, place)).toEqual([]);
    expect(proposalPick(all, two, place)).toEqual(['pet_policy_text', 'pet_policy']);
    const tight = proposal({ pet_policy_text: { action: 'change', value: '5kg 이하', petPolicy: { ...strict, weightLimitKg: 5 }, basedOn: ['https://blog/a'], quote: 'q', why: null } });
    expect(proposalPick(all, tight, place)).toEqual(['pet_policy_text', 'pet_policy']);
  });
});
