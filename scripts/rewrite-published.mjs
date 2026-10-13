// `pnpm data rewrite` — 게시된 블로그 행의 이용 안내·베낀 소개를 다시 쓴다. 판단은 고정(docs/todo/21 S9). 규칙은 scripts/analyze/rewritePublished.mjs 의 순수 함수에 있고 여기는 I/O 만.
//
// 두 단계다(🧑 H7):
//  - 인자 없음 = **미리보기**. 곳마다 출처 글 본문을 다시 받고(본문은 DB 에 없다 — AI 0회) Claude 를 한 번 불러, 전·후 표를
//    `data/raw/rewrite/<날짜>.md` 에, 쓸 patch 를 같은 이름의 `.json` 에 남긴다. 원격엔 쓰지 않는다.
//    미리보기는 **나눠 돌 수 있다**(`--limit N` · 한도로 멈춤): 아직 반영 안 된 같은 프롬프트의 plan 이 있으면 거기서 처리한 곳은 건너뛰고
//    나머지만 불러 그 plan 에 합친다 — 미리보기는 원격에 쓰지 않으니 대상 질의는 매번 같은 행을 돌려주기 때문이다.
//  - `--apply [파일]` = 그 `.json`(기본: 가장 새 것)의 patch 를 그대로 `update` 한다. **Claude 를 다시 부르지 않는다** — 다시 부르면
//    사람이 본 표와 다른 문장이 올라간다. 쓰기 직전 행마다 미리보기 때와 같은지(`applyCheck` — 대상 조건 · 소개 · 판단 지문)를 보고 다르면 건너뛴다.
//    재빌드는 `places` 트리거가 합쳐 한 번 건다.
//
// 세션이 필요하다(`pnpm data login`) — anon 은 `place_sources`·`blog_posts` 를 못 읽는다. 단계 스크립트라 `process.exit` 를 부르지 않는다(CLAUDE.md).
// 로그에 본문·모델 출력을 남기지 않는다 — 장소 이름·id·칸 이름·건수만(docs/todo/05). 문장은 gitignored 표 파일에만.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUsageMeter, isFatal, isQuotaExhausted, MODEL, runClaudeCli } from './analyze/extractPlaces.mjs';
import { fetchPostText } from './analyze/naverPostBody.mjs';
import { applyCheck, isRewriteTarget, planPatch, renderReport, REWRITE_PROMPT_VERSION, rewriteForPlace, rewriteNeeds } from './analyze/rewritePublished.mjs';
import { chunkForUrlFilter } from './lib/chunkForUrlFilter.mjs';
import { isDirectRun } from './lib/isDirectRun.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

export const REWRITE_DIR = 'data/raw/rewrite';
const USAGE = '사용법: pnpm data rewrite [--limit N]   (미리보기)\n        pnpm data rewrite --apply [data/raw/rewrite/<날짜>.json]';

/** 인자 — 모르는 인자는 거부한다(오타로 쓰기가 도는 일이 없게, apply 와 같은 원칙). */
export function parseRewriteArgs(argv) {
  const opts = { apply: false, planPath: null, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      opts.apply = true;
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.planPath = argv[++i];
    } else if (arg === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) return { error: `--limit 은 1 이상의 정수: ${argv[i]}` };
      opts.limit = n;
    } else {
      return { error: `알 수 없는 인자: ${arg}` };
    }
  }
  if (opts.apply && opts.limit !== Infinity) return { error: '--apply 는 --limit 을 받지 않는다(미리보기의 patch 를 전부 쓴다)' };
  return opts;
}

const kstDate = (now) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** 대상 행 — 질의 조건과 `isRewriteTarget` 이 같은 말을 한다. */
async function selectTargets(supabase) {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('status', 'published')
    .eq('pet_policy_text_public', false)
    .is('pet_policy_guide', null)
    .order('id');
  if (error) throw new Error(`places 조회 실패: ${error.message}`);
  return data.filter(isRewriteTarget);
}

