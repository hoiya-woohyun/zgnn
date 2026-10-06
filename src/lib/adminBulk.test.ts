import { describe, expect, it } from 'vitest';
import { bulkApproveJobs, bulkApproveNeedsLook, bulkApproveSummary, bulkApproveText, bulkLatestSummary, bulkLatestTargets, summarizeBulk, thinNewEvidence } from './adminBulk';
import type { TCandidateGroup, TPlaceRow } from './adminCandidates';

const place = (id: string, over: Partial<TPlaceRow> = {}) =>
  ({ id, type: 'cafe', name: '카페', region_raw: '서쪽 (애월읍)', features: '옛 소개', pet_policy_text: '', pet_policy: null, address: null, lat: null, lng: null, status: 'published', ...over }) as unknown as TPlaceRow;
const group = (key: string, pair: string | null, features = '새 소개') =>
  ({ key, lead: { match_place_id: pair, extracted: { name: '카페', type: 'cafe', regionRaw: '서쪽 (애월읍)', features, petPolicyText: null, petPolicy: null, address: null } } }) as unknown as TCandidateGroup;

describe('bulkLatestTargets', () => {
  it('짝 없음 · 내린 곳 · 같음은 건너뛰고 나머지만 덮는다', () => {
    const plan = bulkLatestTargets(
      [group('a', 'p1'), group('b', null), group('c', 'p2'), group('d', 'p3', '옛 소개')],
      // p1 은 소개가 비어 있다 — 빈 칸을 채우는 것은 기본으로 켜진다(사이트에 값이 있는 소개는 꺼진다, 아래).
      [place('p1', { features: '' }), place('p2', { status: 'archived' }), place('p3')],
    );
    expect(plan.eligible.map((entry) => entry.group.key)).toEqual(['a']);
    expect(plan).toMatchObject({ noPair: 1, archived: 1, same: 1 });
    expect(bulkLatestSummary(plan)).toBe(
      '1곳의 기존 장소를 새 분석 값으로 덮어요 — 모두 1칸. 짝 없는 1곳 · 짝이 내린 곳인 1곳 · 바뀔 칸이 없는 1곳은 건너뛰어요.',
    );
  });
});

describe('bulkLatestTargets — 제안이 없으면 한 줄의 기본 체크와 같다(2026-10-04)', () => {
  it('사이트에 값이 있는 이름·소개만 바뀌면 덮지 않고 따로 센다 · 다른 칸이 있으면 그 칸만', () => {
    const plan = bulkLatestTargets([group('a', 'p1')], [place('p1')]);
    expect(plan.eligible).toEqual([]);
    expect(plan.offByDefault).toBe(1);
    expect(bulkLatestSummary(plan)).toBe('0곳의 기존 장소를 새 분석 값으로 덮어요 — 모두 0칸. 이름·소개처럼 사람이 켜야 하는 칸만 바뀌는 1곳은 건너뛰어요.');
    const withAddress = { ...group('b', 'p1'), lead: { match_place_id: 'p1', extracted: { ...group('b', 'p1').lead.extracted, address: '제주 제주시 애월읍 1' } } } as unknown as TCandidateGroup;
    expect(bulkLatestTargets([withAddress], [place('p1')]).eligible[0]).toMatchObject({ changes: 1, columns: ['address'] });
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
      // 'yes' 는 동반 확인(`dogWasThere`)으로 둔다 — 문장 없음 + 동반 표기만은 근거 얇음으로 빠진다(todo/13 A7, 아래 thinNewEvidence).
      lead: {
        ...base.lead,
        extracted: { ...base.lead.extracted, verify: petAllowedHere === undefined ? null : { petAllowedHere, dogWasThere: petAllowedHere === 'yes' }, ...over },
      },
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

describe('thinNewEvidence · 일괄 올리기에서 근거 얇은 신규를 뺀다(todo/13 A3)', () => {
  const GENERIC = '애견동반 가능해요';
  const thin = (key: string, over: { pair?: string | null; text?: string | null; independent?: number; posts?: number; dogWasThere?: boolean } = {}) => {
    const base = group(key, over.pair ?? null);
    return {
      ...base,
      posts: Array.from({ length: over.posts ?? 1 }, (_, i) => `u${i}`),
      ...(over.independent !== undefined ? { independentPosts: over.independent } : {}),
      lead: {
        ...base.lead,
        extracted: {
          ...base.lead.extracted,
          petPolicyText: over.text === undefined ? GENERIC : over.text,
          verify: { petAllowedHere: 'yes', dogWasThere: over.dogWasThere ?? false },
        },
      },
    } as unknown as TCandidateGroup;
  };

  it('조건 미기재 + 독립 글 1건이면 얇다 · 글이 여럿이어도 동반 표기만이면 얇다', () => {
    expect(thinNewEvidence(thin('a', { independent: 1, posts: 1, dogWasThere: true }))).toBe(true);
    expect(thinNewEvidence(thin('b', { independent: 3, posts: 3, dogWasThere: false }))).toBe(true);
  });

  it('독립 글이 둘 이상이고 동반 확인이면, 또는 조건이 적혀 있으면, 또는 짝이 있으면 얇지 않다', () => {
    expect(thinNewEvidence(thin('a', { independent: 2, posts: 2, dogWasThere: true }))).toBe(false);
    expect(thinNewEvidence(thin('b', { text: '애견동반 가능, 리드줄 필수' }))).toBe(false);
    expect(thinNewEvidence(thin('c', { pair: 'p1' }))).toBe(false);
  });

  it('광고성 복제 글은 하나로 센다 — 글 5건이어도 독립 1건이면 얇다', () => {
    expect(thinNewEvidence(thin('a', { independent: 1, posts: 5, dogWasThere: true }))).toBe(true);
  });

  it('집계는 건너뛴다고 세고 주 버튼을 내리며, 보낼 줄에서도 빠진다', () => {
    const groups = [thin('a'), thin('b', { independent: 2, posts: 2, dogWasThere: true })];
    const plan = bulkApproveSummary(groups, ['a', 'b']);
    expect(plan).toMatchObject({ thin: 1, ok: 1 });
    expect(bulkApproveNeedsLook(plan)).toBe(true);
    expect(bulkApproveText(plan)).toBe(
      '1곳 올려요. 근거가 얇아 한 줄씩 봐야 하는 1곳은 건너뛰어요. 짝이 있으면 그 장소의 빈 칸만 채우고, 없으면 새 장소로 올라가요.',
    );
    expect(bulkApproveJobs(groups).map((g) => g.key)).toEqual(['b']);
  });

  it('문장 없음이면 동반 표기만일 때만 얇다 — 동반 확인 · 미점검 · 짝이 있으면 얇지 않다(todo/13 A7)', () => {
    expect(thinNewEvidence(thin('a', { text: null, independent: 3, posts: 3, dogWasThere: false }))).toBe(true);
    expect(thinNewEvidence(thin('b', { text: null, independent: 1, posts: 1, dogWasThere: true }))).toBe(false);
    expect(thinNewEvidence(thin('c', { text: null, pair: 'p1' }))).toBe(false);
    const unchecked = thin('d', { text: null });
    (unchecked.lead.extracted as { verify: unknown }).verify = null;
    expect(thinNewEvidence(unchecked)).toBe(false);
  });

  it('지역이 없는 줄은 지역 칸에 먼저 선다 — 한 줄은 한 칸에만 센다', () => {
    const noRegion = thin('a');
    (noRegion.lead.extracted as { regionRaw: string | null }).regionRaw = null;
    expect(bulkApproveSummary([noRegion], ['a'])).toMatchObject({ noRegion: 1, thin: 0 });
  });
});
