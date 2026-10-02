import { describe, expect, it } from 'vitest';
import { parsePetPolicy, toPetBadges, withPolicyFacts } from '../../src/lib/petPolicy';
import { formatGroup, formatMarkdown, groupCandidates, groupFlags, kindOfRow, parseReviewArgs, previewPolicy, resolveIds } from './reviewCandidates.mjs';

const parsers = { parsePetPolicy, toPetBadges, withPolicyFacts };
const row = (id, name, over = {}, top = {}) => ({
  id,
  post_url: `https://blog.naver.com/x/${id}`,
  match_place_id: null,
  match_confidence: 0,
  status: 'pending',
  reviewer_note: null,
  extracted: { name, type: 'cafe', regionRaw: '동쪽 (구좌읍)', geo: null, petPolicyText: null, petPolicy: null, evidence: ['인용문'], confidence: 0.6, visited: true, match: { tier: 'new', confidence: 0, reason: '없음' }, ...over },
  ...top,
});

describe('kindOfRow · 묶음의 종류 — 갱신이 하나라도 있으면 갱신(11 U2)', () => {
  const auto = (kind) => ({ tier: 'auto', confidence: 0.9, reason: '', ...(kind ? { kind } : {}) });
  it('옛 후보(match.kind 없음)는 tier 로 — auto 는 보강', () => {
    expect(kindOfRow(row('o', 'x', { match: auto() }))).toBe('fill');
    expect(kindOfRow(row('o', 'x'))).toBe('new');
    expect(kindOfRow(row('o', 'x', { match: { tier: 'ask', confidence: 0.6, reason: '' } }))).toBe('ask');
    expect(kindOfRow({ extracted: {} })).toBe('new');
  });
  it('묶음에 갱신 한 줄이 있으면 묶음이 갱신 · 갱신이 맨 앞에 선다', () => {
    const rows = [
      row('f1', '보강카페', { match: auto('fill') }, { match_place_id: 'p1' }),
      row('u1', '갱신카페', { match: auto('fill') }, { match_place_id: 'p2' }),
      row('u2', '갱신카페', { match: auto('update'), confidence: 0.1 }, { match_place_id: 'p2' }),
      row('n1', '신규카페'),
    ];
    const groups = groupCandidates(rows);
    expect(groups.map((g) => [g.lead.extracted.name, g.kind])).toEqual([
      ['갱신카페', 'update'],
      ['보강카페', 'fill'],
      ['신규카페', 'new'],
    ]);
  });
});

describe('groupCandidates — 같은 가게 묶기와 검수 순서', () => {
  it('nameKey(또는 이름)로 묶고, 기존 장소에 붙은 것은 match_place_id 로 묶는다', () => {
    const rows = [row('a1', '올드패션제주'), row('a2', '올드패션 제주점', { confidence: 0.9 }), row('b1', '엔젤하우스', {}, { match_place_id: 'p1' }), row('b2', '제주애견전문 엔젤하우스', { match: { tier: 'auto', confidence: 1, reason: '' } }, { match_place_id: 'p1' })];
    const groups = groupCandidates(rows);
    expect(groups).toHaveLength(2);
    const old = groups.find((g) => g.key.startsWith('name:'));
    expect(old.rows.map((r) => r.id)).toEqual(['a2', 'a1']); // confidence 높은 것이 대표
    expect(old.posts).toHaveLength(2);
    expect(groups.find((g) => g.key === 'place:p1').tier).toBe('auto');
  });

  it('순서: 일치 → 확인요청 → 신규, 방문 글이 목록 글보다, 조건문 있는 것이 먼저', () => {
    const rows = [
      row('n1', '목록카페', { visited: false }),
      row('n2', '조건있는카페', { petPolicyText: '리드줄 필수', confidence: 0.5 }),
      row('n3', '조건없는카페', { confidence: 0.99 }),
      row('k1', '기존카페', { match: { tier: 'ask', confidence: 0.7, reason: '' } }, { match_place_id: 'p9', match_confidence: 0.7 }),
    ];
    expect(groupCandidates(rows).map((g) => g.lead.extracted.name)).toEqual(['기존카페', '조건있는카페', '조건없는카페', '목록카페']);
  });
});

