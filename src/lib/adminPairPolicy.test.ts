import { describe, expect, it } from 'vitest';
import { previewFor, type TCandidateGroup, type TCandidateRow, type TPlaceRow } from './adminCandidates';
import { listPolicyCell, overwriteDefault } from './adminPairPolicy';
import type { TProposal } from './adminProposal';

// 소길스테이 모양 — 사이트는 "10kg 미만 1마리", 블로그는 "실내 OK · 대형견 OK"(완화).
const strict = { indoor: 'unknown', leash: false, largeDogOk: false, smallDogOnly: false, callFirst: false, feeFree: null, weightLimitKg: 10, maxDogs: 1, notes: null } as const;
const loose = { indoor: 'free', leash: false, largeDogOk: true, smallDogOnly: false, callFirst: false, feeFree: null, weightLimitKg: null, maxDogs: null, notes: null } as const;
const place = (over: Partial<TPlaceRow> = {}) =>
  ({
    id: 'p1', type: 'stay', name: '소길스테이', region_raw: '서쪽 (애월읍)', features: '사람이 쓴 소개', pet_policy_text: '10kg 미만 1마리 가능', pet_policy: strict,
    review_url: null, naver_url: null, naver_place_id: null, lat: 33.4, lng: 126.3, address: '제주 제주시 애월읍 1', category: '펜션',
    stay_price_text: null, stay_amenities_text: null, sort: null, status: 'published', source: 'blog', archived_at: null, archive_note: null, ...over,
  }) as TPlaceRow;
const row = (extracted: Partial<TCandidateRow['extracted']> = {}): TCandidateRow => ({
  id: 'a', post_url: 'https://blog/a',
  extracted: { name: '소길스테이', type: 'stay', regionRaw: '서쪽 (애월읍)', address: '제주 제주시 애월읍 1', petPolicyText: '실내 OK, 대형견도 OK', petPolicy: loose, features: '사람이 쓴 소개', ...extracted },
  match_place_id: 'p1', match_confidence: 0.9, status: 'pending', reviewer_note: null, reviewed_at: null, created_at: '', blog_posts: null, places: null,
});
const group = (r: TCandidateRow, kind: TCandidateGroup['kind'] = 'update') =>
  ({ key: 'g', kind, tier: 'auto', lead: r, rows: [r], posts: [r.post_url] }) as unknown as TCandidateGroup;
const keep: TProposal = {
  summary: 's', conflicts: [], at: '2026-10-02T00:00:00Z', superseded: false,
  fields: { pet_policy_text: { action: 'keep', value: null, basedOn: [], quote: null, why: '사이트의 10kg 미만 1마리 조건 유지' } },
};
const labels = (cell: { items: { label: string }[] }) => cell.items.map((item) => item.label);

describe('listPolicyCell — 목록 조건 칸은 올리면 나갈 조건(todo/13 T2.3)', () => {
  it('제안이 사이트 조건을 유지하면 사이트 뱃지를 보이고 글이 다르다는 표식을 남긴다(소길스테이)', () => {
    const r = row({ proposal: keep });
    const out = listPolicyCell(group(r), previewFor(r.extracted), place());
    expect(out.fromSite).toBe(true);
    expect(out.blogDiffers).toBe(true);
    expect(labels(out.cell)).toContain('10kg 미만');
    expect(labels(out.cell)).not.toContain('대형견 OK');
  });

  it('제안이 없어도 완화는 조건 칸이 꺼진 채 시작하니 사이트 쪽이다 — 사람이 켜면 글 쪽', () => {
    const r = row();
    const preview = previewFor(r.extracted);
    expect(listPolicyCell(group(r), preview, place())).toMatchObject({ fromSite: true, blogDiffers: true });
    const on = listPolicyCell(group(r), preview, place(), ['pet_policy_text', 'pet_policy']);
    expect(on.fromSite).toBe(false);
    expect(labels(on.cell)).toEqual(labels({ items: preview.mergedBadgeList }));
  });

  it('조건이 더 엄격해지는 글은 기본으로 켜지므로 글 쪽이다', () => {
    const r = row({ petPolicyText: '5kg 미만 1마리, 케이지 필수', petPolicy: { ...strict, indoor: 'cage', weightLimitKg: 5 } });
    const out = listPolicyCell(group(r), previewFor(r.extracted), place());
    expect(overwriteDefault(group(r), place()).columns).toContain('pet_policy_text');
    expect(out).toMatchObject({ fromSite: false, blogDiffers: false });
  });

  it('글이 사이트와 같은 조건이면 표식이 없다 · 사이트 원문이 비면 올리기가 채우니 글 쪽이다 · 짝이 없으면 글 쪽', () => {
    const same = row({ petPolicyText: '10kg 미만 1마리 가능', petPolicy: strict });
    expect(listPolicyCell(group(same, 'fill'), previewFor(same.extracted), place())).toMatchObject({ blogDiffers: false });
    const r = row();
    expect(listPolicyCell(group(r, 'fill'), previewFor(r.extracted), place({ pet_policy_text: '', pet_policy: null })).fromSite).toBe(false);
    expect(listPolicyCell(group(r, 'new'), previewFor(r.extracted), undefined).fromSite).toBe(false);
  });
});
