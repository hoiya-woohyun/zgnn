import { describe, expect, it } from 'vitest';
import {
  buildProposeCliArgs,
  buildProposePrompt,
  countConflicts,
  PROPOSE_PROMPT_VERSION,
  proposalTargets,
  proposeForPlace,
  resolveProposeModel,
  sanitizeProposal,
} from './proposePlaces.mjs';
import { createUsageMeter } from './extractPlaces.mjs';

const place = {
  id: 'p1', name: '솔숲펜션', type: 'stay', pet_policy_text: '대형견 가능, 1마리당 2만원', pet_policy: null,
  stay_price_text: '1박 15만원', features: '사람이 쓴 소개', category: '펜션', verified_at: null,
};

const facts = { indoor: 'free', leash: false, largeDogOk: false, smallDogOnly: false, callFirst: false, feeFree: false, weightLimitKg: 10, maxDogs: null, notes: null };

const row = (url, postedAt, extracted) => ({ id: url, post_url: url, blog_posts: { posted_at: postedAt }, extracted: { visited: true, evidence: [], ...extracted } });
const A = row('https://blog/a', '2025-11-02', { petPolicyText: '대형견 가능해요', evidence: ['마당이 넓어요'] });
const B = row('https://blog/b', '2026-08-01', { petPolicyText: '이제 10kg 이하만 받아요', petPolicy: facts, evidence: ['사장님이 10kg 이하만 된대요'] });
const rows = [A, B];

const change = (over) => ({ field: 'pet_policy_text', action: 'change', value: '10kg 이하만 동반 가능', basedOn: ['https://blog/b'], quote: '이제 10kg 이하만 받아요', why: '최신 글이 무게 제한을 말한다', ...over });

describe('buildProposePrompt — 구조값만, 새 글이 위', () => {
  it('사이트 값과 글들의 구조값을 싣고 본문은 없다', () => {
    const prompt = buildProposePrompt(place, rows);
    expect(prompt.indexOf('https://blog/b')).toBeLessThan(prompt.indexOf('https://blog/a'));
    expect(prompt).toContain('대형견 가능, 1마리당 2만원');
    expect(prompt).not.toContain('--- 본문 ---');
  });
  it("교차점검 표식은 verifyLabel 과 같은 갈래 — 동반 표기만과 동반 확인을 가른다(2026-10-04)", () => {
    const prompt = (verify) => buildProposePrompt(place, [row('https://blog/v', '2026-09-01', { verify })]);
    expect(prompt({ petAllowedHere: 'yes', dogWasThere: false, quote: 'q', why: null })).toContain('동반 표기만');
    expect(prompt({ petAllowedHere: 'yes', dogWasThere: true, quote: 'q', why: null })).toContain('동반 확인');
    expect(prompt({ petAllowedHere: 'unclear', dogWasThere: false, quote: null, why: null })).toContain('동반 근거 없음');
    expect(prompt(null)).toContain('미점검');
  });
  it('인자는 고정값 · 모델은 PROPOSE_MODEL 로 덮인다', () => {
    expect(buildProposeCliArgs()).toEqual(buildProposeCliArgs());
    expect(resolveProposeModel({ PROPOSE_MODEL: 'x-model' })).toBe('x-model');
    expect(PROPOSE_PROMPT_VERSION).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('sanitizeProposal — 지어내지 않는다', () => {
  it('근거가 맞는 change 는 남고, 조건 원문 change 에 근거 글의 판단이 붙는다(원문에 대 본 것)', () => {
    const out = sanitizeProposal({ summary: '무게 제한이 생겼다', fields: [change()] }, rows);
    expect(out.fields.pet_policy_text).toMatchObject({ action: 'change', value: '10kg 이하만 동반 가능', basedOn: ['https://blog/b'] });
    expect(out.fields.pet_policy_text.petPolicy.weightLimitKg).toBe(10);
    expect(out.superseded).toBe(false);
  });
  it('근거 없는 change → keep', () => {
    expect(sanitizeProposal({ fields: [change({ basedOn: [] })] }, rows).fields.pet_policy_text.action).toBe('keep');
    expect(sanitizeProposal({ fields: [change({ basedOn: ['https://elsewhere'] })] }, rows).fields.pet_policy_text.action).toBe('keep');
  });
  it('인용이 근거 글의 값에 없으면 keep — why 에 남는다', () => {
    const out = sanitizeProposal({ fields: [change({ quote: '대형견 절대 불가' })] }, rows).fields.pet_policy_text;
    expect(out.action).toBe('keep');
    expect(out.why).toContain('인용이 근거 글에 없어');
  });
  it('features change 는 append(덧붙일 한 문장)', () => {
    const out = sanitizeProposal({ fields: [change({ field: 'features', value: '테라스가 새로 생겼어요', quote: '사장님이 10kg 이하만 된대요' })] }, rows);
    expect(out.fields.features.action).toBe('append');
  });
  it('주소 등 제안 밖의 칸은 버린다', () => {
    const out = sanitizeProposal({ fields: [change({ field: 'address', value: '어딘가' })] }, rows);
    expect(out.fields).toEqual({});
  });
  it('두 글이 다른 조건을 말하면 conflicts 1(모델 값이 아니라 코드가 센다)', () => {
    const out = sanitizeProposal({ fields: [], conflicts: [] }, rows);
    expect(out.conflicts).toEqual([{ field: 'pet_policy_text', posts: ['https://blog/a', 'https://blog/b'] }]);
    expect(countConflicts([A])).toEqual([]);
  });
});

describe('proposeForPlace · proposalTargets', () => {
  it('부르고 계량기에 싣는다 · 후보가 없으면 부르지 않는다', async () => {
    const meter = createUsageMeter('제안');
    const stdout = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: { summary: 's', fields: [change()] }, usage: { input_tokens: 10 } });
    const out = await proposeForPlace(async () => stdout, place, rows, meter);
    expect(out.fields.pet_policy_text.action).toBe('change');
    expect(meter.totals().calls).toBe(1);
    let called = false;
    expect(await proposeForPlace(async () => { called = true; return stdout; }, place, [], meter)).toBeNull();
    expect(called).toBe(false);
  });
  it('JSON 이 아니면 던진다', async () => {
    await expect(proposeForPlace(async () => 'nope', place, rows, null)).rejects.toThrow(/JSON 이 아님/);
  });
  it('가장 새 글의 행에 싣고, 살아 있는 옛 제안은 superseded 로', () => {
    const old = { ...A, extracted: { ...A.extracted, proposal: { superseded: false } } };
    const dead = row('https://blog/c', '2024-01-01', { proposal: { superseded: true } });
    const { target, supersede } = proposalTargets([old, B, dead]);
    expect(target.post_url).toBe('https://blog/b');
    expect(supersede.map((r) => r.post_url)).toEqual(['https://blog/a']);
  });
});