/** 장소 id → 출처 글들 [{ url, title, blog_id, log_no }]. */
async function selectSources(supabase, placeIds) {
  const links = [];
  for (const chunk of chunkForUrlFilter(placeIds)) {
    const { data, error } = await supabase.from('place_sources').select('place_id, post_url').in('place_id', chunk);
    if (error) throw new Error(`place_sources 조회 실패: ${error.message}`);
    links.push(...data);
  }
  const posts = new Map();
  for (const chunk of chunkForUrlFilter([...new Set(links.map((l) => l.post_url).filter(Boolean))])) {
    const { data, error } = await supabase.from('blog_posts').select('url, title, blog_id, log_no').in('url', chunk);
    if (error) throw new Error(`blog_posts 조회 실패: ${error.message}`);
    for (const post of data) posts.set(post.url, post);
  }
  const byPlace = new Map();
  for (const { place_id: placeId, post_url: url } of links) {
    const post = posts.get(url);
    if (post) byPlace.set(placeId, [...(byPlace.get(placeId) ?? []), post]);
  }
  return byPlace;
}

/** 아직 반영 안 된 같은 프롬프트의 plan(가장 새 것) — 미리보기를 나눠 돌 때 이어 받는다. 날짜가 바뀌어도 이어진다. */
function openPlan(outDir) {
  const path = newestPlan(outDir);
  if (!path) return null;
  const plan = JSON.parse(readFileSync(path, 'utf8'));
  return plan.promptVersion === REWRITE_PROMPT_VERSION && !plan.appliedAt && Array.isArray(plan.entries) ? { path, plan } : null;
}

async function preview(supabase, { run, fetchPost, limit, now, outDir }) {
  const targets = await selectTargets(supabase);
  console.log(`대상 ${targets.length}곳(게시 · 원문 비공개 · 안내 없음)`);
  const open = openPlan(outDir);
  // 처리한 곳(patch · 가드에 걸림 · 할 것 없음 · 본문 없음)만 이어 받는다. `retry`(limit 에 밀림 · 실패)는 다시 집는다.
  // 그새 대상에서 빠진 곳(안내가 생겼다 · 내렸다)은 버린다.
  const targetIds = new Set(targets.map((row) => row.id));
  const kept = (open?.plan.entries ?? []).filter((e) => !e.retry && targetIds.has(e.id));
  const done = new Set(kept.map((e) => e.id));
  if (open) console.log(`이어 받기: ${open.path} 에서 ${done.size}곳은 처리했다 — 나머지만 부른다`);
  const todo = targets.filter((row) => !done.has(row.id));
  const sources = await selectSources(supabase, todo.map((row) => row.id));
  const meter = createUsageMeter('다시 쓰기');
  const entries = [];
  let calls = 0;
  let failed = 0;
  let stopped = null;

  for (const row of todo) {
    const base = { id: row.id, name: row.name };
    if (calls >= limit || stopped) {
      entries.push({ ...base, retry: true, skipped: stopped ? '멈춰서 다음 회차로' : `--limit ${limit} 에 닿아 다음 회차로` });
      continue;
    }
    const posts = [];
    for (const post of sources.get(row.id) ?? []) {
      if (!post.blog_id || !post.log_no) continue;
      try {
        posts.push({ ...post, body: await fetchPost({ blogId: post.blog_id, logNo: post.log_no }) });
      } catch (e) {
        console.warn(`  ${row.name}: 본문을 못 받았다 — ${e.message}`);
      }
    }
    const needs = rewriteNeeds(row, posts);
    if (!posts.some((post) => post.body)) {
      entries.push({ ...base, skipped: '출처 글 본문을 받지 못했어요' });
      continue;
    }
    if (!needs.guide && !needs.copied) {
      entries.push({ ...base, skipped: '할 것 없음(조건 원문 없음 · 소개가 베낌 아님)' });
      continue;
    }
    try {
      calls += 1;
      const out = await rewriteForPlace(run, row, posts, meter);
      const plan = planPatch(row, posts, out);
      entries.push({ ...base, ...plan, before: { features: row.features ?? '' } });
      console.log(`  ${row.name}: ${Object.keys(plan.patch).join('·') || '바꿀 칸 없음'}`);
    } catch (e) {
      failed += 1;
      entries.push({ ...base, retry: true, skipped: `실패: ${e.message}` });
      console.error(`  ${row.name}: 실패 — ${e.message}`);
      if (isQuotaExhausted(e) || isFatal(e)) stopped = e.message;
    }
  }

  const all = [...kept, ...entries];
  const date = open?.plan.date ?? kstDate(now);
  mkdirSync(outDir, { recursive: true });
  const jsonPath = open?.path ?? join(outDir, `${date}.json`);
  const mdPath = jsonPath.replace(/\.json$/, '.md');
  writeFileSync(mdPath, renderReport(all, { date }));
  const rows = all.filter((e) => e.patch && Object.keys(e.patch).length).map(({ id, name, before, patch }) => ({ id, name, before, patch }));
  writeFileSync(jsonPath, `${JSON.stringify({ date, model: MODEL, promptVersion: REWRITE_PROMPT_VERSION, rows, entries: all }, null, 2)}\n`);
  console.log(meter.summary());
  const left = all.filter((e) => e.retry).length;
  console.log(`표: ${mdPath} · patch ${rows.length}곳: ${jsonPath}${left ? ` · 남은 ${left}곳은 \`pnpm data rewrite\` 를 다시 치면 이어서` : ''} — 다 보면 \`pnpm data rewrite --apply\``);
  if (stopped) console.error(`멈췄다(남은 곳은 다음 회차): ${stopped}`);
  return failed || stopped ? 1 : 0;
}

