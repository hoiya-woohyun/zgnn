// AI 추출 정확도 채점(`pnpm data:eval score`). 정답은 시드 86곳 — 짱구누나가 **같은 글**(reviewUrl)을 읽고 손으로 적은 조건이다.
// 글마다 운영 추출(`extractPlaces`)을 한 번 돌려 캐시에 두고(scripts/eval-extract.mjs), 여기서는 golden 과 캐시만 읽어 비교한다 —
// Claude 호출도 I/O 도 없다. 앱 함수(parsePetPolicy·withPolicyFacts·judgeEligibility)는 주입받는다(review-candidates.mjs 의 parsers 와 같은 꼴):
// 테스트는 vitest 가 TS 를 직접 읽고, CLI 는 확장자 훅(scripts/lib/tsExtResolve.mjs)을 깔고 불러 넘긴다.
//
// 왜 이렇게 생겼나 —
//  - **golden 은 정답이 아니라 "정규식이 사람 문장을 읽은 값"** 이다. 사람이 쓴 짧은 문장은 맞지만 그걸 읽는 parsePetPolicy 는
//    무게 상한과 요금 구간을 못 가른다(`19kg 이하 1마리당 2만원` → weightLimitKg 19, petPolicy.ts withPolicyFacts 머리 주석).
//    그래서 AI 쪽 '놓침' 중 일부는 golden 의 오류다 — 사람이 `review` 로 판정해 덮는다(docs/features/extraction-eval.md).
//  - 정규식이 **아예 못 세우는 칸**(vaccineRequired · feeCharged)은 golden 이 늘 false 라 AI 의 true 를 '지어냄' 이라 부를 수 없다.
//    따로 센다(REGEX_BLIND_FIELDS).
//  - 요금은 문자열이 아니라 원 단위 금액 집합으로 비교한다 — AI 쪽은 `20,000원` → `2만원` 으로 정규화돼 저장된다.
//  - 방향이 중요하다: **지어냄**(golden 에 없는데 AI 가 세움)이 가장 비싸다 — 원문에 없는 `weightLimitKg: 10` 하나가 대형견을
//    '어려움' 으로 보낸다(BUG-009). 놓침은 '확인 필요' 쪽으로 기운다.
//  - 지표는 칸 일치율보다 **판정 뒤집힘**이다 — 고정 강아지 몇 마리로 golden 정책과 AI 정책을 각각 판정해 레벨이 다른 곳을 센다.
import { amountsInWon } from '../lib/feeLine.mjs';
import { exclusionReason } from './analyzeCandidates.mjs';
import { NAME_PARTIAL_MIN_CHARS, normalizeName, sameBranchStem, splitAliases } from './matchPlace.mjs';

