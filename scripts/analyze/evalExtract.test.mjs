import { describe, expect, it } from 'vitest';
import { judgeEligibility } from '../../src/lib/eligibility';
import { parsePetPolicy, withPolicyFacts } from '../../src/lib/petPolicy';
import places from '../../src/data/places.json' with { type: 'json' };
import {
  buildGoldenEntry,
  classifyField,
  diffSummaries,
  findPredicted,
  formatReport,
  formatSummary,
  parseReviewUrl,
  parserDrift,
  predictedPolicy,
  scoreEntry,
  summarize,
} from './evalExtract.mjs';

const fns = { parsePetPolicy, withPolicyFacts, judgeEligibility };

/** AI 판단(TPetPolicyFacts) — 스키마가 모든 칸을 요구하므로 기본값을 채워 둔다. */
const facts = (over = {}) => ({
  indoor: 'unknown', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, vaccineRequired: false,
  feeFree: null, fees: [], weightLimitKg: null, maxDogs: null, notes: null, ...over,
});

const seed = (over = {}) => ({
  id: 'p1', type: 'stay', name: '솔숲펜션', region: { raw: '동쪽 (구좌읍)' },
  petPolicyText: '1~5kg 1만원.\n6~10kg 1.5만원.', reviewUrl: 'https://blog.naver.com/someone/223444269811', ...over,
});

const aiPlace = (over = {}) => ({ name: '솔숲펜션', type: 'stay', petAllowed: 'yes', petPolicyText: null, petPolicy: null, ...over });

describe('parseReviewUrl', () => {
  it('blogId·logNo 를 뽑는다', () => {
    expect(parseReviewUrl('https://blog.naver.com/abc/123')).toEqual({ blogId: 'abc', logNo: '123' });
    expect(parseReviewUrl('https://m.blog.naver.com/abc/123?x=1')).toEqual({ blogId: 'abc', logNo: '123' });
    expect(parseReviewUrl('https://naver.me/xyz')).toBeNull();
  });

  it('시드 86곳 전부 읽히고 글이 겹치지 않는다', () => {
    const ids = places.map((p) => parseReviewUrl(p.reviewUrl));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids.map((i) => i.logNo)).size).toBe(places.length);
  });
});

describe('buildGoldenEntry', () => {
  it('사람 문장을 정규식으로 읽은 값 전부를 expected 로, review 는 null', () => {
    const e = buildGoldenEntry(seed(), parsePetPolicy);
    expect(e).toMatchObject({ placeId: 'p1', name: '솔숲펜션', blogId: 'someone', logNo: '223444269811', regionRaw: '동쪽 (구좌읍)', review: null });
    expect(e.expected.feeLines.length).toBe(2);
    expect(parserDrift([e], parsePetPolicy)).toEqual([]);
  });

  it('파서 결과가 달라지면 표류로 잡는다', () => {
    const e = buildGoldenEntry(seed(), parsePetPolicy);
    expect(parserDrift([{ ...e, expected: { ...e.expected, leash: true } }], parsePetPolicy)).toEqual(['솔숲펜션']);
  });
});

describe('classifyField', () => {
  it('방향을 가른다 — 없음→있음은 지어냄, 있음→없음은 놓침, 둘 다 있고 다르면 틀림', () => {
    expect(classifyField(false, false)).toBe('agree');
    expect(classifyField(null, 10)).toBe('지어냄');
    expect(classifyField(false, true)).toBe('지어냄');
    expect(classifyField('unknown', 'cage')).toBe('지어냄');
    expect(classifyField([], [10000])).toBe('지어냄');
    expect(classifyField(10, null)).toBe('놓침');
    expect(classifyField('free', 'unknown')).toBe('놓침');
    expect(classifyField(10, 15)).toBe('틀림');
    expect(classifyField('stay', 'cafe')).toBe('틀림');
    expect(classifyField([10000, 15000], [10000, 15000])).toBe('agree');
  });
});

