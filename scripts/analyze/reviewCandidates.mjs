// pnpm data:review(scripts/review-candidates.mjs)가 쓰는 순수 함수 — 후보 묶기 · 검수 순서 · 표식 · 미리보기 · 출력. I/O 없음, 테스트는 reviewCandidates.test.mjs.
//
// 왜 있나 — 검수의 유일한 창이 Studio 의 JSONB 셀이었다(2026-09-28 설계 검토 RP-1·OB-8·FF-5). 사람이 "정리된 데이터" 를 보고 결정하려면
//  (1) 같은 가게를 묶어야 하고(첫 분석에서 같은 펜션이 13건), (2) 앱이 그 문장을 어떻게 읽을지 — 정규식(parsePetPolicy)과 AI 판단(petPolicy),
//  그리고 앱이 실제로 쓰는 병합 결과(withPolicyFacts) — 를 미리 봐야 하고, (3) 무엇이 비었는지(지역·좌표·조건문) 표식으로 보여야 한다.
// 본문 인용(evidence)·원문은 --verbose 뒤에서만 찍는다(docs/todo/05 의 로그 위생 — 기본 출력은 이름·종류·구간·표식·구조화 결과만).
import { correctPetPolicyFacts } from '../lib/petPolicyFacts.mjs';
import { normalizeName } from './matchPlace.mjs';

const TIER_ORDER = { auto: 0, ask: 1, new: 2 };
export const TIER_LABEL = { auto: '일치', ask: '확인요청', new: '신규' };
const TYPE_LABEL = { stay: '숙소', restaurant: '식당', cafe: '카페', other: '기타' };

/** 묶는 키. 옛 후보(nameKey 없음)는 이름으로 계산한다. */
export const nameKeyOf = (extracted) => extracted?.nameKey ?? normalizeName(extracted?.name ?? '');

/**
 * 🙋 검수 순서 — 여기는 사용자가 다듬을 자리다. 무엇을 먼저 볼지는 도메인 판단이고 코드가 정할 수 없다. 지금 기본(작을수록 먼저):
 *   1) 구간: 일치(auto) → 확인요청(ask) → 신규(new)   — 기존 장소에 붙는 것이 빠르고 안전하다
 *   2) 직접 방문한 글(visited)이 목록·추천 글보다 먼저   — 목록 글은 이름·주소뿐이라 조건 확인이 안 된다(첫 분석: 한 글이 101건)
 *   3) 이용 조건 문장이 있는 것이 먼저                    — 없는 후보는 승인해도 앱이 '정보 없음' 으로만 보여 준다
 *   4) 글이 여럿인 것이 먼저                              — 여러 사람이 말한 가게
 *   5) AI confidence 높은 것이 먼저
 * 예: 신규 발굴을 우선하면 1) 을 맨 뒤로 보내고, 목록 글을 아예 뒤로 밀려면 2) 를 1) 앞에 둔다. 반환 배열의 앞자리가 더 센 기준이다.
 */
export function reviewPriority(group) {
  return [
    TIER_ORDER[group.tier] ?? 9,
    group.visited ? 0 : 1,
    group.hasPolicyText ? 0 : 1,
    -group.posts.length,
    -group.confidence,
  ];
}

