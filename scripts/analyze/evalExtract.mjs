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
 * status: 'noExtraction'(아직 안 돌림·본문 없음) · 'notFound'(글에서 이 장소를 못 뽑음) · 'found'.
 */
export function scoreEntry(entry, extraction, fns) {
  const base = { placeId: entry.placeId, name: entry.name, logNo: entry.logNo, goldenText: entry.petPolicyText };
  if (!extraction || !Array.isArray(extraction.places)) return { ...base, status: 'noExtraction' };
  const match = findPredicted(entry.name, extraction.places);
  if (!match) return { ...base, status: 'notFound', predictedNames: extraction.places.map((p) => p.name) };

  const pred = match.place;
  const review = entry.review ?? {};
  const golden = entry.expected;
  const policy = predictedPolicy(pred, fns);

  const fields = [
    ['type', entry.type, pred.type],
    // 시드는 전부 동반 가능한 곳이다 — golden 은 늘 'yes'.
    ['petAllowed', 'yes', pred.petAllowed],
    ...Object.entries(POLICY_FIELDS).map(([field, get]) => [field, get(golden), get(policy)]),
  ].map(([field, g, p]) => ({ field, golden: g ?? null, predicted: p ?? null, ...applyReview(classifyField(g, p), review[field]) }));

  const blind = Object.entries(REGEX_BLIND_FIELDS).map(([field, get]) => ({ field, predicted: get(policy) === true }));

  // 'no' 는 운영에서 후보가 아예 안 생긴다(analyze-candidates) — withPolicyFacts 는 notAllowed 를 늘 끄므로 여기서 '어려움' 으로 둔다.
  const dropped = pred.petAllowed === 'no';
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
    fields,
    blind,
    verdicts,
  };
}

/** golden expected 가 지금 파서로 다시 읽은 값과 다른 항목 수 — 파서가 바뀌면 golden 을 다시 볼 때다. */
export function parserDrift(entries, parsePetPolicy) {
  return entries.filter((e) => !same(e.expected, JSON.parse(JSON.stringify(parsePetPolicy(e.petPolicyText ?? ''))))).map((e) => e.name);
}

const OUTCOMES = ['agree', '지어냄', '놓침', '틀림'];

/** 채점 줄들 → 요약 객체(JSON 으로 저장해 다음 프롬프트 버전과 비교한다). */
export function summarize(results, meta = {}) {
  const found = results.filter((r) => r.status === 'found');
  const fieldNames = found[0]?.fields.map((f) => f.field) ?? ['type', 'petAllowed', ...Object.keys(POLICY_FIELDS)];
  const fields = Object.fromEntries(
    fieldNames.map((name) => {
      const rows = found.map((r) => r.fields.find((f) => f.field === name)).filter((f) => f && f.outcome !== 'excluded');
      const counts = Object.fromEntries(OUTCOMES.map((o) => [o, rows.filter((f) => f.outcome === o).length]));
      return [name, { n: rows.length, ...counts, siteError: rows.filter((f) => f.siteError).length }];
    }),
  );
  const blind = Object.fromEntries(
    Object.keys(REGEX_BLIND_FIELDS).map((name) => [name, { n: found.length, aiTrue: found.filter((r) => r.blind.find((b) => b.field === name)?.predicted).length }]),
  );
  const flipped = found.filter((r) => r.verdicts.some((v) => v.golden !== v.predicted));
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
    fields,
    blind,
    verdictFlips: { places: flipped.length, n: found.length, byProfile },
  };
}

/** 요약 → 터미널 줄들. 숫자는 늘 분모와 같이 쓴다(`2/80`). */
export function formatSummary(s) {
  const lines = [
    `프롬프트 ${s.promptVersion ?? '?'} · 모델 ${s.model ?? '?'}`,
    `golden ${s.golden}곳 · 추출 있음 ${s.extracted} · 짝 찾음 ${s.found} · 못 찾음 ${s.notFound} · 짝 후보 여럿 ${s.ambiguous} · 동반 불가로 읽음 ${s.dropped}`,
    `판정 뒤집힘 ${s.verdictFlips.places}/${s.verdictFlips.n}곳 (${Object.entries(s.verdictFlips.byProfile).map(([k, v]) => `${k} ${v}`).join(' · ')})`,
    '',
    '칸 | 일치 | 지어냄 | 놓침 | 틀림 | 사이트 오류 후보',
  ];
  for (const [name, f] of Object.entries(s.fields)) {
    lines.push(`${name} | ${f.agree}/${f.n} | ${f['지어냄']}/${f.n} | ${f['놓침']}/${f.n} | ${f['틀림']}/${f.n} | ${f.siteError}`);
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
    `  짝 찾음 ${prev.found}/${prev.golden} → ${cur.found}/${cur.golden} · 판정 뒤집힘 ${prev.verdictFlips.places}/${prev.verdictFlips.n} → ${cur.verdictFlips.places}/${cur.verdictFlips.n} (${d(prev.verdictFlips.places, cur.verdictFlips.places)})`,
  ];
  for (const [name, f] of Object.entries(cur.fields)) {
    const p = prev.fields?.[name];
    if (!p) continue;
    const parts = ['지어냄', '놓침', '틀림'].filter((o) => p[o] !== f[o]).map((o) => `${o} ${p[o]}/${p.n}→${f[o]}/${f.n}`);
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
    out.push(`짝: ${r.predictedName} (${r.how}${r.ambiguous ? ', 후보 여럿' : ''})${r.dropped ? ' · **AI 가 동반 불가로 읽음 — 운영에서는 후보가 안 생긴다**' : ''}`, '');
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