describe('findPredicted', () => {
  it('키 일치 → 지점 꼬리 → 포함 순, 글의 다른 장소는 무시한다', () => {
    expect(findPredicted('솔숲펜션', [{ name: '다른곳' }, { name: '솔숲 펜션' }])).toMatchObject({ how: 'exact', ambiguous: false, place: { name: '솔숲 펜션' } });
    expect(findPredicted('레스토랑 성산점', [{ name: '레스토랑 제주성산점' }])?.how).toBe('branch');
    expect(findPredicted('평대반점(바당반점)', [{ name: '바당반점' }])?.how).toBe('exact');
    expect(findPredicted('웨스티하우스', [{ name: '제주 웨스티하우스 독채' }])?.how).toBe('contains');
    expect(findPredicted('솔숲펜션', [{ name: '바다카페' }])).toBeNull();
  });

  it('여럿이 맞으면 첫째를 쓰고 표시한다', () => {
    expect(findPredicted('솔숲펜션', [{ name: '솔숲펜션' }, { name: '솔숲 펜션' }])?.ambiguous).toBe(true);
  });
});

describe('predictedPolicy', () => {
  it('원문을 셋째 인자로 넘긴다 — 빠지면 근거 없는 판단으로 다 지워진다', () => {
    const p = predictedPolicy(aiPlace({ petPolicyText: '10kg 이하만 가능해요', petPolicy: facts({ weightLimitKg: 10 }) }), fns);
    expect(p.weightLimitKg).toBe(10);
  });
});

describe('scoreEntry', () => {
  const golden = buildGoldenEntry(seed({ petPolicyText: '10kg 이하 소형견만 가능. 리드줄 필수' }), parsePetPolicy);

  it('추출 캐시가 없으면 noExtraction, 짝이 없으면 notFound', () => {
    expect(scoreEntry(golden, null, fns).status).toBe('noExtraction');
    const r = scoreEntry(golden, { places: [aiPlace({ name: '바다카페' })] }, fns);
    expect(r).toMatchObject({ status: 'notFound', predictedNames: ['바다카페'] });
  });

  it('놓친 조건은 놓침으로, 판정이 바뀌면 뒤집힘으로 센다', () => {
    const r = scoreEntry(golden, { places: [aiPlace({ petPolicyText: '강아지 동반 가능', petPolicy: facts() })] }, fns);
    expect(r.status).toBe('found');
    const by = Object.fromEntries(r.fields.map((f) => [f.field, f.outcome]));
    expect(by.weightLimitKg).toBe('놓침');
    expect(by.leash).toBe('놓침');
    expect(by.type).toBe('agree');
    // 28kg 은 golden 에서 어려움(10kg 상한)인데 AI 정책으로는 아니다.
    expect(r.verdicts.find((v) => v.profile === 'large28')).toMatchObject({ golden: 'hard' });
    expect(r.verdicts.some((v) => v.golden !== v.predicted)).toBe(true);
  });

  it('원문에 근거가 있는 같은 판단이면 일치', () => {
    const r = scoreEntry(golden, {
      places: [aiPlace({ petPolicyText: '10kg 이하 소형견만 가능. 리드줄 필수', petPolicy: facts({ weightLimitKg: 10, leash: true, smallDogOnly: true }) })],
    }, fns);
    expect(r.fields.find((f) => f.field === 'weightLimitKg').outcome).toBe('agree');
    expect(r.fields.find((f) => f.field === 'leash').outcome).toBe('agree');
  });

  it("petAllowed 'no' 는 후보가 안 생기는 것 — 판정은 전부 어려움", () => {
    const r = scoreEntry(golden, { places: [aiPlace({ petAllowed: 'no' })] }, fns);
    expect(r.dropped).toBe(true);
    expect(r.fields.find((f) => f.field === 'petAllowed').outcome).toBe('틀림');
    expect(r.verdicts.every((v) => v.predicted === 'hard')).toBe(true);
  });

  it("review 가 'ai' 면 AI 쪽이 맞은 것(사이트 오류 후보), 'unclear' 면 세지 않는다", () => {
    const reviewed = { ...golden, review: { weightLimitKg: { verdict: 'ai', note: '' }, leash: { verdict: 'unclear', note: '' } } };
    const r = scoreEntry(reviewed, { places: [aiPlace({ petPolicyText: '강아지 동반 가능', petPolicy: facts() })] }, fns);
    expect(r.fields.find((f) => f.field === 'weightLimitKg')).toMatchObject({ outcome: 'agree', siteError: true });
    expect(r.fields.find((f) => f.field === 'leash').outcome).toBe('excluded');
    const s = summarize([r]);
    expect(s.fields.weightLimitKg).toMatchObject({ n: 1, agree: 1, siteError: 1 });
    expect(s.fields.leash.n).toBe(0);
  });

  it('정규식이 못 읽는 칸은 방향 없이 AI true 만 센다', () => {
    const g = buildGoldenEntry(seed({ petPolicyText: '예방접종 완료한 아이만 가능' }), parsePetPolicy);
    const r = scoreEntry(g, { places: [aiPlace({ petPolicyText: '예방접종 완료한 아이만 가능', petPolicy: facts({ vaccineRequired: true }) })] }, fns);
    expect(r.blind.find((b) => b.field === 'vaccineRequired').predicted).toBe(true);
    expect(r.fields.some((f) => f.field === 'vaccineRequired')).toBe(false);
  });

  it('요금은 원 단위 금액으로 비교한다 — 표기 차이(2만원·20,000원)는 일치', () => {
    const g = buildGoldenEntry(seed({ petPolicyText: '1마리당 20,000원' }), parsePetPolicy);
    const fee = { label: '1마리당 2만원', amountWon: 20000, basis: 'perDog', minKg: null, maxKg: null, fromDog: null, perNight: false };
    const r = scoreEntry(g, { places: [aiPlace({ petPolicyText: '1마리당 20,000원', petPolicy: facts({ feeFree: false, fees: [fee] }) })] }, fns);
    expect(r.fields.find((f) => f.field === 'feeAmountsWon')).toMatchObject({ outcome: 'agree', golden: [20000] });
  });
});