export function compareGroups(a, b) {
  const pa = reviewPriority(a);
  const pb = reviewPriority(b);
  for (let i = 0; i < pa.length; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return String(a.lead.extracted?.name ?? '').localeCompare(String(b.lead.extracted?.name ?? ''), 'ko');
}

/**
 * pending 후보를 같은 가게로 묶는다 — 기존 장소에 붙은 것은 match_place_id 로, 신규는 nameKey 로.
 * 묶음마다 대표(lead)는 AI confidence 가 가장 높은 후보. 묶음의 구간은 가장 강한 것(auto > ask > new).
 */
export function groupCandidates(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.match_place_id ? `place:${row.match_place_id}` : `name:${nameKeyOf(row.extracted)}`;
    if (!groups.has(key)) groups.set(key, { key, rows: [] });
    groups.get(key).rows.push(row);
  }
  const out = [];
  for (const g of groups.values()) {
    g.rows.sort((a, b) => (b.extracted?.confidence ?? 0) - (a.extracted?.confidence ?? 0));
    g.lead = g.rows[0];
    g.tier = g.rows.map((r) => r.extracted?.match?.tier ?? 'new').sort((a, b) => (TIER_ORDER[a] ?? 9) - (TIER_ORDER[b] ?? 9))[0];
    g.visited = g.rows.some((r) => r.extracted?.visited !== false);
    g.hasPolicyText = g.rows.some((r) => Boolean(r.extracted?.petPolicyText));
    g.confidence = Math.max(...g.rows.map((r) => r.extracted?.confidence ?? 0));
    g.posts = [...new Set(g.rows.map((r) => r.post_url).filter(Boolean))];
    out.push(g);
  }
  return out.sort(compareGroups);
}

/**
 * 앱이 이 후보의 이용 조건을 어떻게 읽을지 — 정규식(parsePetPolicy)과 AI 판단(petPolicy)을 각각, 그리고 앱이 실제로 쓰는 병합 결과(withPolicyFacts).
 * 둘이 어긋나면 표식으로 알린다 — 그 자리가 "정규화가 잘 됐는가" 의 실측이다. parsers 는 src/lib/petPolicy.ts 의 세 함수(CLI 가 넘긴다).
 */
export function previewPolicy(extracted, { parsePetPolicy, toPetBadges, withPolicyFacts }) {
  const text = extracted?.petPolicyText ?? '';
  const regex = parsePetPolicy(text);
  const facts = extracted?.petPolicy ?? null;
  const merged = withPolicyFacts(regex, facts, text);
  const regexBadges = toPetBadges(regex).map((b) => b.label);
  const mergedBadges = toPetBadges(merged).map((b) => b.label);
  const flags = [];
  if (!text) flags.push('조건문 없음');
  else if (regexBadges.length === 0) flags.push('정규식 못읽음');
  if (text && !facts) flags.push('AI 판단 없음');
  if (facts && facts.indoor !== 'unknown' && regex.indoor !== 'unknown' && facts.indoor !== regex.indoor) flags.push(`AI≠정규식(실내 ${facts.indoor}/${regex.indoor})`);
  if (merged.notAllowed) flags.push('동반불가 문장');
  // AI 판단 중 원문에 근거가 없어 앱이 빼고 보는 것(withPolicyFacts 가 같은 함수를 부른다). facts 는 **모델이 낸 그대로** 두고
  // 뺀 것을 따로 싣는다 — 운영자가 "AI 는 이렇게 읽었고 이건 원문에 없어서 안 썼다" 를 나란히 봐야 프롬프트를 고칠 수 있다.
  const { corrections } = correctPetPolicyFacts(facts, text);
  if (corrections.length) flags.push('AI 판단 보정');
  const level = merged.noInfo ? '정보없음' : merged.notAllowed ? '동반불가' : merged.unread ? '못읽음' : mergedBadges.length ? '조건' : '자유';
  return { regexBadges, mergedBadges, facts, corrections, flags, level };
}

/** 묶음 단위 표식 — 승인하기 전에 채워야 할 것. */
export function groupFlags(group) {
  const e = group.lead.extracted ?? {};
  const flags = [];
  if (!e.regionRaw) flags.push('지역 없음');
  if (!e.geo) flags.push('좌표 없음');
  if (!group.visited) flags.push('목록글');
  if (group.rows.some((r) => r.extracted?.dupOf)) flags.push('중복표시');
  if (group.tier !== 'new' && !group.rows.some((r) => r.match_place_id)) flags.push('짝 없음');
  return flags;
}

