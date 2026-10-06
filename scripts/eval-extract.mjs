// AI 추출 정확도 평가(`pnpm data:eval`). 정답은 시드 86곳 — 사람이 같은 블로그 글(reviewUrl)을 읽고 적은 조건이다.
// 채점 규칙은 scripts/analyze/evalExtract.mjs 의 순수 함수에 있고 여기는 I/O 만. 쓰는 법·비용·보정은 docs/features/extraction-eval.md.
//
//   pnpm data:eval golden [--force]                      src/data/places.json → data/golden/seed-extract.json (한 번 얼린다)
//   pnpm data:eval extract [--limit N] [--only <placeId|이름|logNo>…] [--refresh]   글마다 claude -p 한 번(캐시가 있으면 건너뛴다)
//   pnpm data:eval score [--prompt <버전>]               golden + 캐시만 읽는다 — Claude 호출 0
//   … extract|score 에 --images [--max-images N]          실험: 글의 사진 N장(기본 8)도 같이 읽힌다 — 캐시는 <버전>-img<N>-<모델>
//   pnpm data:eval compare [--prompt <버전>] [--max-images N]   텍스트만 vs 사진 포함을 같은 글끼리 — Claude 호출 0
//
// Supabase 는 안 쓴다(places.json 이 로컬에 있다). Claude 는 운영 분석과 같은 `claude -p`(구독) — 같은 extractPlaces 를 그대로 부른다.
// 본문은 data/raw/eval/bodies 에만 둔다(gitignored · 레포가 공개다). 로그에 본문을 싣지 않는다.
// 사진(--images)은 메모리에서만 base64 로 넘기고 버린다 — 파일로 쓰지 않는다(ADR-002). 캐시에는 고른 사진의 URL 만 남는다.
// 앱의 TS 를 부르므로 package.json 이 --experimental-strip-types 와 확장자 훅(scripts/lib/tsExtResolve.mjs)을 같이 건다.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  createUsageMeter,
  extractPlaces,
  IMAGE_ADDENDUM_VERSION,
  isFatal,
  MODEL,
  PROMPT_VERSION,
  runClaudeCli,
} from './analyze/extractPlaces.mjs';
import {
  buildGoldenEntry,
  compareVariants,
  diffSummaries,
  EVAL_USAGE,
  formatComparison,
  formatReport,
  formatSummary,
  parseEvalArgs,
  parserDrift,
  scoreEntry,
  selectTargets,
  summarize,
  variantTag,
} from './analyze/evalExtract.mjs';
import { FETCH_TIMEOUT_MS, fetchPostText, postViewUrl } from './analyze/naverPostBody.mjs';
import { DEFAULT_MAX_IMAGES, downloadImages, postImageCandidates, selectPostImages } from './analyze/postImages.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const GOLDEN_PATH = join(ROOT, 'data/golden/seed-extract.json');
const EVAL_DIR = join(ROOT, 'data/raw/eval');
const BODY_DIR = join(EVAL_DIR, 'bodies');
const EXTRACT_DIR = join(EVAL_DIR, 'extract');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
};

function loadGolden() {
  if (!existsSync(GOLDEN_PATH)) throw new Error('data/golden/seed-extract.json 이 없다 — 먼저 pnpm data:eval golden');
  return readJson(GOLDEN_PATH);
}

// 앱 TS 는 동적으로 — 확장자 훅이 먼저 깔려 있어야 eligibility.ts 의 `./dogFee` 가 풀린다.
async function appFns() {
  const { parsePetPolicy, withPolicyFacts } = await import('../src/lib/petPolicy.ts');
  const { judgeEligibility } = await import('../src/lib/eligibility.ts');
  return { parsePetPolicy, withPolicyFacts, judgeEligibility };
}

async function cmdGolden(opts) {
  if (existsSync(GOLDEN_PATH) && !opts.force) {
    throw new Error('data/golden/seed-extract.json 이 이미 있다 — 얼린 정답이라 덮지 않는다(review 가 사라진다). 정말 다시 만들려면 --force');
  }
  const { parsePetPolicy } = await appFns();
  const places = readJson(join(ROOT, 'src/data/places.json'));
  const entries = places.map((p) => buildGoldenEntry(p, parsePetPolicy));
  writeJson(GOLDEN_PATH, {
    about: '시드 장소의 사람 정답(AI 추출 평가용). 형식·보정(review) 방법은 docs/features/extraction-eval.md',
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'src/data/places.json',
    entries,
  });
  console.log(`golden ${entries.length}곳 → data/golden/seed-extract.json`);
}