function newestPlan(outDir) {
  let names = [];
  try {
    names = readdirSync(outDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  } catch {
    // 폴더가 없으면 미리보기를 안 돈 것이다.
  }
  return names.length ? join(outDir, names.at(-1)) : null;
}

async function apply(supabase, { planPath, outDir }) {
  const path = planPath ?? newestPlan(outDir);
  if (!path) {
    console.error(`미리보기 파일이 없다(${outDir}/<날짜>.json) — 먼저 \`pnpm data rewrite\``);
    return 1;
  }
  const plan = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`모드: 반영 — ${path} 의 ${plan.rows.length}곳(프롬프트 ${plan.promptVersion})`);
  if (!plan.rows.length) return 0;
  const left = (plan.entries ?? []).filter((e) => e.retry).length;
  if (left) console.log(`미리보기가 다 돌지 않았다 — 남은 ${left}곳은 이번 반영 뒤 새 회차(\`pnpm data rewrite\`)가 다시 집는다`);

  const current = new Map();
  for (const chunk of chunkForUrlFilter(plan.rows.map((row) => row.id))) {
    const { data, error } = await supabase.from('places').select('*').in('id', chunk);
    if (error) throw new Error(`places 조회 실패: ${error.message}`);
    for (const row of data) current.set(row.id, row);
  }

  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (const planned of plan.rows) {
    const reason = applyCheck(current.get(planned.id), planned);
    if (reason) {
      skipped += 1;
      console.log(`  건너뜀 ${planned.name}: ${reason}`);
      continue;
    }
    // 조건을 update 에도 건다 — 확인과 쓰기 사이에 다른 손이 안내를 넣었거나 소개를 고쳤으면 0행이 된다.
    const { data, error } = await supabase
      .from('places')
      .update(planned.patch)
      .eq('id', planned.id)
      .is('pet_policy_guide', null)
      .eq('features', planned.before.features)
      .select('id');
    if (error) {
      failed += 1;
      console.error(`  실패 ${planned.name}: ${error.message}`);
    } else if (!data?.length) {
      skipped += 1;
      console.log(`  건너뜀 ${planned.name}: 쓰는 사이 행이 바뀌었어요`);
    } else {
      written += 1;
      console.log(`  ${planned.name}: ${Object.keys(planned.patch).join('·')}`);
    }
  }
  // 반영한 plan 은 닫는다 — 다음 미리보기는 이 plan 을 이어 받지 않고 새 회차로 시작한다.
  writeFileSync(path, `${JSON.stringify({ ...plan, appliedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`반영 ${written}곳 · 건너뜀 ${skipped} · 실패 ${failed}${written ? ' — 재빌드는 트리거가 한 번 건다' : ''}`);
  return failed ? 1 : 0;
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const opts = parseRewriteArgs(argv);
  if (opts.error) {
    console.error(`${opts.error}\n${USAGE}`);
    return 1;
  }
  const { run = runClaudeCli, fetchPost = fetchPostText, now = new Date(), outDir = REWRITE_DIR } = deps;
  const supabase = deps.supabase ?? createSupabase();
  return opts.apply ? apply(supabase, { planPath: opts.planPath, outDir }) : preview(supabase, { run, fetchPost, limit: opts.limit, now, outDir });
}

if (isDirectRun(import.meta.url)) {
  process.exitCode = await main();
}