describe('previewPolicy — 앱이 문장을 어떻게 읽을지', () => {
  it('조건문이 없으면 "조건문 없음", 정규식이 못 읽으면 "정규식 못읽음", AI 판단이 없으면 "AI 판단 없음"', () => {
    expect(previewPolicy({ petPolicyText: null }, parsers).flags).toEqual(['조건문 없음']);
    const p = previewPolicy({ petPolicyText: '애견동반 가능해요!' }, parsers);
    expect(p.flags).toEqual(['정규식 못읽음', 'AI 판단 없음']);
    expect(p.level).toBe('자유');
  });
  it('AI 판단이 있으면 앱 배지가 그것을 따르고, 정규식과 어긋나면 표식이 붙는다', () => {
    const facts = { indoor: 'outdoorOnly', leash: true, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: null, feeText: null, weightLimitKg: null, maxDogs: null, notes: null };
    const p = previewPolicy({ petPolicyText: '케이지 필수, 테라스에서는 목줄', petPolicy: facts }, parsers);
    expect(p.regexBadges).toEqual(['케이지 필요', '리드줄']);
    expect(p.mergedBadges).toEqual(['야외만', '리드줄']);
    expect(p.flags).toEqual(['AI≠정규식(실내 outdoorOnly/cage)']);
    expect(p.corrections).toEqual([]);
  });
  it('원문에 없는 AI 판단은 앱이 빼고, 뺀 것을 표식과 한 줄로 남긴다', () => {
    const facts = { indoor: 'unknown', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: null, feeText: null, weightLimitKg: 10, maxDogs: null, notes: null };
    const p = previewPolicy({ petPolicyText: '애견동반 가능해요!', petPolicy: facts }, parsers);
    expect(p.mergedBadges).toEqual([]);
    expect(p.flags).toContain('AI 판단 보정');
    expect(p.corrections).toEqual(['무게 상한 10kg 이 원문에 없어 뺐어요']);
  });
  it('원문은 있는데 아무도 못 읽으면 level 이 못읽음이고 앱 배지가 원문 확인을 말한다', () => {
    const p = previewPolicy({ petPolicyText: '사장님 강아지랑 같이 놀아요' }, parsers);
    expect(p.level).toBe('못읽음');
    expect(p.mergedBadges).toEqual(['원문 확인 필요']);
  });
  it('동반 불가 문장은 level 이 동반불가', () => {
    expect(previewPolicy({ petPolicyText: '애견동반은 아쉽게도 안됩니다' }, parsers).level).toBe('동반불가');
  });
});

describe('표식·출력·id', () => {
  it('groupFlags — 지역·좌표 없음, 목록글, 중복표시', () => {
    const g = groupCandidates([row('a', '카페', { regionRaw: null, visited: false, dupOf: 'x' })])[0];
    expect(groupFlags(g)).toEqual(['지역 없음', '좌표 없음', '목록글', '중복표시']);
  });
  it('formatGroup 기본 출력에는 evidence·원문이 없고 verbose 에만 있다', () => {
    const g = groupCandidates([row('abcdef12-0000', '카페', { petPolicyText: '리드줄 필수' })])[0];
    const p = previewPolicy(g.lead.extracted, parsers);
    const plain = formatGroup(g, p);
    expect(plain).toContain('■ 카페');
    expect(plain).toContain('abcdef12');
    expect(plain).not.toContain('인용문');
    expect(plain).not.toContain('리드줄 필수');
    const verbose = formatGroup(g, p, { verbose: true });
    expect(verbose).toContain('인용문');
    expect(verbose).toContain('원문: 리드줄 필수');
    expect(formatMarkdown([g], new Map([[g.key, p]]))).toContain('> 인용문');
  });
  it('resolveIds — 앞자리로 고르되 없거나 둘 이상이면 따로', () => {
    const rows = [row('abc123', '가'), row('abd456', '나'), row('abc789', '다')];
    expect(resolveIds(rows, ['abd', 'abc1', 'zzz', 'abc']).found.map((r) => r.id)).toEqual(['abd456', 'abc123']);
    expect(resolveIds(rows, ['zzz']).missing).toEqual(['zzz']);
    expect(resolveIds(rows, ['abc']).ambiguous).toEqual(['abc']);
  });
  it('parseReviewArgs — 기본은 list, approve/reject 는 id 나 --tier, reject 는 --note 필수', () => {
    expect(parseReviewArgs([]).command).toBe('list');
    expect(parseReviewArgs(['--tier', 'new', '--limit', '5', '-v']).tier).toBe('new');
    expect(parseReviewArgs(['approve', 'ab', 'cd', '--merge-into', 'p1'])).toMatchObject({ command: 'approve', ids: ['ab', 'cd'], mergeInto: 'p1' });
    expect(parseReviewArgs(['approve', '--tier', 'auto']).tier).toBe('auto');
    expect(() => parseReviewArgs(['approve'])).toThrow();
    expect(() => parseReviewArgs(['reject', 'ab'])).toThrow(/note/);
    expect(() => parseReviewArgs(['--tier', 'x'])).toThrow();
    expect(() => parseReviewArgs(['bogus'])).toThrow();
  });
});
