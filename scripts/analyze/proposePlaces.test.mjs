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
import { policyFingerprint } from '../lib/petPolicyGuide.mjs';

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
  it('인자는 고정값 · 모델은 Opus 고정(ANALYZE_MODEL 을 따라가지 않는다) · PROPOSE_MODEL 로만 덮인다', () => {
    expect(buildProposeCliArgs()).toEqual(buildProposeCliArgs());
    expect(resolveProposeModel({})).toBe('claude-opus-5');
    expect(resolveProposeModel({ ANALYZE_MODEL: 'claude-sonnet-5-5' })).toBe('claude-opus-5');
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

/**
 * 이용 안내(docs/todo/21 S4) — 지문(`basis`)은 이 패스만 찍는다. 남을 원문에 가드를 대 보고, 남을 판단의 지문을 붙인다.
 * 근거 글·인용은 맞게 둔다 — keep 이 가드 때문인지(근거·인용 때문이 아닌지) `why` 로 확인한다.
 */
describe('sanitizeProposal — 이용 안내(21 S4)', () => {
  const guideChange = (over) => ({
    field: 'pet_policy_guide', action: 'change', value: '입구에 발 닦을 수건이 준비돼 있어요', basedOn: ['https://blog/a'], quote: '마당이 넓어요', why: '글이 준비물을 말한다', ...over,
  });
  const sitePolicy = { ...facts, weightLimitKg: null, leash: true };
  const site = { ...place, pet_policy: sitePolicy };

  it('원문이 change 면 지문은 제안 판단(원문에 대 본 것)의 것', () => {
    const out = sanitizeProposal({ fields: [guideChange(), change()] }, rows, { place: site });
    expect(out.fields.pet_policy_guide).toMatchObject({ action: 'change', value: '입구에 발 닦을 수건이 준비돼 있어요', basedOn: ['https://blog/a'] });
    expect(out.fields.pet_policy_guide.basis).toBe(policyFingerprint(out.fields.pet_policy_text.petPolicy));
  });

  it('원문이 keep(또는 말 없음)이면 지문은 사이트 판단의 것', () => {
    const out = sanitizeProposal({ fields: [guideChange()] }, rows, { place: site });
    expect(out.fields.pet_policy_guide.basis).toBe(policyFingerprint(sitePolicy));
    const kept = sanitizeProposal({ fields: [guideChange(), change({ action: 'keep' })] }, rows, { place: site });
    expect(kept.fields.pet_policy_guide.basis).toBe(policyFingerprint(sitePolicy));
  });

  it('판단 주제를 말하면 keep — why 끝에 가드의 이유', () => {
    const out = sanitizeProposal({ fields: [guideChange({ value: '주문할 때 예방접종 날짜를 물어봐요' })] }, rows, { place: site }).fields.pet_policy_guide;
    expect(out.action).toBe('keep');
    expect(out.basis).toBeUndefined();
    expect(out.why).toContain('글이 준비물을 말한다 · 안내가 가드를 못 지나 그대로 둔다(');
    expect(out.why).toContain('판단 칸이 말하는 주제예요(접종)');
  });

  it('남을 원문을 15자 넘게 옮기면 keep', () => {
    const long = { ...site, pet_policy_text: '사장님께 미리 말씀드리면 안쪽 자리를 따로 내어 주세요' };
    const out = sanitizeProposal({ fields: [guideChange({ value: '사장님께 미리 말씀드리면 안쪽 자리를 내어 줘요' })] }, rows, { place: long }).fields.pet_policy_guide;
    expect(out.action).toBe('keep');
    expect(out.why).toContain('원문을 그대로 옮겼어요');
  });

  it('근거·인용 검사는 그대로 먼저 · 글마다 다른 안내는 충돌로 세지 않는다', () => {
    expect(sanitizeProposal({ fields: [guideChange({ quote: '지어낸 문장' })] }, rows, { place: site }).fields.pet_policy_guide.why).toContain('인용이 근거 글에 없어');
    expect(countConflicts(rows).map((c) => c.field)).toEqual(['pet_policy_text']);
  });

  it('사이트 값에 안내는 문장만 싣는다(지문은 모델에게 뜻이 없다)', () => {
    const prompt = buildProposePrompt({ ...place, pet_policy_guide: { text: '사이트 안내 문장', basis: 'abcdef0123' } }, rows);
    expect(prompt).toContain('"pet_policy_guide": "사이트 안내 문장"');
    expect(prompt).not.toContain('abcdef0123');
    expect(buildProposePrompt(place, rows)).toContain('"pet_policy_guide": null');
  });

  it('proposeForPlace 는 장소 행을 넘겨 지문을 사이트 판단으로 찍는다', async () => {
    const stdout = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: { summary: 's', fields: [guideChange()] } });
    const out = await proposeForPlace(async () => stdout, site, rows, null);
    expect(out.fields.pet_policy_guide.basis).toBe(policyFingerprint(sitePolicy));
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
