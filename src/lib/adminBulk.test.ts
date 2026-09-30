import { describe, expect, it } from 'vitest';
import { bulkLatestSummary, bulkLatestTargets, summarizeBulk } from './adminBulk';
import type { TCandidateGroup, TPlaceRow } from './adminCandidates';

const place = (id: string, over: Partial<TPlaceRow> = {}) =>
  ({ id, type: 'cafe', name: '카페', region_raw: '서쪽 (애월읍)', features: '옛 소개', pet_policy_text: '', pet_policy: null, address: null, lat: null, lng: null, status: 'published', ...over }) as unknown as TPlaceRow;
const group = (key: string, pair: string | null, features = '새 소개') =>
  ({ key, lead: { match_place_id: pair, extracted: { name: '카페', type: 'cafe', regionRaw: '서쪽 (애월읍)', features, petPolicyText: null, petPolicy: null, address: null } } }) as unknown as TCandidateGroup;

describe('bulkLatestTargets', () => {
  it('짝 없음 · 내린 곳 · 같음은 건너뛰고 나머지만 덮는다', () => {
    const plan = bulkLatestTargets(
      [group('a', 'p1'), group('b', null), group('c', 'p2'), group('d', 'p3', '옛 소개')],
      [place('p1'), place('p2', { status: 'archived' }), place('p3')],
    );
    expect(plan.eligible.map((entry) => entry.group.key)).toEqual(['a']);
    expect(plan).toMatchObject({ noPair: 1, archived: 1, same: 1 });
    expect(bulkLatestSummary(plan)).toBe(
      '1묶음의 기존 장소를 새 분석 값으로 덮어요 — 모두 1칸. 짝 없는 1묶음 · 짝이 내린 곳인 1묶음 · 바뀔 칸이 없는 1묶음은 건너뛰어요.',
    );
  });
});

describe('summarizeBulk', () => {
  it('기다리는 것과 실패를 따로 말한다', () => {
    expect(summarizeBulk('올렸어요', { done: 3, waiting: 0, failed: 0 })).toBe('3묶음 올렸어요');
    expect(summarizeBulk('올렸어요', { done: 3, waiting: 2, failed: 1 })).toBe(
      '3묶음 올렸어요 · 2묶음은 직접 골라야 해요(줄을 펼쳐 보세요) · 1묶음 실패 — 줄에 이유를 적어 뒀어요',
    );
  });
});