const shortId = (id) => String(id ?? '').slice(0, 8);
const factsLine = (facts) => {
  if (!facts) return null;
  const parts = [];
  if (facts.indoor !== 'unknown') parts.push({ free: '실내 자유', cage: '실내 케이지', outdoorOnly: '야외만' }[facts.indoor]);
  if (facts.leash) parts.push('리드줄');
  if (facts.largeDogOk === true) parts.push('대형견 OK');
  if (facts.largeDogOk === false) parts.push('대형견 불가');
  if (facts.smallDogOnly) parts.push('소형견만');
  if (facts.weightLimitKg != null) parts.push(`~${facts.weightLimitKg}kg`);
  if (facts.maxDogs != null) parts.push(`최대 ${facts.maxDogs}마리`);
  if (facts.feeFree === true) parts.push('추가요금 없음');
  if (facts.feeText) parts.push(facts.feeText);
  if (facts.callFirst) parts.push('전화 확인');
  if (facts.notes) parts.push(facts.notes);
  return parts.length ? parts.join(' · ') : '(판단 없음)';
};

/**
 * 묶음 하나를 터미널 몇 줄로. verbose 면 원문·evidence 까지(본문 인용이라 기본은 안 찍는다).
 * @param {object} group  groupCandidates 결과 하나
 * @param {object} preview  previewPolicy(lead.extracted) 결과
 * @param {{ verbose?: boolean, matchedName?: string | null }} [opts]
 */
export function formatGroup(group, preview, { verbose = false, matchedName = null } = {}) {
  const e = group.lead.extracted ?? {};
  const head = [
    `■ ${e.name}`,
    `[${TYPE_LABEL[e.type] ?? e.type} · ${TIER_LABEL[group.tier] ?? group.tier}${group.lead.match_confidence != null && group.tier !== 'new' ? ` ${Number(group.lead.match_confidence).toFixed(2)}` : ''}${matchedName ? ` → ${matchedName}` : ''} · AI ${group.confidence.toFixed(2)} · 글 ${group.posts.length}]`,
    e.regionRaw ?? '지역?',
    e.geo ? `좌표 ${e.geoSource ?? 'local'}` : '',
    ...groupFlags(group).map((f) => `⚠ ${f}`),
  ].filter(Boolean);
  const lines = [head.join('  ')];
  lines.push(`   id ${group.rows.map((r) => shortId(r.id)).join(' ')}   ${group.posts.slice(0, 2).join('  ')}${group.posts.length > 2 ? `  (+${group.posts.length - 2})` : ''}`);
  const policy = [
    `조건: ${preview.level}`,
    `정규식 [${preview.regexBadges.join(', ') || '—'}]`,
    `AI [${factsLine(preview.facts) ?? '—'}]`,
    `앱 [${preview.mergedBadges.join(', ') || '—'}]`,
    ...preview.flags.map((f) => `⚠ ${f}`),
  ];
  lines.push(`   ${policy.join(' · ')}`);
  if (e.address || e.addressAi) lines.push(`   주소: ${e.address ?? '—'}${e.addressAi && e.addressAi !== e.address ? ` (AI: ${e.addressAi})` : ''}`);
  if (verbose) {
    if (e.petPolicyText) lines.push(`   원문: ${String(e.petPolicyText).replace(/\s*\n\s*/g, ' / ')}`);
    if (e.features) lines.push(`   소개: ${e.features}`);
    for (const row of group.rows) {
      for (const q of row.extracted?.evidence ?? []) lines.push(`   “${q}” — ${shortId(row.id)}`);
    }
  }
  return lines.join('\n');
}

