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
const group = (r: TCandidateRow, kind: TCandidateGroup['kind'] = 'update', tier: TCandidateGroup['tier'] = 'auto') =>
  ({ key: 'g', kind, tier, lead: r, rows: [r], posts: [r.post_url] }) as unknown as TCandidateGroup;
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

  /** 담소요 09-17 후보 모양 — 사이트는 '실외만', 글은 실내를 말하지 않는다. 덮으면 '실외만' 이 원문·판단에서 사라진다(11 T4.1). */
  it('모름이 사이트의 `실외만` 을 지우는 글은 완화라 조건 칸이 꺼진 채 시작한다', () => {
    const r = row({ petPolicyText: '10kg 미만 1마리, 동반 가능', petPolicy: strict });
    const out = overwriteDefault(group(r), place({ pet_policy: { ...strict, indoor: 'outdoorOnly' } }));
    expect(out.loosen).toBe(true);
    expect(out.columns).not.toContain('pet_policy_text');
  });

  it('글이 사이트와 같은 조건이면 표식이 없다 · 사이트 원문이 비면 올리기가 채우니 글 쪽이다 · 짝이 없으면 글 쪽', () => {
    const same = row({ petPolicyText: '10kg 미만 1마리 가능', petPolicy: strict });
    expect(listPolicyCell(group(same, 'fill'), previewFor(same.extracted), place())).toMatchObject({ blogDiffers: false });
    const r = row();
    expect(listPolicyCell(group(r, 'fill'), previewFor(r.extracted), place({ pet_policy_text: '', pet_policy: null })).fromSite).toBe(false);
    expect(listPolicyCell(group(r, 'new'), previewFor(r.extracted), undefined).fromSite).toBe(false);
  });
});

describe("overwriteDefault — 짝이 '확인' 이면 기본 체크가 전부 꺼진다(todo/14 W261010.26)", () => {
  // 민속해안로 1 ↔ 7 모양 — 같은 곳인지 모르는 짝인데 주소·좌표·조건·카테고리가 다르다.
  const other = row({ address: '제주 서귀포시 표선면 민속해안로 7', lat: 33.3, lng: 126.8, category: '카페', petPolicyText: '5kg 미만 1마리, 케이지 필수', petPolicy: { ...strict, indoor: 'cage', weightLimitKg: 5 } });

  it('바뀌는 칸이 있어도 아무것도 켜지 않는다 — 같은 짝이 기존(auto)이면 켜지던 칸이다', () => {
    const asked = overwriteDefault(group(other, 'ask', 'ask'), place());
    expect(asked.plan.changes.length).toBeGreaterThan(0);
    expect(asked.columns).toEqual([]);
    expect(overwriteDefault(group(other, 'update', 'auto'), place()).columns).toContain('pet_policy_text');
  });

  it('제안이 칸을 켜도 확인 짝은 꺼진 채 — 제안은 같은 곳이라는 전제 위의 말이다', () => {
    const change: TProposal = {
      ...keep,
      fields: { pet_policy_text: { action: 'change', value: '5kg 미만 1마리, 케이지 필수', basedOn: ['https://blog/a', 'https://blog/b'], quote: null, why: '두 글이 같은 말', petPolicy: { ...strict, indoor: 'cage', weightLimitKg: 5 } } },
    };
    const withChange = row({ ...other.extracted, proposal: change });
    expect(overwriteDefault(group(withChange, 'update', 'auto'), place()).columns).toContain('pet_policy_text');
    expect(overwriteDefault(group(withChange, 'ask', 'ask'), place()).columns).toEqual([]);
  });

  it('목록의 조건 칸은 사이트 쪽이다 — 올려도 조건이 안 바뀐다', () => {
    const out = listPolicyCell(group(other, 'ask', 'ask'), previewFor(other.extracted), place());
    expect(out.fromSite).toBe(true);
    expect(labels(out.cell)).toContain('10kg 미만');
  });
});
