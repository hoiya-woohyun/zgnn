// 검수 창(`pnpm data:review`). 규칙·출력은 scripts/analyze/reviewCandidates.mjs 의 순수 함수에 있고 여기는 I/O 만.
// 운영자 세션(pnpm data:login)이 필요하다 — candidates 는 RLS 로 운영자만 읽고 쓴다.
//
//   pnpm data:review                       pending 후보를 같은 가게로 묶어 검수 순서대로(기본 명령 list)
//   pnpm data:review --tier new --limit 20 --verbose   구간·개수·원문/evidence 까지
//   pnpm data:review --md .omc/review.md   마크다운 보고서로(원문 포함 — .omc 는 .gitignore)
//   pnpm data:review status                후보·장소·글 상태 한 화면(published 대기 draft 와 빈 칸)
//   pnpm data:review approve 3f2a1b 9c… [--merge-into <placeId>] [--note "…"]
//   pnpm data:review approve --tier auto   구간째 승인
//   pnpm data:review reject 3f2a1b --note "폐업"
//
// 앱 파서(src/lib/petPolicy.ts)를 그대로 불러 "앱이 이 문장을 어떻게 읽나" 를 보여 준다 — package.json 의 --experimental-strip-types 가 그 이유다.
// 로그에 시크릿·본문은 없다. evidence·원문은 --verbose / --md 에서만(docs/todo/05).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parsePetPolicy, toPetBadges, withPolicyFacts } from '../src/lib/petPolicy.ts';
import { formatGroup, formatMarkdown, groupCandidates, parseReviewArgs, previewPolicy, resolveIds, TIER_LABEL } from './analyze/reviewCandidates.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';
import { formatReviewSummary } from '../src/lib/runSummary.ts';

let args;
try {
  args = parseReviewArgs(process.argv.slice(2));
} catch (e) {
  console.error(`${e.message} — 사용법: pnpm data:review [list|status|approve|reject] [id…] [--tier auto|ask|new] [--limit N] [--verbose] [--md 경로] [--merge-into id] [--note "…"]`);
  process.exit(1);
}
const parsers = { parsePetPolicy, toPetBadges, withPolicyFacts };
const supabase = createSupabase();

async function loadPending() {
  // 글의 블로그·제목·날짜를 같이 받는다 — 독립 글 수(`postClusters`)가 화면(`CANDIDATE_SELECT`)과 같게 세어지도록.
  const { data, error } = await supabase.from('candidates').select('*, blog_posts(title,posted_at,blog_id)').eq('status', 'pending').order('created_at', { ascending: true }).limit(1000);
  if (error) throw new Error(`candidates 조회 실패: ${error.message}`);
  return data;
}

async function placeNames(ids) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return new Map();
  const { data, error } = await supabase.from('places').select('id, name, status').in('id', wanted);
  if (error) throw new Error(`places 조회 실패: ${error.message}`);
  return new Map(data.map((p) => [p.id, `${p.name}${p.status !== 'published' ? ` (${p.status})` : ''}`]));
}