/** 마크다운 보고서 — 파일로 저장해 에디터에서 검수할 때. verbose 와 같은 정보를 담는다(원문·evidence 포함). */
export function formatMarkdown(groups, previews, { matchedNames = new Map() } = {}) {
  const out = [`# 후보 검수 (pending ${groups.reduce((n, g) => n + g.rows.length, 0)}건 · 묶음 ${groups.length})`, ''];
  for (const g of groups) {
    const e = g.lead.extracted ?? {};
    const p = previews.get(g.key);
    out.push(`## ${e.name} — ${TYPE_LABEL[e.type] ?? e.type} · ${TIER_LABEL[g.tier] ?? g.tier}${matchedNames.get(g.key) ? ` → ${matchedNames.get(g.key)}` : ''}`);
    out.push('');
    out.push(`- id: ${g.rows.map((r) => `\`${shortId(r.id)}\``).join(' ')}`);
    out.push(`- 지역: ${e.regionRaw ?? '—'} · 좌표: ${e.geo ? `${e.geo.lat}, ${e.geo.lng} (${e.geoSource ?? 'local'})` : '—'} · 주소: ${e.address ?? '—'}`);
    out.push(`- 표식: ${[...groupFlags(g), ...p.flags].map((f) => `⚠ ${f}`).join(' ') || '없음'}`);
    out.push(`- 조건(${p.level}): 정규식 [${p.regexBadges.join(', ') || '—'}] · AI [${factsLine(p.facts) ?? '—'}] · 앱 [${p.mergedBadges.join(', ') || '—'}]`);
    for (const note of p.corrections ?? []) out.push(`  · AI 보정: ${note}`);
    if (e.petPolicyText) out.push(`- 원문: ${String(e.petPolicyText).replace(/\n/g, ' / ')}`);
    if (e.features) out.push(`- 소개: ${e.features}`);
    for (const row of g.rows) {
      out.push(`- 글: ${row.post_url}`);
      for (const q of row.extracted?.evidence ?? []) out.push(`  > ${q}`);
    }
    out.push('');
  }
  return out.join('\n');
}

/** id 앞자리로 후보를 고른다. 없는 것·둘 이상 맞는 것은 따로 돌려준다 — 조용히 엉뚱한 후보를 승인하지 않게. */
export function resolveIds(rows, prefixes) {
  const found = [];
  const missing = [];
  const ambiguous = [];
  for (const prefix of prefixes) {
    const hits = rows.filter((r) => String(r.id).startsWith(prefix));
    if (hits.length === 1) found.push(hits[0]);
    else if (hits.length === 0) missing.push(prefix);
    else ambiguous.push(prefix);
  }
  return { found, missing, ambiguous };
}

/** `list [--tier t] [--limit N] [--verbose] [--md 경로]` · `status` · `approve <id…> [--merge-into id] [--note …]` · `reject <id…> --note …` */
export function parseReviewArgs(argv) {
  const args = { command: 'list', ids: [], tier: null, limit: null, verbose: false, md: null, mergeInto: null, note: null, all: false };
  const rest = [...argv];
  if (rest.length && !rest[0].startsWith('-')) args.command = rest.shift();
  if (!['list', 'status', 'approve', 'reject'].includes(args.command)) throw new Error(`알 수 없는 명령: ${args.command}`);
  while (rest.length) {
    const arg = rest.shift();
    const takeValue = (name) => {
      const v = rest.shift();
      if (v === undefined) throw new Error(`${name} 뒤에 값이 필요합니다`);
      return v;
    };
    if (arg === '--verbose' || arg === '-v') args.verbose = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--tier') {
      args.tier = takeValue('--tier');
      if (!TIER_ORDER[args.tier] && args.tier !== 'auto') throw new Error(`--tier 는 auto|ask|new: ${args.tier}`);
    } else if (arg === '--limit') {
      const v = takeValue('--limit');
      if (!/^\d+$/.test(v) || Number(v) < 1) throw new Error(`--limit 은 1 이상의 정수: ${v}`);
      args.limit = Number(v);
    } else if (arg === '--md') args.md = takeValue('--md');
    else if (arg === '--merge-into') args.mergeInto = takeValue('--merge-into');
    else if (arg === '--note') args.note = takeValue('--note');
    else if (arg.startsWith('-')) throw new Error(`알 수 없는 인자: ${arg}`);
    else args.ids.push(arg);
  }
  if ((args.command === 'approve' || args.command === 'reject') && args.ids.length === 0 && !args.tier) {
    throw new Error(`${args.command} 는 후보 id(앞자리) 또는 --tier 가 필요합니다`);
  }
  if (args.command === 'reject' && !args.note) throw new Error('reject 는 --note "이유" 가 필요합니다(reviewer_note 에 남는다)');
  return args;
}