describe('summarize · 출력', () => {
  const golden = buildGoldenEntry(seed({ petPolicyText: '10kg 이하 소형견만 가능' }), parsePetPolicy);
  const results = [
    scoreEntry(golden, { places: [aiPlace({ petPolicyText: '강아지 동반 가능', petPolicy: facts() })] }, fns),
    scoreEntry({ ...golden, placeId: 'p2', name: '없는곳' }, { places: [] }, fns),
    scoreEntry({ ...golden, placeId: 'p3' }, null, fns),
  ];
  const s = summarize(results, { promptVersion: 'aaaa1111', model: 'm' });

  it('분모와 함께 센다', () => {
    expect(s).toMatchObject({ golden: 3, extracted: 2, found: 1, notFound: 1 });
    expect(s.fields.weightLimitKg).toMatchObject({ n: 1, 놓침: 1 });
    expect(s.verdictFlips.n).toBe(1);
    expect(formatSummary(s).join('\n')).toContain('weightLimitKg | 0/1 | 0/1 | 1/1 | 0/1');
  });

  it('보고서는 사람·AI 조건 문장만 인용한다', () => {
    const md = formatReport(results, s);
    expect(md).toContain('> 10kg 이하 소형견만 가능');
    expect(md).toContain('> 강아지 동반 가능');
    expect(md).toContain('글에서 이 장소를 못 찾았다');
    expect(md).toContain('추출 캐시 없음 1곳');
    expect(md).not.toContain('`p3`');
  });

  it('버전이 다른 요약과의 차이에는 소음 경고를 붙인다', () => {
    const lines = diffSummaries({ ...s, promptVersion: 'bbbb2222' }, s).join('\n');
    expect(lines).toContain('프롬프트 버전이 다르다');
    expect(lines).toContain('소음');
  });
});