/** 본문 + 글 제목. 제목은 같은 응답의 og:title 에서 — 운영 분석은 검색 API 의 제목을 넘긴다. 시드엔 제목 칸이 없다. */
async function loadPost(entry) {
  const bodyPath = join(BODY_DIR, `${entry.logNo}.txt`);
  const metaPath = join(BODY_DIR, `${entry.logNo}.meta.json`);
  if (existsSync(bodyPath)) {
    return { body: readFileSync(bodyPath, 'utf8'), title: existsSync(metaPath) ? readJson(metaPath).title : '' };
  }
  let html = '';
  const body = await fetchPostText({ blogId: entry.blogId, logNo: entry.logNo }, async (url, init) => {
    const res = await fetch(url, init);
    if (res.ok) html = await res.clone().text();
    return res;
  });
  const m = /<meta\s+property="og:title"\s+content="([^"]*)"/i.exec(html) ?? /<title>([^<]*)<\/title>/i.exec(html);
  const title = (m?.[1] ?? '').replace(/\s*:\s*네이버 블로그\s*$/, '').trim();
  // 빈 본문(컨테이너 못 찾음)은 캐시하지 않는다 — 다음 실행에 다시 받아 본다.
  if (body) {
    mkdirSync(BODY_DIR, { recursive: true });
    writeFileSync(bodyPath, body);
    writeJson(metaPath, { title });
  }
  return { body, title };
}

const extractDir = (version, model, variant = '') => join(EXTRACT_DIR, `${version}-${variant ? `${variant}-` : ''}${model}`);

