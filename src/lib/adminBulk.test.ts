import { describe, expect, it } from 'vitest';
import { bulkApproveNeedsLook, bulkApproveSummary, bulkApproveText, bulkLatestSummary, bulkLatestTargets, summarizeBulk } from './adminBulk';
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
      '1곳의 기존 장소를 새 분석 값으로 덮어요 — 모두 1칸. 짝 없는 1곳 · 짝이 내린 곳인 1곳 · 바뀔 칸이 없는 1곳은 건너뛰어요.',
    );
  });
});

describe('bulkLatestTargets — 제안이 있으면 제안이 켠 칸만(11 U7)', () => {
  it('제안 칸만 columns 로 싣고 칸 수도 그것으로 센다', () => {
    const proposal = { summary: null, conflicts: [], at: '2026-10-02', fields: { category: { action: 'change', value: '애견카페', basedOn: ['u'], quote: 'q', why: null } } };
    const g = { ...group('a', 'p1'), kind: 'update', rows: [{ extracted: { proposal } }] } as unknown as TCandidateGroup;
    const plan = bulkLatestTargets([g], [place('p1', { category: '카페' })]);
    expect(plan.eligible).toHaveLength(1);
    expect(plan.eligible[0]).toMatchObject({ changes: 1, columns: ['category'] });
  });
});

describe('summarizeBulk', () => {
  it('기다리는 것과 실패를 따로 말한다', () => {
    expect(summarizeBulk('올렸어요', { done: 3, waiting: 0, failed: 0 })).toBe('3곳 올렸어요');
    expect(summarizeBulk('올렸어요', { done: 3, waiting: 2, failed: 1 })).toBe(
      '3곳 올렸어요 · 2곳은 직접 골라야 해요(줄을 펼쳐 보세요) · 1곳 실패 — 줄에 이유를 적어 뒀어요',
    );
  });
});

describe('bulkApproveSummary', () => {
  const withVerify = (key: string, petAllowedHere: 'yes' | 'no' | null | undefined, over: Record<string, unknown> = {}) => {
    const base = group(key, null);
    return {
      ...base,
      lead: { ...base.lead, extracted: { ...base.lead.extracted, verify: petAllowedHere === undefined ? null : { petAllowedHere, dogWasThere: false }, ...over } },
    } as unknown as TCandidateGroup;
  };

  it('근거 없음이 하나 섞이면 그 수를 세고 주 버튼을 내린다', () => {
    const groups = [withVerify('a', 'yes'), withVerify('b', null), withVerify('c', undefined)];
    const plan = bulkApproveSummary(groups, ['a', 'b', 'c']);
    expect(plan).toMatchObject({ ok: 2, noEvidence: 1, noRegion: 0 });
    expect(bulkApproveNeedsLook(plan)).toBe(true);
    expect(bulkApproveText(plan)).toContain('근거 없음 1곳');
  });

  it('고르지 않은 줄은 세지 않고, 전부 멀쩡하면 주 버튼을 그대로 둔다', () => {
    const groups = [withVerify('a', 'yes'), withVerify('b', null)];
    const plan = bulkApproveSummary(groups, ['a']);
    expect(plan).toMatchObject({ ok: 1, noEvidence: 0 });
    expect(bulkApproveNeedsLook(plan)).toBe(false);
  });

  it('지역이 없는 줄·내린 곳에 짝이 붙은 줄은 건너뛴다고 말한다', () => {
    const noRegion = withVerify('a', 'yes', { regionRaw: null });
    const toArchived = { ...group('b', 'p2') } as TCandidateGroup;
    const plan = bulkApproveSummary([noRegion, toArchived], ['a', 'b'], [place('p2', { status: 'archived' })]);
    expect(plan).toMatchObject({ noRegion: 1, archivedTarget: 1, ok: 0 });
    expect(bulkApproveText(plan)).toContain('건너뛰어요');
  });
});