if (args.command === 'status') {
  const count = async (table, filter = (q) => q) => {
    const { count: n, error } = await filter(supabase.from(table).select('*', { count: 'exact', head: true }));
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    return n;
  };
  const lines = [];
  const cand = {};
  for (const s of ['pending', 'approved', 'rejected', 'merged']) cand[s] = await count('candidates', (q) => q.eq('status', s));
  lines.push(`후보: pending ${cand.pending} · approved ${cand.approved}(→ pnpm data:apply) · rejected ${cand.rejected} · merged ${cand.merged}`);
  const pending = await loadPending();
  const groups = groupCandidates(pending);
  const byTier = { auto: 0, ask: 0, new: 0 };
  for (const g of groups) byTier[g.tier] = (byTier[g.tier] ?? 0) + 1;
  lines.push(`  pending 묶음 ${groups.length} — 일치 ${byTier.auto} · 확인요청 ${byTier.ask} · 신규 ${byTier.new} · 목록글만 ${groups.filter((g) => !g.visited).length} · 조건문 없음 ${groups.filter((g) => !g.hasPolicyText).length}`);
  const posts = { total: await count('blog_posts'), analyzed: await count('blog_posts', (q) => q.not('analyzed_at', 'is', null)) };
  lines.push(`글: ${posts.total}건 중 분석 ${posts.analyzed} · 미분석 ${posts.total - posts.analyzed}`);
  const { data: analyses } = await supabase.from('blog_posts').select('analysis').not('analysis', 'is', null).limit(1000);
  if (analyses?.length) {
    const byVersion = {};
    let zero = 0;
    for (const { analysis } of analyses) {
      byVersion[analysis.promptVersion ?? '?'] = (byVersion[analysis.promptVersion ?? '?'] ?? 0) + 1;
      if (analysis.candidates === 0) zero += 1;
    }
    lines.push(`  analysis 있음 ${analyses.length}(후보 0건 ${zero}) · 프롬프트 버전 ${Object.entries(byVersion).map(([v, n]) => `${v}×${n}`).join(' ')}`);
  } else lines.push('  analysis 없음 — 마이그레이션 20260928150000 뒤의 실행이 아직 없다(옛 분석 글은 "왜 0건" 을 모른다)');
  const { data: drafts, error: draftError } = await supabase.from('places').select('id, name, type, naver_url, region_raw, pet_policy_text, stay_price_text, updated_at').eq('status', 'draft').order('updated_at', { ascending: false });
  if (draftError) throw new Error(`places 조회 실패: ${draftError.message}`);
  lines.push(`장소: published ${await count('places', (q) => q.eq('status', 'published'))} · draft ${drafts.length} · archived ${await count('places', (q) => q.eq('status', 'archived'))}`);
  for (const d of drafts) {
    const missing = [];
    if (!d.naver_url) missing.push('naver_url');
    if (!d.region_raw) missing.push('region_raw');
    if (!d.pet_policy_text) missing.push('pet_policy_text');
    if (d.type === 'stay' && !d.stay_price_text) missing.push('stay_price_text');
    lines.push(`  draft ${d.name} (${d.id.slice(0, 8)})${missing.length ? ` — 빈 칸: ${missing.join(', ')}` : ' — 채울 칸 없음, Studio 에서 published 로'}`);
  }
  console.log(lines.join('\n'));
} else if (args.command === 'list') {
  const pending = await loadPending();
  let groups = groupCandidates(pending);
  if (args.tier) groups = groups.filter((g) => g.tier === args.tier);
  const total = groups.length;
  if (args.limit) groups = groups.slice(0, args.limit);
  const names = await placeNames(groups.map((g) => g.lead.match_place_id));
  const previews = new Map(groups.map((g) => [g.key, previewPolicy(g.lead.extracted, parsers)]));
  if (args.md) {
    const path = resolve(args.md);
    mkdirSync(dirname(path), { recursive: true });
    const matchedNames = new Map(groups.map((g) => [g.key, names.get(g.lead.match_place_id) ?? null]));
    writeFileSync(path, formatMarkdown(groups, previews, { matchedNames }));
    console.log(`마크다운 보고서: ${path} (묶음 ${groups.length}/${total})`);
  } else {
    for (const g of groups) console.log(`${formatGroup(g, previews.get(g.key), { verbose: args.verbose, matchedName: names.get(g.lead.match_place_id) ?? null })}\n`);
    const flagged = groups.filter((g) => previews.get(g.key).flags.length > 0).length;
    console.log(
      `pending ${pending.length}건 · 묶음 ${total}${args.limit && total > groups.length ? ` (앞 ${groups.length})` : ''} · 조건 표식 있는 묶음 ${flagged}` +
        ` — 승인: pnpm data:review approve <id…>   반려: pnpm data:review reject <id…> --note "…"   원문까지: --verbose   파일로: --md 경로`,
    );
  }
} else {
  const pending = await loadPending();
  let targets;
  if (args.ids.length) {
    const { found, missing, ambiguous } = resolveIds(pending, args.ids);
    if (missing.length || ambiguous.length) {
      console.error(`${missing.length ? `pending 에 없음: ${missing.join(' ')}` : ''}${ambiguous.length ? ` 둘 이상 맞음(더 길게): ${ambiguous.join(' ')}` : ''} — 아무것도 바꾸지 않는다`);
      process.exit(1);
    }
    targets = found;
  } else {
    targets = pending.filter((r) => (r.extracted?.match?.tier ?? 'new') === args.tier);
  }
  if (targets.length === 0) {
    console.log('대상 후보가 없다');
    process.exit(0);
  }
  const patch = { status: args.command === 'approve' ? 'approved' : 'rejected' };
  let done = 0;
  let failed = 0;
  if (args.mergeInto) patch.match_place_id = args.mergeInto;
  for (const row of targets) {
    const note = args.note ? `${row.reviewer_note ? `${row.reviewer_note}\n` : ''}[data:review] ${args.note}` : row.reviewer_note;
    const { error } = await supabase.from('candidates').update({ ...patch, reviewer_note: note ?? null }).eq('id', row.id);
    if (error) {
      console.error(`  실패 ${row.id}: ${error.message}`);
      process.exitCode = 1;
      failed += 1;
      continue;
    }
    done += 1;
    console.log(`  ${patch.status} ${row.extracted?.name} (${row.id.slice(0, 8)}, ${TIER_LABEL[row.extracted?.match?.tier] ?? '신규'})${args.mergeInto ? ` → ${args.mergeInto}` : ''}`);
  }
  console.log(formatReviewSummary(args.command, { requested: targets.length, done, failed }));
}