/** 실험(--images): 글 HTML 에서 사진을 골라 메모리로 받는다. HTML 은 캐시하지 않는다(본문 캐시는 텍스트뿐). */
async function loadImages(entry, maxImages) {
  const res = await fetch(postViewUrl(entry.blogId, entry.logNo), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return { images: [], picks: [], skipped: [], candidates: 0 };
  const candidates = postImageCandidates(await res.text());
  const picks = selectPostImages(candidates, maxImages);
  const { images, skipped } = await downloadImages(picks);
  return { images, picks, skipped, candidates: candidates.length };
}

async function cmdExtract(opts) {
  const golden = loadGolden();
  const targets = selectTargets(golden.entries, opts.only);
  if (opts.only.length && targets.length === 0) throw new Error(`--only 에 맞는 golden 항목이 없다: ${opts.only.join(', ')}`);
  const variant = variantTag(opts);
  const dir = extractDir(PROMPT_VERSION, MODEL, variant);
  const meter = createUsageMeter('추출');
  const stats = { cached: 0, done: 0, noBody: 0, failed: 0 };
  console.log(
    `프롬프트 ${PROMPT_VERSION} · 모델 ${MODEL}${opts.images ? ` · 사진 ${opts.maxImages}장까지(안내문 ${IMAGE_ADDENDUM_VERSION})` : ''} · 대상 ${targets.length}곳${Number.isFinite(opts.limit) ? ` · 호출 상한 ${opts.limit}` : ''}`,
  );

  for (const entry of targets) {
    const out = join(dir, `${entry.logNo}.json`);
    if (existsSync(out) && !opts.refresh) {
      stats.cached += 1;
      continue;
    }
    if (stats.done + stats.failed >= opts.limit) break;
    const label = `${entry.name} (logNo ${entry.logNo})`;
    let post;
    try {
      post = await loadPost(entry);
    } catch (e) {
      stats.noBody += 1;
      console.log(`  ✗ ${label} — 본문 요청 실패: ${e.status ?? e.name}`);
      continue;
    }
    if (!post.body) {
      stats.noBody += 1;
      console.log(`  ✗ ${label} — 본문 없음(컨테이너를 못 찾았다)`);
      continue;
    }
    let shots = null;
    if (opts.images) {
      try {
        shots = await loadImages(entry, opts.maxImages);
      } catch (e) {
        // 사진을 못 받아도 글은 돌린다 — 그 글은 텍스트로만 부른 셈이고 imagesSent 0 으로 남아 compare 가 따로 짚는다.
        shots = { images: [], picks: [], skipped: [], candidates: 0, error: e.name };
      }
    }
    try {
      // 글마다 토큰을 캐시에 남긴다(compare 의 글당 비용). 전체 합은 meter 가 그대로 센다.
      const postMeter = createUsageMeter('추출');
      let costUsd = null;
      const both = { add: (u) => (meter.add(u), postMeter.add(u)) };
      // keyword 는 비운다 — 운영은 수집 검색어를 넘기지만 시드 글엔 없다. 장소 이름을 넣으면 정답을 흘린다.
      const places = await extractPlaces(runClaudeCli, { title: post.title, keyword: '', url: entry.reviewUrl }, post.body, both, {
        images: shots?.images ?? [],
        onResult: (r) => {
          costUsd = typeof r?.total_cost_usd === 'number' ? r.total_cost_usd : null;
        },
      });
      const imageMeta = shots && {
        addendumVersion: IMAGE_ADDENDUM_VERSION,
        maxImages: opts.maxImages,
        candidates: shots.candidates,
        imagesSent: shots.images.length,
        // 고른 사진의 주소·이유만 — 사진 자체는 남기지 않는다(ADR-002).
        picks: shots.picks.map(({ url, width, height, index, reason }) => ({ url, width, height, index, reason })),
        sent: shots.images.map(({ url, bytes, mediaType }) => ({ url, bytes, mediaType })),
        skipped: shots.skipped,
        ...(shots.error ? { imageError: shots.error } : {}),
      };
      writeJson(out, {
        placeId: entry.placeId,
        logNo: entry.logNo,
        promptVersion: PROMPT_VERSION,
        model: MODEL,
        title: post.title,
        extractedAt: new Date().toISOString(),
        usage: postMeter.totals(),
        costUsd,
        ...(imageMeta ? { images: imageMeta } : {}),
        places,
      });
      stats.done += 1;
      const t = postMeter.totals();
      console.log(
        `  ✓ ${label} — 장소 ${places.length}곳${shots ? ` · 사진 ${shots.images.length}/${shots.picks.length}장(후보 ${shots.candidates})` : ''} · 입력 ${t.input + t.cacheRead + t.cacheWrite} · 출력 ${t.output} 토큰`,
      );
    } catch (e) {
      stats.failed += 1;
      console.log(`  ✗ ${label} — ${e.name}${e.code ? `(${e.code})` : ''}: ${e.message}`);
      // 로그인 안 됨·CLI 없음·세션 한도는 나머지 글도 같다 — 멈춘다.
      if (isFatal(e) || e.code === 'limit') {
        console.log('  멈춤 — 같은 이유로 나머지도 실패한다. 원인을 고치거나 한도가 풀린 뒤 다시 돌리면 캐시 다음부터 이어 간다.');
        break;
      }
    }
  }
  console.log(`추출 ${stats.done} · 캐시 ${stats.cached} · 본문 없음 ${stats.noBody} · 실패 ${stats.failed}`);
  console.log(meter.summary());
}

/**
 * --prompt 가 있으면 그 버전의 캐시 폴더(모델이 다르면 접두어로 찾는다), 없으면 지금 버전·모델. variant 는 '' 또는 `img<N>`.
 * 텍스트만(variant '') 찾을 때 `-img` 폴더를 집지 않는다 — 모델 이름은 img 로 시작하지 않는다.
 */
function pickExtractDir(prompt, variant = '') {
  if (!prompt) return { dir: extractDir(PROMPT_VERSION, MODEL, variant), version: PROMPT_VERSION, model: MODEL };
  const exact = extractDir(prompt, MODEL, variant);
  if (existsSync(exact)) return { dir: exact, version: prompt, model: MODEL };
  const head = `${prompt}-${variant ? `${variant}-` : ''}`;
  const found = existsSync(EXTRACT_DIR)
    ? readdirSync(EXTRACT_DIR).find((d) => d.startsWith(head) && (variant || !d.slice(head.length).startsWith('img')))
    : null;
  if (!found) throw new Error(`프롬프트 ${prompt}${variant ? ` · ${variant}` : ''} 의 추출 캐시가 없다(data/raw/eval/extract/)`);
  return { dir: join(EXTRACT_DIR, found), version: prompt, model: found.slice(head.length) };
}

/** golden 전부를 한 캐시 폴더로 채점. 줄마다 캐시의 usage·비용·보낸 사진 수를 붙인다(compare 가 읽는다). */
function scoreDir(golden, dir, fns) {
  return golden.entries.map((entry) => {
    const p = join(dir, `${entry.logNo}.json`);
    const bodyPath = join(BODY_DIR, `${entry.logNo}.txt`);
    const cached = existsSync(p) ? readJson(p) : null;
    const row = scoreEntry(entry, cached, fns, existsSync(bodyPath) ? readFileSync(bodyPath, 'utf8') : null);
    return {
      ...row,
      usage: cached?.usage ?? null,
      costUsd: cached?.costUsd ?? null,
      imagesSent: cached?.images?.imagesSent ?? null,
      addendumVersion: cached?.images?.addendumVersion ?? null,
    };
  });
}

/** 같은 프롬프트·모델이 아닌 가장 최근 요약 — 비교 대상. */
function previousSummary(currentPath) {
  if (!existsSync(EVAL_DIR)) return null;
  const files = readdirSync(EVAL_DIR)
    .filter((f) => /^score-.+\.json$/.test(f))
    .map((f) => join(EVAL_DIR, f))
    .filter((p) => p !== currentPath)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files.length ? readJson(files[0]) : null;
}

async function cmdScore(opts) {
  const golden = loadGolden();
  const fns = await appFns();
  const variant = variantTag(opts);
  const { dir, version, model } = pickExtractDir(opts.prompt, variant);
  const results = scoreDir(golden, dir, fns);
  // 요약의 promptVersion 에 variant 를 붙인다 — 다음 score 의 비교 줄이 텍스트만/사진을 구별해 찍는다.
  const tag = variant ? `${version}-${variant}` : version;
  const summary = summarize(results, { promptVersion: tag, model, scoredAt: new Date().toISOString() });

  const drift = parserDrift(golden.entries, fns.parsePetPolicy);
  if (drift.length) {
    console.log(`⚠ 지금 파서가 golden expected 와 다르게 읽는 곳 ${drift.length}곳(${drift.slice(0, 5).join(', ')}${drift.length > 5 ? ' …' : ''}) — golden 은 얼린 값 그대로 채점한다`);
  }
  for (const line of formatSummary(summary)) console.log(line);

  const summaryPath = join(EVAL_DIR, `score-${tag}-${model}.json`);
  const prev = previousSummary(summaryPath);
  if (prev) {
    console.log('');
    for (const line of diffSummaries(prev, summary)) console.log(line);
  }
  writeJson(summaryPath, summary);
  const reportPath = join(EVAL_DIR, `report-${tag}.md`);
  writeFileSync(reportPath, formatReport(results, summary));
  console.log(`\n요약 → ${summaryPath.slice(ROOT.length + 1)} · 어긋난 곳 전부 → ${reportPath.slice(ROOT.length + 1)}`);
}

/** 텍스트만 캐시와 사진 캐시를 같은 글끼리 견준다. Claude 호출 0. */
async function cmdCompare(opts) {
  const golden = loadGolden();
  const fns = await appFns();
  const text = pickExtractDir(opts.prompt, '');
  const img = pickExtractDir(opts.prompt, variantTag(opts));
  const cmp = compareVariants(scoreDir(golden, text.dir, fns), scoreDir(golden, img.dir, fns), {
    promptVersion: text.version,
    model: img.model,
    maxImages: opts.maxImages,
  });
  if (cmp.n === 0) throw new Error('두 캐시에 같이 있는 글이 없다 — 먼저 pnpm data:eval extract 와 extract --images 를 같은 글로 돌린다');
  for (const line of formatComparison(cmp)) console.log(line);
}

let opts;
try {
  opts = parseEvalArgs(process.argv.slice(2), { defaultMaxImages: DEFAULT_MAX_IMAGES });
} catch (e) {
  console.error(`${e.message} — ${EVAL_USAGE}`);
  process.exit(1);
}
try {
  if (opts.command === 'golden') await cmdGolden(opts);
  else if (opts.command === 'extract') await cmdExtract(opts);
  else if (opts.command === 'compare') await cmdCompare(opts);
  else await cmdScore(opts);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