/** reviewUrl(`https://blog.naver.com/<blogId>/<logNo>`) → { blogId, logNo }. 모양이 다르면 null. */
export function parseReviewUrl(url) {
  const m = /^https?:\/\/(?:m\.)?blog\.naver\.com\/([^/?#]+)\/(\d+)/.exec(url ?? '');
  return m ? { blogId: m[1], logNo: m[2] } : null;
}

/** 시드 장소 하나 → golden 항목. expected 는 parsePetPolicy 결과 전부(판정에 그대로 넣을 수 있어야 한다). */
export function buildGoldenEntry(place, parsePetPolicy) {
  const ids = parseReviewUrl(place.reviewUrl);
  if (!ids) throw new Error(`reviewUrl 모양이 다르다: ${place.name}`);
  return {
    placeId: place.id,
    name: place.name,
    type: place.type,
    regionRaw: place.region?.raw ?? null,
    reviewUrl: place.reviewUrl,
    blogId: ids.blogId,
    logNo: ids.logNo,
    petPolicyText: place.petPolicyText ?? '',
    // JSON 왕복으로 undefined 칸을 지운다 — 파일에 쓴 뒤 읽은 값과 같은 모양이어야 표류 검사(parserDrift)가 맞는다.
    expected: JSON.parse(JSON.stringify(parsePetPolicy(place.petPolicyText ?? ''))),
    review: null,
  };
}

const feeAmounts = (policy) => [...new Set((policy.feeLines ?? []).flatMap(amountsInWon))].sort((a, b) => a - b);

/** 비교하는 정책 칸. 판정(eligibility.ts)이 읽는 칸들이다 — 근거 문장(sources)·계단(tiers)은 상한 두 칸으로 대신한다. */
export const POLICY_FIELDS = {
  indoor: (p) => p.indoor,
  leash: (p) => p.leash,
  largeDogOk: (p) => p.largeDogOk,
  largeDogNo: (p) => p.largeDogNo,
  mediumDogOk: (p) => p.mediumDogOk,
  smallDogOnly: (p) => p.smallDogOnly,
  callFirst: (p) => p.callFirst,
  feeFree: (p) => p.feeFree,
  feeAmountsWon: feeAmounts,
  weightLimitKg: (p) => p.weightLimitKg ?? null,
  maxDogs: (p) => p.maxDogs ?? null,
  outdoorFree: (p) => p.outdoorFree,
  unlimitedDogs: (p) => p.unlimitedDogs,
};

/** 정규식이 세우지 않는 칸 — golden 은 늘 false 라 방향을 매길 수 없다. AI 가 세운 수만 센다. */
export const REGEX_BLIND_FIELDS = {
  vaccineRequired: (p) => p.vaccineRequired,
  feeCharged: (p) => p.feeCharged,
};

/** 판정을 돌릴 고정 강아지. 이름은 판정 레벨에 영향이 없다. */
export const DOG_PROFILES = [
  { id: 'small4', label: '4kg 소형 · 이동가방', dog: { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'bag' } },
  { id: 'medium12', label: '12kg 중형 · 이동수단 없음', dog: { dogs: [{ name: '보리', weightKg: 12 }], carrier: 'none' } },
  { id: 'large28', label: '28kg 대형 · 이동수단 없음', dog: { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' } },
  { id: 'two5and8', label: '5kg+8kg 두 마리 · 유모차', dog: { dogs: [{ name: '콩', weightKg: 5 }, { name: '팥', weightKg: 8 }], carrier: 'stroller' } },
  { id: 'small6none', label: '6kg 소형 · 이동수단 없음', dog: { dogs: [{ name: '초코', weightKg: 6 }], carrier: 'none' } },
];

/** "언급 없음" 쪽 값 — false · null · 'unknown' · 빈 배열. 방향(지어냄/놓침)을 가르는 기준이다. */
export function isEmptyValue(v) {
  return v === false || v == null || v === 'unknown' || (Array.isArray(v) && v.length === 0);
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** golden ↔ AI 한 칸 → 'agree' | '지어냄' | '놓침' | '틀림'. */
export function classifyField(golden, predicted) {
  if (same(golden, predicted)) return 'agree';
  const g = isEmptyValue(golden), p = isEmptyValue(predicted);
  if (g && !p) return '지어냄';
  if (!g && p) return '놓침';
  return '틀림';
}

/**
 * AI 가 뽑은 장소들 중 golden 장소. 별칭까지 정규화해 ① 키가 같은 것 ② 지점 꼬리만 다른 것 ③ 한쪽이 다른 쪽을 품는 것 순.
 * 글에는 다른 장소도 나온다 — 짝이 아닌 장소는 오답이 아니라 그냥 안 본다.
 * @returns {{ place: object, how: 'exact'|'branch'|'contains', ambiguous: boolean } | null}
 */
export function findPredicted(goldenName, predicted) {
  const gKeys = splitAliases(goldenName);
  const tiers = [
    ['exact', (p) => splitAliases(p.name).some((k) => gKeys.includes(k))],
    ['branch', (p) => sameBranchStem(goldenName, p.name)],
    [
      'contains',
      (p) =>
        splitAliases(p.name).some((k) =>
          gKeys.some((g) => Math.min(g.length, k.length) >= NAME_PARTIAL_MIN_CHARS && (g.includes(k) || k.includes(g))),
        ),
    ],
  ];
  for (const [how, test] of tiers) {
    const hits = predicted.filter(test);
    if (hits.length > 0) return { place: hits[0], how, ambiguous: hits.length > 1 };
  }
  return null;
}

/** AI 장소 → 앱이 쓰는 정책. places.ts 와 같은 호출이다 — 셋째 인자(원문)가 빠지면 correctPetPolicyFacts 가 판단을 전부 지운다. */
export function predictedPolicy(pred, { parsePetPolicy, withPolicyFacts }) {
  const text = pred.petPolicyText ?? '';
  return withPolicyFacts(parsePetPolicy(text), pred.petPolicy, text);
}

const squash = (t) => String(t ?? '').replace(/\s+/g, '');
const HANGUL_COUNT = { 1: '한', 2: '두', 3: '세', 4: '네' };

/** 원 단위 금액 하나가 글에 적히는 모양들 — `20000` → `2만원` · `20,000원` · `20000원` · `2만`, `15000` → `1.5만원` · `1만5천원`. 공백은 이미 지운 글에서 찾는다. */
function amountForms(won) {
  const forms = [`${won}원`, `${won.toLocaleString('en-US')}원`];
  if (won >= 10000 && won % 1000 === 0) {
    const man = Math.floor(won / 10000), rest = won % 10000;
    if (rest === 0) forms.push(`${man}만원`, `${man}만`);
    else {
      forms.push(`${won / 10000}만원`, `${man}만${rest / 1000}천원`, `${man}만${rest / 1000}천`);
      if (man === 0) forms.push(`${rest / 1000}천원`);
    }
  } else if (won < 10000 && won % 1000 === 0) forms.push(`${won / 1000}천원`);
  return forms;
}

/** 불리언 칸이 "세워졌다" 고 말하려면 글에 적혀 있어야 하는 낱말 — 앱 파서의 정규식은 export 되지 않아 **느슨한** 목록을 따로 둔다(느슨할수록 '근거 있음' 쪽 = 놓침으로 남는다). */
const KEYWORDS = {
  indoor: /실내|실외|야외|테라스|마당|룸|객실|객장|매장|홀|좌석|내부/,
  leash: /목줄|리드|하네스|줄|가슴줄/,
  largeDogOk: /대형|큰\s*강아지|큰\s*아이|kg|키로|킬로/,
  largeDogNo: /대형|큰\s*강아지|큰\s*아이|kg|키로|킬로/,
  mediumDogOk: /중형|중간|kg|키로|킬로/,
  smallDogOnly: /소형|작은\s*(강아지|아이)|kg|키로|킬로/,
  callFirst: /전화|문의|연락|예약|사전|톡톡|DM|디엠|카톡/i,
  feeFree: /무료|공짜|추가\s*(요금|비용)|비용|요금|원/,
  outdoorFree: /야외|실외|테라스|마당|잔디/,
  unlimitedDogs: /마리|제한|무제한|상관/,
};

/**
 * golden 이 세운 칸마다 그 값이 **글 본문에 근거가 있나** — 사람 조건 문장의 숫자·조건이 사진(글에 안 적힌 것)에서 왔으면 AI 가 글만 읽고는 못 맞춘다.
 * 보수적으로 센다: 확신할 수 없으면 true(= 근거 있음, 놓침으로 남긴다). false 는 "이 글에서 그 낱말·숫자를 못 찾았다" 일 때만.
 * golden 값이 비어 있는 칸은 결과에 안 넣는다(지어냄 쪽은 근거와 무관하다).
 * @param {object} expected golden.expected (parsePetPolicy 결과)  @param {string} body 글 본문
 * @returns {Record<string, boolean>}
 */
export function groundedFields(expected, body) {
  const text = squash(body);
  const has = (re) => re.test(text);
  const out = {};
  const w = expected.weightLimitKg;
  if (w != null) out.weightLimitKg = has(new RegExp(`(?<![\\d.])${w}(?:\\.0)?(?:kg|㎏|키로|킬로)`, 'i'));
  const m = expected.maxDogs;
  if (m != null) out.maxDogs = has(new RegExp(`(?<![\\d.])${m}(?:마리|두)`)) || (HANGUL_COUNT[m] != null && has(new RegExp(`${HANGUL_COUNT[m]}마리`)));
  const amounts = feeAmounts(expected);
  if (amounts.length) out.feeAmountsWon = amounts.some((won) => amountForms(won).some((f) => text.includes(f)));
  for (const [field, re] of Object.entries(KEYWORDS)) {
    if (!isEmptyValue(expected[field])) out[field] = has(re);
  }
  return out;
}

const REVIEW_VERDICTS = new Set(['site', 'ai', 'unclear']);

/** review 한 칸을 적용한 결과. 'ai' 면 AI 가 맞았다(사이트 데이터 오류 후보), 'unclear' 면 이 칸은 세지 않는다. */
function applyReview(outcome, review) {
  const verdict = REVIEW_VERDICTS.has(review?.verdict) ? review.verdict : null;
  if (verdict === 'unclear') return { outcome: 'excluded', siteError: false };
  if (verdict === 'ai' && outcome !== 'agree') return { outcome: 'agree', siteError: true };
  return { outcome, siteError: false };
}

/**
 * golden 항목 하나 + 캐시된 추출(없으면 null) → 채점 한 줄.
 * body: 글 본문(없으면 null — 근거 판정을 못 하므로 옛 방식 그대로 센다).
 * status: 'noExtraction'(아직 안 돌림·본문 없음) · 'notFound'(글에서 이 장소를 못 뽑음) · 'found'.
 */
export function scoreEntry(entry, extraction, fns, body = null) {
  const base = { placeId: entry.placeId, name: entry.name, logNo: entry.logNo, goldenText: entry.petPolicyText };
  if (!extraction || !Array.isArray(extraction.places)) return { ...base, status: 'noExtraction' };
  const match = findPredicted(entry.name, extraction.places);
  if (!match) return { ...base, status: 'notFound', predictedNames: extraction.places.map((p) => p.name) };

  const pred = match.place;
  const review = entry.review ?? {};
  const golden = entry.expected;
  const policy = predictedPolicy(pred, fns);
  const grounded = typeof body === 'string' && body.length > 0 ? groundedFields(golden, body) : null;

  const fields = [
    ['type', entry.type, pred.type],
    // 시드는 전부 동반 가능한 곳이다 — golden 은 늘 'yes'.
    ['petAllowed', 'yes', pred.petAllowed],
    ...Object.entries(POLICY_FIELDS).map(([field, get]) => [field, get(golden), get(policy)]),
  ].map(([field, g, p]) => {
    const row = { field, golden: g ?? null, predicted: p ?? null, ...applyReview(classifyField(g, p), review[field]) };
    // 글에 근거가 없는 사람 값을 못 맞힌 것은 AI 의 놓침이 아니라 글의 한계다. 사람이 review 로 판정한 칸은 그 판정이 이긴다.
    const reviewed = REVIEW_VERDICTS.has(review[field]?.verdict);
    row.grounded = grounded ? (grounded[field] ?? null) : null;
    if (!reviewed && row.grounded === false && (row.outcome === '놓침' || row.outcome === '틀림')) row.outcome = '근거없음';
    return row;
  });

  const blind = Object.entries(REGEX_BLIND_FIELDS).map(([field, get]) => ({ field, predicted: get(policy) === true }));

  // 운영 분석이 후보를 만들지 않는 장소(제주 밖 · 종류 other · 동반 불가 — `exclusionReason` 그대로)는 사이트에 안 들어간다.
  // withPolicyFacts 는 notAllowed 를 늘 끄므로 정책 경로로는 이 경우가 안 보인다 — 판정을 '어려움' 으로 둔다.
  // (동반 불가가 **게시된 짝**에 붙으면 운영은 갱신 후보로 올리지만, 신규로 들어올 수 있었나를 재는 이 평가에서는 탈락으로 본다.)
  const dropReason = exclusionReason(pred);
  const dropped = dropReason !== null;
  const goldenForJudge = { ...golden, verified: false };
  const predForJudge = { ...policy, verified: false };
  const verdicts = DOG_PROFILES.map(({ id, dog }) => ({
    profile: id,
    golden: fns.judgeEligibility(dog, goldenForJudge).level,
    predicted: dropped ? 'hard' : fns.judgeEligibility(dog, predForJudge).level,
  }));

  return {
    ...base,
    status: 'found',
    how: match.how,
    ambiguous: match.ambiguous,
    predictedName: pred.name,
    predictedText: pred.petPolicyText ?? null,
    dropped,
    dropReason,
    bodyKnown: grounded !== null,
    fields,
    blind,
    verdicts,
  };
}

/** golden expected 가 지금 파서로 다시 읽은 값과 다른 항목 수 — 파서가 바뀌면 golden 을 다시 볼 때다. */
export function parserDrift(entries, parsePetPolicy) {
  return entries.filter((e) => !same(e.expected, JSON.parse(JSON.stringify(parsePetPolicy(e.petPolicyText ?? ''))))).map((e) => e.name);
}

const OUTCOMES = ['agree', '지어냄', '놓침', '틀림', '근거없음'];

/** 채점 줄들 → 요약 객체(JSON 으로 저장해 다음 프롬프트 버전과 비교한다). */
export function summarize(results, meta = {}) {
  const found = results.filter((r) => r.status === 'found');
  const fieldNames = found[0]?.fields.map((f) => f.field) ?? ['type', 'petAllowed', ...Object.keys(POLICY_FIELDS)];
  const fields = Object.fromEntries(
    fieldNames.map((name) => {
      const all = found.map((r) => r.fields.find((f) => f.field === name)).filter((f) => f && f.outcome !== 'excluded');
      const counts = Object.fromEntries(OUTCOMES.map((o) => [o, all.filter((f) => f.outcome === o).length]));
      // 근거없음은 분모에서 뺀다 — n 은 글이 말해 준 칸의 수다.
      return [name, { n: all.length - counts['근거없음'], ...counts, siteError: all.filter((f) => f.siteError).length }];
    }),
  );
  const blind = Object.fromEntries(
    Object.keys(REGEX_BLIND_FIELDS).map((name) => [name, { n: found.length, aiTrue: found.filter((r) => r.blind.find((b) => b.field === name)?.predicted).length }]),
  );
  const flipped = found.filter((r) => r.verdicts.some((v) => v.golden !== v.predicted));
  // 글 근거 기준: 뒤집힌 곳 중 어긋난 칸이 전부 '근거없음' 이면(= 글에 없는 사람 조건 때문에만 갈린 곳) 원천 탓이다. 본문을 모르는 곳은 옛 방식대로 AI 탓으로 둔다.
  const sourceOnly = flipped.filter((r) => {
    const diff = r.fields.filter((f) => f.outcome !== 'agree' && f.outcome !== 'excluded');
    return diff.length > 0 && diff.every((f) => f.outcome === '근거없음');
  });
  const byProfile = Object.fromEntries(
    DOG_PROFILES.map(({ id }) => [id, found.filter((r) => r.verdicts.some((v) => v.profile === id && v.golden !== v.predicted)).length]),
  );
  return {
    ...meta,
    golden: results.length,
    extracted: results.filter((r) => r.status !== 'noExtraction').length,
    found: found.length,
    notFound: results.filter((r) => r.status === 'notFound').length,
    ambiguous: found.filter((r) => r.ambiguous).length,
    dropped: found.filter((r) => r.dropped).length,
    dropReasons: Object.fromEntries(['notJeju', 'other', 'notAllowed'].map((k) => [k, found.filter((r) => r.dropReason === k).length])),
    fields,
    blind,
    bodiesKnown: found.filter((r) => r.bodyKnown).length,
    verdictFlips: { places: flipped.length, sourceOnly: sourceOnly.length, groundedBasis: flipped.length - sourceOnly.length, n: found.length, byProfile },
  };
}

/** 요약 → 터미널 줄들. 숫자는 늘 분모와 같이 쓴다(`2/80`). */
export function formatSummary(s) {
  const lines = [
    `프롬프트 ${s.promptVersion ?? '?'} · 모델 ${s.model ?? '?'}`,
    `golden ${s.golden}곳 · 추출 있음 ${s.extracted} · 짝 찾음 ${s.found} · 못 찾음 ${s.notFound} · 짝 후보 여럿 ${s.ambiguous} · 운영이면 후보 탈락 ${s.dropped}(제주밖 ${s.dropReasons?.notJeju ?? 0} · other ${s.dropReasons?.other ?? 0} · 동반불가 ${s.dropReasons?.notAllowed ?? 0})`,
    `본문 캐시 있음 ${s.bodiesKnown ?? 0}/${s.found}곳 — 없는 곳은 근거 판정을 못 해 옛 방식(놓침·틀림 그대로)으로 센다`,
    `판정 뒤집힘 원값 ${s.verdictFlips.places}/${s.verdictFlips.n}곳 · 글 근거 기준 ${s.verdictFlips.groundedBasis ?? s.verdictFlips.places}/${s.verdictFlips.n}곳(글에 없는 사람 조건 때문에만 갈린 ${s.verdictFlips.sourceOnly ?? 0}곳 제외) (${Object.entries(s.verdictFlips.byProfile).map(([k, v]) => `${k} ${v}`).join(' · ')})`,
    '',
    '칸 | 일치 | 지어냄 | 놓침 | 틀림 | 근거없음(분모 밖) | 사이트 오류 후보',
  ];
  for (const [name, f] of Object.entries(s.fields)) {
    lines.push(`${name} | ${f.agree}/${f.n} | ${f['지어냄']}/${f.n} | ${f['놓침']}/${f.n} | ${f['틀림']}/${f.n} | ${f['근거없음'] ?? 0} | ${f.siteError}`);
  }
  lines.push('', '정규식이 못 읽는 칸(golden 은 늘 false — 방향 없음):');
  for (const [name, b] of Object.entries(s.blind)) lines.push(`  ${name} AI true ${b.aiTrue}/${b.n}`);
  return lines;
}

/** 두 요약의 차이. 버전이 다르다는 것과 실행마다 흔들린다는 것을 같이 말한다 — 몇 건 차이는 소음이다. */
export function diffSummaries(prev, cur) {
  const d = (a, b) => {
    const x = b - a;
    return x === 0 ? '±0' : x > 0 ? `+${x}` : `${x}`;
  };
  const lines = [
    `이전 요약과 비교: ${prev.promptVersion}-${prev.model} → ${cur.promptVersion}-${cur.model}` +
      (prev.promptVersion !== cur.promptVersion ? ' (프롬프트 버전이 다르다)' : ''),
    '  claude -p 는 실행마다 결과가 흔들린다 — 몇 건 차이는 소음이다. 분모(n)가 다르면 비교 자체를 조심한다.',
    `  짝 찾음 ${prev.found}/${prev.golden} → ${cur.found}/${cur.golden} · 판정 뒤집힘 ${prev.verdictFlips.places}/${prev.verdictFlips.n} → ${cur.verdictFlips.places}/${cur.verdictFlips.n} (${d(prev.verdictFlips.places, cur.verdictFlips.places)}) · 글 근거 기준 ${prev.verdictFlips.groundedBasis ?? '?'} → ${cur.verdictFlips.groundedBasis}`,
  ];
  for (const [name, f] of Object.entries(cur.fields)) {
    const p = prev.fields?.[name];
    if (!p) continue;
    const parts = ['지어냄', '놓침', '틀림', '근거없음'].filter((o) => (p[o] ?? 0) !== (f[o] ?? 0)).map((o) => `${o} ${p[o]}/${p.n}→${f[o]}/${f.n}`);
    if (parts.length) lines.push(`  ${name}: ${parts.join(' · ')}`);
  }
  return lines;
}

const fmt = (v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const quote = (t) => (t ? t.split('\n').map((l) => `> ${l}`).join('\n') : '> (없음)');

/**
 * 어긋난 곳 전부를 마크다운으로. 사람(golden)의 짧은 조건 문장과 AI 의 petPolicyText 만 인용한다 — **블로그 본문은 싣지 않는다**.
 * 파일은 data/raw/eval/(gitignored)에 쓴다.
 */
export function formatReport(results, summary) {
  const out = [
    `# 추출 정확도 — 프롬프트 ${summary.promptVersion} · ${summary.model}`,
    '',
    '- golden 은 사람이 쓴 조건 문장을 **정규식(parsePetPolicy)이 읽은 값**이다. 정규식은 요금 구간의 kg 을 무게 상한으로 읽는 등 틀릴 수 있다 —',
    '  AI 의 \'놓침\'·\'틀림\' 중 일부는 golden 쪽 오류다. 판정해서 `data/golden/seed-extract.json` 의 `review` 에 적는다(docs/features/extraction-eval.md).',
    '- **지어냄**이 가장 비싸다(BUG-009). 판정 뒤집힘은 review 를 반영하지 않은 원값이다.',
    '- **근거없음**은 사람 값이 글 본문에 안 적혀 있어(사진 등) AI 가 글만 읽고는 못 맞힌 칸이다 — 분모에서 뺀다.',
    '',
    ...formatSummary(summary).map((l) => (l ? `    ${l}` : '')),
    '',
  ];
  // 아직 안 돌린 글은 한 줄로만 — 나눠 돌리는 동안 보고서가 그것으로 덮이지 않게.
  const pending = results.filter((r) => r.status === 'noExtraction');
  if (pending.length) out.push(`추출 캐시 없음 ${pending.length}곳(아직 안 돌렸거나 본문을 못 받았다) — 아래에서 뺐다.`, '');
  const bad = results.filter(
    (r) =>
      r.status === 'notFound' ||
      (r.status === 'found' &&
        (r.fields.some((f) => f.outcome !== 'agree' || f.siteError) || r.verdicts.some((v) => v.golden !== v.predicted))),
  );
  for (const r of bad) {
    out.push(`## ${r.name} \`${r.placeId}\` (logNo ${r.logNo})`, '');
    if (r.status === 'notFound') {
      out.push(`글에서 이 장소를 못 찾았다. AI 가 뽑은 이름: ${r.predictedNames.length ? r.predictedNames.join(', ') : '(없음)'}`, '', '사람:', quote(r.goldenText), '');
      continue;
    }
    out.push(`짝: ${r.predictedName} (${r.how}${r.ambiguous ? ', 후보 여럿' : ''})${r.dropped ? ` · **운영에서는 후보가 안 생긴다(${r.dropReason})**` : ''}`, '');
    out.push('사람:', quote(r.goldenText), '', 'AI:', quote(r.predictedText), '');
    const diffs = r.fields.filter((f) => f.outcome !== 'agree' || f.siteError);
    if (diffs.length) {
      out.push('| 칸 | 사람(정규식) | AI | 결과 |', '|---|---|---|---|');
      for (const f of diffs) out.push(`| ${f.field} | ${fmt(f.golden)} | ${fmt(f.predicted)} | ${f.siteError ? '사이트 데이터 오류 후보' : f.outcome} |`);
      out.push('');
    }
    const flips = r.verdicts.filter((v) => v.golden !== v.predicted);
    if (flips.length) out.push(`판정 뒤집힘: ${flips.map((v) => `${v.profile} ${v.golden}→${v.predicted}`).join(' · ')}`, '');
  }
  return out.join('\n');
}

// ── 사진도 읽히는 실험(`--images`) ─────────────────────────────────────────────────────────────────────────────
// 텍스트만 읽힌 캐시와 사진을 몇 장 붙인 캐시를 **같은 글끼리** 견준다. 근거(grounded)는 여전히 글 본문 기준이다 —
// 그래야 "글에 없던 사람 값을 사진으로 맞혔나" 를 셀 수 있다. 실험의 머리 숫자는 그것(회수)과 지어냄 증가, 글당 토큰 셋이다.

export const EVAL_COMMANDS = ['golden', 'extract', 'score', 'compare'];
export const EVAL_USAGE =
  '사용법: pnpm data:eval golden [--force] | extract [--limit N] [--only <placeId|이름>…] [--refresh] [--images [--max-images N]] | score [--prompt <버전>] [--images [--max-images N]] | compare [--prompt <버전>] [--max-images N]';

/** `pnpm data:eval` 인자. --max-images 는 --images 를 함께 켠다. compare 는 늘 사진 쪽을 텍스트 쪽과 견준다. */
export function parseEvalArgs(argv, { defaultMaxImages = 8 } = {}) {
  const [command, ...rest] = argv;
  const opts = { command, force: false, refresh: false, limit: Infinity, only: [], prompt: null, images: false, maxImages: defaultMaxImages };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--force') opts.force = true;
    else if (a === '--refresh') opts.refresh = true;
    else if (a === '--images') opts.images = true;
    else if (a === '--limit' || a === '--max-images') {
      const n = Number(rest[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error(`${a} 은 1 이상의 정수`);
      if (a === '--limit') opts.limit = n;
      else {
        opts.maxImages = n;
        opts.images = true;
      }
    } else if (a === '--prompt') {
      opts.prompt = rest[++i];
      if (!opts.prompt) throw new Error('--prompt 에 버전이 필요하다');
    } else if (a === '--only') {
      while (rest[i + 1] && !rest[i + 1].startsWith('--')) opts.only.push(rest[++i]);
      if (opts.only.length === 0) throw new Error('--only 에 placeId 나 이름이 필요하다');
    } else throw new Error(`모르는 인자: ${a}`);
  }
  if (!EVAL_COMMANDS.includes(command)) throw new Error(`모르는 명령: ${command ?? '(없음)'}`);
  if (command === 'compare') opts.images = true;
  return opts;
}

/** 캐시 폴더 이름의 가운데 — 텍스트만이면 '', 사진이면 `img<N>`. `<PROMPT_VERSION>-<variant>-<MODEL>` 로 쓴다. */
export const variantTag = ({ images, maxImages }) => (images ? `img${maxImages}` : '');

/**
 * 채점 한 줄 → 글 본문에 근거가 없던 사람 칸(grounded === false) 수와 그중 AI 가 맞힌 수.
 * review 의 'ai' 판정으로 일치가 된 칸(siteError)은 빼고 센다 — 그건 사진으로 맞힌 게 아니라 사람이 덮은 것이다.
 */
export function groundlessRecovery(result) {
  if (result?.status !== 'found') return { ungrounded: 0, recovered: 0 };
  const rows = result.fields.filter((f) => f.grounded === false && f.outcome !== 'excluded');
  return { ungrounded: rows.length, recovered: rows.filter((f) => f.outcome === 'agree' && !f.siteError).length };
}

const inventedRows = (r) => (r?.status === 'found' ? r.fields.filter((f) => f.outcome === '지어냄') : []);
const flipCount = (r) => (r?.status === 'found' ? r.verdicts.filter((v) => v.golden !== v.predicted).length : 0);
/** 입력 토큰은 캐시 읽기·쓰기를 합친 값 — 사진은 매번 새 입력이라 캐시에 거의 안 걸린다. */
const tokensOf = (u) => (u ? { input: (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0), output: u.output ?? 0 } : null);

/**
 * 텍스트만 / 사진 포함 두 채점(각 줄에 CLI 가 usage · costUsd · imagesSent 를 붙여 넘긴다)을 같은 글끼리 견준다.
 * 둘 다 추출이 있는 글만 센다 — 한쪽만 돌린 글이 섞이면 분모가 달라 비교가 안 된다.
 */
export function compareVariants(textResults, imgResults, meta = {}) {
  const imgById = new Map(imgResults.map((r) => [r.placeId, r]));
  const pairs = textResults
    .map((t) => [t, imgById.get(t.placeId)])
    .filter(([t, i]) => i && t.status !== 'noExtraction' && i.status !== 'noExtraction');
  const side = (pick) => {
    const rows = pairs.map(pick);
    const rec = rows.map(groundlessRecovery);
    const tokens = rows.map((r) => tokensOf(r.usage)).filter(Boolean);
    const costs = rows.map((r) => r.costUsd).filter((c) => typeof c === 'number');
    return {
      summary: summarize(rows, meta),
      ungrounded: rec.reduce((s, x) => s + x.ungrounded, 0),
      recovered: rec.reduce((s, x) => s + x.recovered, 0),
      invented: rows.reduce((s, r) => s + inventedRows(r).length, 0),
      tokens: {
        known: tokens.length,
        input: tokens.reduce((s, t) => s + t.input, 0),
        output: tokens.reduce((s, t) => s + t.output, 0),
        costUsd: costs.length ? costs.reduce((s, c) => s + c, 0) : null,
      },
    };
  };
  const text = side(([t]) => t);
  const img = side(([, i]) => i);
  // 사진 쪽에만 생긴 지어냄 — 사진 속 진짜 조건이 사람의 짧은 문장에 빠진 것일 수도 있어 AI 문장을 같이 보여 준다(사람이 가른다).
  const newlyInvented = pairs.flatMap(([t, i]) => {
    const before = new Set(inventedRows(t).map((f) => f.field));
    return inventedRows(i)
      .filter((f) => !before.has(f.field))
      .map((f) => ({ name: i.name, field: f.field, predicted: f.predicted, aiText: i.predictedText ?? null }));
  });
  const posts = pairs.map(([t, i]) => ({
    name: t.name,
    logNo: t.logNo,
    imagesSent: i.imagesSent ?? null,
    text: { ...groundlessRecovery(t), invented: inventedRows(t).length, flips: flipCount(t), tokens: tokensOf(t.usage), costUsd: t.costUsd ?? null },
    img: { ...groundlessRecovery(i), invented: inventedRows(i).length, flips: flipCount(i), tokens: tokensOf(i.usage), costUsd: i.costUsd ?? null },
  }));
  return {
    ...meta,
    n: pairs.length,
    text,
    img,
    newlyInvented,
    posts,
    fellBack: posts.filter((p) => p.imagesSent === 0).map((p) => p.name),
    addendumVersions: [...new Set(pairs.map(([, i]) => i.addendumVersion).filter(Boolean))],
  };
}

/** 비교 → 터미널 줄들. 머리 숫자(회수 · 지어냄 · 토큰)를 맨 위에. */
export function formatComparison(c) {
  const avg = (sum, n) => (n ? Math.round(sum / n) : '—');
  const usd = (v) => (typeof v === 'number' ? `$${v.toFixed(3)}` : '—');
  const tok = (t) => (t ? `${t.input}/${t.output}` : '—');
  const lines = [
    `텍스트만 vs 사진 ${c.maxImages ?? '?'}장까지 — 프롬프트 ${c.promptVersion ?? '?'} · 모델 ${c.model ?? '?'} · 같은 글 ${c.n}곳`,
    '  claude -p 는 실행마다 흔들린다 — 몇 건 차이는 소음이다.',
    '',
    `■ 글에 근거 없던 사람 칸 중 맞힌 수(회수): 텍스트 ${c.text.recovered}/${c.text.ungrounded} → 사진 ${c.img.recovered}/${c.img.ungrounded}`,
    `■ 지어냄(칸 합): 텍스트 ${c.text.invented} → 사진 ${c.img.invented}${c.newlyInvented.length ? ` · 사진 쪽에만 생긴 ${c.newlyInvented.length}칸(아래)` : ''}`,
    `■ 글당 토큰(입력/출력, 평균): 텍스트 ${avg(c.text.tokens.input, c.text.tokens.known)}/${avg(c.text.tokens.output, c.text.tokens.known)} (${c.text.tokens.known}곳 기록) → 사진 ${avg(c.img.tokens.input, c.img.tokens.known)}/${avg(c.img.tokens.output, c.img.tokens.known)} (${c.img.tokens.known}곳) · 목록 단가 환산 합 ${usd(c.text.tokens.costUsd)} → ${usd(c.img.tokens.costUsd)}`,
    `■ 판정 뒤집힘: 원값 ${c.text.summary.verdictFlips.places} → ${c.img.summary.verdictFlips.places} · 글 근거 기준 ${c.text.summary.verdictFlips.groundedBasis} → ${c.img.summary.verdictFlips.groundedBasis} (/${c.n})`,
  ];
  if (c.fellBack.length) lines.push(`⚠ 사진을 한 장도 못 받아 텍스트로만 부른 글 ${c.fellBack.length}곳: ${c.fellBack.join(', ')}`);
  if (c.addendumVersions.length > 1) lines.push(`⚠ 사진 안내문 버전이 섞였다(${c.addendumVersions.join(', ')}) — --refresh 로 다시 돌린다`);
  lines.push('', '칸 | 일치 텍스트→사진 | 지어냄 | 놓침 | 근거없음');
  for (const [name, t] of Object.entries(c.text.summary.fields)) {
    const i = c.img.summary.fields[name];
    if (!i) continue;
    const pair = (o) => `${t[o] ?? 0}→${i[o] ?? 0}`;
    lines.push(`${name} | ${t.agree}/${t.n}→${i.agree}/${i.n} | ${pair('지어냄')} | ${pair('놓침')} | ${pair('근거없음')}`);
  }
  lines.push('', '글 | 사진 | 회수 텍스트→사진 | 지어냄 | 뒤집힌 강아지 | 토큰 입력/출력 텍스트 → 사진 | 비용 텍스트 → 사진');
  for (const p of c.posts) {
    lines.push(
      `${p.name} | ${p.imagesSent ?? '?'}장 | ${p.text.recovered}/${p.text.ungrounded}→${p.img.recovered}/${p.img.ungrounded} | ${p.text.invented}→${p.img.invented} | ${p.text.flips}→${p.img.flips} | ${tok(p.text.tokens)} → ${tok(p.img.tokens)} | ${usd(p.text.costUsd)} → ${usd(p.img.costUsd)}`,
    );
  }
  if (c.newlyInvented.length) {
    lines.push('', '사진 쪽에만 생긴 지어냄 — 사진 속 진짜 조건(사람 문장에서 빠진)인지 지어낸 것인지 AI 문장으로 가른다:');
    for (const f of c.newlyInvented) lines.push(`  ${f.name} · ${f.field} = ${JSON.stringify(f.predicted)} · AI: ${(f.aiText ?? '(없음)').replace(/\n/g, ' / ')}`);
  }
  return lines;
}
