import { describe, expect, it } from 'vitest';
import type { TCandidateRow, TPlaceRow } from './adminCandidates';
import { EMPTY_VALUE } from './adminEdit';
import { fieldVoices, SITE_COMPARE_COLUMNS, siteCompareRows } from './adminSiteCompare';

const place = {
  id: 'p1', type: 'cafe', name: '솔숲카페', region_raw: '동쪽 (구좌읍)', features: '사람이 쓴 소개', pet_policy_text: '대형견 가능',
  pet_policy: null, review_url: null, naver_url: null, naver_place_id: null, lat: null, lng: null, address: null, category: '카페',
  stay_price_text: null, stay_amenities_text: null, sort: null, status: 'published', source: 'notion', archived_at: null, archive_note: null,
} as TPlaceRow;

const row = (id: string, postedAt: string | null, extracted: Partial<TCandidateRow['extracted']>): TCandidateRow => ({
  id,
  post_url: `https://blog.naver.com/x/${id}`,
  extracted: { name: '솔숲카페', type: 'cafe', regionRaw: null, address: null, petPolicyText: null, petPolicy: null, ...extracted },
  match_place_id: 'p1',
  match_confidence: 0.9,
  status: 'pending',
  reviewer_note: null,
  reviewed_at: null,
  created_at: '2026-10-01',
  blog_posts: postedAt ? { title: `글 ${id}`, posted_at: postedAt, keyword: 'k', blog_id: 'b' } : null,
  places: null,
});

const policy = SITE_COMPARE_COLUMNS.find((column) => column.key === 'pet_policy_text')!;

describe('fieldVoices — 글마다 무엇이라 했나', () => {
  it('새 글이 위 · 그 칸을 말하지 않은 글은 뺀다 · 날짜 모르는 글은 맨 뒤', () => {
    const rows = [row('a', '2025-11-02T00:00:00Z', { petPolicyText: '대형견 가능' }), row('b', '2026-08-01T00:00:00Z', { petPolicyText: '대형견 불가' }), row('c', null, { petPolicyText: '소형견만' }), row('d', '2026-09-01', {})];
    expect(fieldVoices(rows, policy).map((voice) => [voice.rowId, voice.postedAt, voice.value])).toEqual([
      ['b', '2026-08-01', '대형견 불가'],
      ['a', '2025-11-02', '대형견 가능'],
      ['c', null, '소형견만'],
    ]);
  });
});

describe('siteCompareRows — 지금 사이트 값 · 글들이 말한 것 · 나갈 값', () => {
  it('글마다 다르면 충돌 + 최신 글 한마디 · 사이트와 나갈 값이 다르면 changed', () => {
    const rows = [row('a', '2025-11-02', { petPolicyText: '대형견 가능' }), row('b', '2026-08-01', { petPolicyText: '대형견 불가' })];
    const out = siteCompareRows(place, rows, rows[1]);
    const line = out.find((r) => r.key === 'pet_policy_text')!;
    expect(line).toMatchObject({ site: '대형견 가능', next: '대형견 불가', conflict: true, changed: true });
    expect(line.latestNote).toBe('최신 글(2026-08-01)은 "대형견 불가"');
  });
  it('대표가 말하지 않은 칸은 지금 값 그대로 나간다 · 세 쪽이 다 빈 칸은 줄이 없다 · 카페엔 숙소 칸이 없다', () => {
    const rows = [row('a', '2026-08-01', { petPolicyText: '대형견 가능' })];
    const out = siteCompareRows(place, rows, rows[0]);
    expect(out.map((r) => r.key)).toEqual(['pet_policy_text', 'features', 'category']);
    expect(out.find((r) => r.key === 'features')).toMatchObject({ site: '사람이 쓴 소개', next: '사람이 쓴 소개', changed: false, voices: [] });
    expect(out.find((r) => r.key === 'pet_policy_text')).toMatchObject({ conflict: false, changed: false, latestNote: null });
  });
  it('사이트가 빈 칸은 비어 있음으로', () => {
    const rows = [row('a', '2026-08-01', { category: '애견카페' })];
    const out = siteCompareRows({ ...place, category: null }, rows, rows[0]);
    expect(out.find((r) => r.key === 'category')).toMatchObject({ site: EMPTY_VALUE, next: '애견카페', changed: true });
  });
});
