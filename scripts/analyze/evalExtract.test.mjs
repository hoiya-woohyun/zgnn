import { describe, expect, it } from 'vitest';
import { judgeEligibility } from '../../src/lib/eligibility';
import { parsePetPolicy, withPolicyFacts } from '../../src/lib/petPolicy';
import places from '../../src/data/places.json' with { type: 'json' };
import {
  buildGoldenEntry,
  classifyField,
  compareVariants,
  diffSummaries,
  findPredicted,
  formatComparison,
  formatReport,
  formatSummary,
  groundedFields,
  groundlessRecovery,
  parseEvalArgs,
  parseReviewUrl,
  parserDrift,
  predictedPolicy,
  scoreEntry,
  selectTargets,
  summarize,
  variantTag,
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

const aiPlace = (over = {}) => ({ name: '솔숲펜션', type: 'stay', isJeju: true, petAllowed: 'yes', petPolicyText: null, petPolicy: null, ...over });

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
    expect(r).toMatchObject({ dropped: true, dropReason: 'notAllowed' });
    expect(r.fields.find((f) => f.field === 'petAllowed').outcome).toBe('틀림');
    expect(r.verdicts.every((v) => v.predicted === 'hard')).toBe(true);
  });

  it('제주 밖·종류 other 도 운영 분석처럼 탈락으로 센다', () => {
    const notJeju = scoreEntry(golden, { places: [aiPlace({ isJeju: false })] }, fns);
    const other = scoreEntry(golden, { places: [aiPlace({ type: 'other' })] }, fns);
    expect(notJeju.dropReason).toBe('notJeju');
    expect(other.dropReason).toBe('other');
    expect(summarize([notJeju, other]).dropReasons).toEqual({ notJeju: 1, other: 1, notAllowed: 0 });
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

describe('groundedFields — 사람 값이 글 본문에 적혀 있나', () => {
  const exp = (text) => parsePetPolicy(text);

  it('무게·마릿수·요금: 숫자+단위가 글에 있어야 근거 있음(표기 변형·공백 허용)', () => {
    const e = exp('10kg 이하 2마리까지 가능. 1마리당 2만원.');
    expect(groundedFields(e, '체중 10 키로 이하, 두 마리까지, 반려견 20,000원')).toMatchObject({ weightLimitKg: true, maxDogs: true, feeAmountsWon: true });
    expect(groundedFields(e, '강아지랑 같이 가기 좋은 곳이에요. 사진으로 안내드려요')).toMatchObject({ weightLimitKg: false, maxDogs: false, feeAmountsWon: false });
  });

  it('숫자는 다른 숫자의 일부로 맞지 않는다(110kg ≠ 10kg)', () => {
    const e = exp('10kg 이하');
    expect(groundedFields(e, '최대 110kg')).toMatchObject({ weightLimitKg: false });
  });

  it('요금: 1.5만원 · 1만5천원 · 15,000원 을 같은 금액으로 본다', () => {
    const e = exp('1.5만원');
    for (const body of ['추가 1.5만원', '1만 5천원', '15,000원', '15000원']) expect(groundedFields(e, body).feeAmountsWon).toBe(true);
  });

  it('불리언: golden 이 true 인 칸만, 낱말이 있으면 근거 있음', () => {
    const e = exp('방문 전 전화 문의 필수. 대형견 가능.');
    expect(groundedFields(e, '예약 전화 주세요. 대형견도 환영')).toMatchObject({ callFirst: true, largeDogOk: true });
    const g = groundedFields(e, '분위기가 좋아요');
    expect(g.callFirst).toBe(false);
    expect(g.largeDogOk).toBe(false);
    expect('leash' in g).toBe(false);
  });

  it('golden 이 비어 있는 칸은 결과에 없다', () => {
    expect(groundedFields(exp('주차 가능'), '아무 글')).toEqual({});
  });
});

describe('scoreEntry — 근거없음', () => {
  const entry = () => buildGoldenEntry(seed({ petPolicyText: '10kg 이하 2마리까지 가능' }), parsePetPolicy);
  const extraction = { places: [aiPlace({ petPolicyText: '소형견 동반 가능', petPolicy: facts() })] };
  const field = (r, name) => r.fields.find((f) => f.field === name);

  it('글에 없는 사람 값을 못 맞힌 놓침은 근거없음으로 빠지고 분모에서 빠진다', () => {
    const r = scoreEntry(entry(), extraction, fns, '사진으로 안내합니다');
    expect(field(r, 'weightLimitKg')).toMatchObject({ outcome: '근거없음', grounded: false });
    expect(field(r, 'maxDogs').outcome).toBe('근거없음');
    expect(r.bodyKnown).toBe(true);
    const s = summarize([r]);
    expect(s.fields.weightLimitKg).toMatchObject({ n: 0, 근거없음: 1, 놓침: 0 });
  });

  it('글에 근거가 있으면 놓침 그대로', () => {
    const r = scoreEntry(entry(), extraction, fns, '체중 10kg 이하, 2마리까지');
    expect(field(r, 'weightLimitKg')).toMatchObject({ outcome: '놓침', grounded: true });
    expect(summarize([r]).fields.weightLimitKg).toMatchObject({ n: 1, 놓침: 1, 근거없음: 0 });
  });

  it('본문이 없으면(null) 옛 방식 그대로 — 근거 판정을 하지 않는다', () => {
    const r = scoreEntry(entry(), extraction, fns, null);
    expect(field(r, 'weightLimitKg')).toMatchObject({ outcome: '놓침', grounded: null });
    expect(r.bodyKnown).toBe(false);
  });

  it('review 판정이 있으면 자동 분류보다 이긴다', () => {
    const e = { ...entry(), review: { weightLimitKg: { verdict: 'site' } } };
    expect(field(scoreEntry(e, extraction, fns, '사진 안내'), 'weightLimitKg').outcome).toBe('놓침');
  });

  it('지어냄은 근거와 무관하게 그대로다', () => {
    const e = buildGoldenEntry(seed({ petPolicyText: '동반 가능' }), parsePetPolicy);
    const ex = { places: [aiPlace({ petPolicyText: '동반 가능, 10kg 이하', petPolicy: facts({ weightLimitKg: 10 }) })] };
    expect(field(scoreEntry(e, ex, fns, '본문'), 'weightLimitKg').outcome).toBe('지어냄');
  });

  it('뒤집힘이 근거없음 칸 때문에만이면 sourceOnly 로 센다', () => {
    const r = scoreEntry(entry(), extraction, fns, '사진 안내');
    const diff = r.fields.filter((f) => f.outcome !== 'agree' && f.outcome !== 'excluded');
    const flipped = r.verdicts.some((v) => v.golden !== v.predicted);
    const s = summarize([r]);
    expect(s.verdictFlips.places).toBe(flipped ? 1 : 0);
    expect(s.verdictFlips.sourceOnly).toBe(flipped && diff.every((f) => f.outcome === '근거없음') ? 1 : 0);
    expect(s.verdictFlips.groundedBasis).toBe(s.verdictFlips.places - s.verdictFlips.sourceOnly);
  });
});

describe('parseEvalArgs — pnpm data:eval 인자', () => {
  it('기본값 — 텍스트만, 상한 없음, 사진 8장', () => {
    expect(parseEvalArgs(['extract'])).toMatchObject({ command: 'extract', images: false, maxImages: 8, limit: Infinity, only: [], prompt: null });
  });

  it('--images · --max-images(사진을 같이 켠다) · --limit · --only 여럿', () => {
    expect(parseEvalArgs(['extract', '--images', '--limit', '2', '--only', '웨스티하우스', '쉼멍스테이'])).toMatchObject({
      images: true, maxImages: 8, limit: 2, only: ['웨스티하우스', '쉼멍스테이'],
    });
    expect(parseEvalArgs(['score', '--max-images', '4'])).toMatchObject({ images: true, maxImages: 4 });
    expect(parseEvalArgs(['extract'], { defaultMaxImages: 6 }).maxImages).toBe(6);
  });

  it('compare 는 늘 사진 쪽을 본다', () => {
    expect(parseEvalArgs(['compare', '--prompt', 'abc'])).toMatchObject({ command: 'compare', images: true, prompt: 'abc' });
  });

  it('잘못된 인자는 던진다', () => {
    expect(() => parseEvalArgs(['nope'])).toThrow(/모르는 명령/);
    expect(() => parseEvalArgs(['extract', '--max-images', '0'])).toThrow(/1 이상/);
    expect(() => parseEvalArgs(['extract', '--limit', 'x'])).toThrow(/1 이상/);
    expect(() => parseEvalArgs(['extract', '--only'])).toThrow(/--only/);
    expect(() => parseEvalArgs(['extract', '--wat'])).toThrow(/모르는 인자/);
  });

  it('selectTargets — --only 는 placeId · 이름 · logNo(캐시 파일 이름) 어느 것이든', () => {
    const es = [{ placeId: 'p1', name: '가', logNo: '111' }, { placeId: 'p2', name: '나', logNo: '222' }, { placeId: 'p3', name: '다', logNo: '333' }];
    expect(selectTargets(es, []).length).toBe(3);
    expect(selectTargets(es, ['p1', '나', '333']).map((e) => e.placeId)).toEqual(['p1', 'p2', 'p3']);
    expect(selectTargets(es, ['999'])).toEqual([]);
  });

  it('variantTag — 캐시 폴더 가운데 이름', () => {
    expect(variantTag({ images: false, maxImages: 8 })).toBe('');
    expect(variantTag({ images: true, maxImages: 8 })).toBe('img8');
  });
});

describe('사진 실험 — 회수 · 지어냄 · 토큰 비교', () => {
  const entry = () => buildGoldenEntry(seed({ petPolicyText: '10kg 이하 2마리까지 가능' }), parsePetPolicy);
  const body = '사진으로 안내합니다';
  const textOnly = { places: [aiPlace({ petPolicyText: '소형견 동반 가능', petPolicy: facts() })] };
  const withPhoto = { places: [aiPlace({ petPolicyText: '10kg 이하 2마리까지 가능\n리드줄 필수', petPolicy: facts({ weightLimitKg: 10, maxDogs: 2, leash: true }) })] };
  const usage = (input, output) => ({ calls: 1, input, output, cacheRead: 0, cacheWrite: 0 });

  it('groundlessRecovery — 글에 근거 없던 사람 칸 중 AI 가 맞힌 수', () => {
    expect(groundlessRecovery(scoreEntry(entry(), textOnly, fns, body))).toEqual({ ungrounded: 2, recovered: 0 });
    expect(groundlessRecovery(scoreEntry(entry(), withPhoto, fns, body))).toEqual({ ungrounded: 2, recovered: 2 });
    expect(groundlessRecovery({ status: 'notFound' })).toEqual({ ungrounded: 0, recovered: 0 });
  });

  it("review 'ai' 로 일치가 된 칸은 회수로 세지 않는다", () => {
    const e = { ...entry(), review: { weightLimitKg: { verdict: 'ai' } } };
    expect(groundlessRecovery(scoreEntry(e, textOnly, fns, body))).toEqual({ ungrounded: 2, recovered: 0 });
  });

  it('compareVariants — 같은 글끼리, 사진 쪽에만 생긴 지어냄과 토큰을 같이', () => {
    const t = [{ ...scoreEntry(entry(), textOnly, fns, body), usage: usage(1000, 300), costUsd: 0.01 }, { ...scoreEntry({ ...entry(), placeId: 'p2' }, null, fns), usage: null }];
    const i = [
      { ...scoreEntry(entry(), withPhoto, fns, body), usage: usage(9000, 400), costUsd: 0.05, imagesSent: 3, addendumVersion: 'v1' },
      { ...scoreEntry({ ...entry(), placeId: 'p2' }, textOnly, fns, body), usage: usage(1, 1), imagesSent: 0 },
    ];
    const c = compareVariants(t, i, { promptVersion: 'abc', model: 'm', maxImages: 8 });
    // p2 는 텍스트 쪽 추출이 없어 빠진다.
    expect(c.n).toBe(1);
    expect(c.text).toMatchObject({ ungrounded: 2, recovered: 0, invented: 0, tokens: { known: 1, input: 1000, output: 300, costUsd: 0.01 } });
    expect(c.img).toMatchObject({ ungrounded: 2, recovered: 2, invented: 1, tokens: { known: 1, input: 9000, output: 400, costUsd: 0.05 } });
    expect(c.newlyInvented).toEqual([{ name: '솔숲펜션', field: 'leash', predicted: true, aiText: '10kg 이하 2마리까지 가능\n리드줄 필수' }]);
    expect(c.posts[0]).toMatchObject({ imagesSent: 3, text: { recovered: 0 }, img: { recovered: 2, tokens: { input: 9000, output: 400 } } });
    expect(c.fellBack).toEqual([]);

    const lines = formatComparison(c).join('\n');
    expect(lines).toContain('회수): 텍스트 0/2 → 사진 2/2');
    expect(lines).toContain('지어냄(칸 합): 텍스트 0 → 사진 1');
    expect(lines).toContain('1쌍 기준): 텍스트 1000/300 → 사진 9000/400');
    expect(lines).toContain('leash = true');
  });

  it('토큰·비용은 양쪽 다 기록된 글로만 센다 — 한쪽만 있으면 양쪽에서 다 뺀다', () => {
    const a = scoreEntry(entry(), textOnly, fns, body);
    const b = scoreEntry({ ...entry(), placeId: 'p2' }, textOnly, fns, body);
    const t = [{ ...a, usage: usage(1000, 100), costUsd: 0.01 }, { ...b, usage: null, costUsd: null }];
    const i = [{ ...a, usage: usage(5000, 100), costUsd: 0.04, imagesSent: 2 }, { ...b, usage: usage(7000, 100), costUsd: 0.06, imagesSent: 2 }];
    const c = compareVariants(t, i);
    expect(c.n).toBe(2);
    expect(c.text.tokens).toEqual({ known: 1, input: 1000, output: 100, costUsd: 0.01 });
    expect(c.img.tokens).toEqual({ known: 1, input: 5000, output: 100, costUsd: 0.04 });
    expect(formatComparison(c).join('\n')).toContain('2곳 중 1쌍만');
  });

  it('사진을 못 받아 텍스트로 부른 글은 짚는다', () => {
    const r = { ...scoreEntry(entry(), textOnly, fns, body) };
    const c = compareVariants([r], [{ ...r, imagesSent: 0 }]);
    expect(c.fellBack).toEqual(['솔숲펜션']);
    expect(formatComparison(c).join('\n')).toContain('텍스트로만 부른 글 1곳');
  });
});
