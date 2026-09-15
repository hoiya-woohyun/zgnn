// 후기 블로그 포스트에서 장소당 최대 3장을 내려받아 data/raw/places 에 저장한다.
//
// ⚠️ 저작권: Notion 의 "후기 포스트" 링크 86개 중 85개는 작성자(짱구누나)가 아닌 다른 블로거의 글이다.
//    남의 사진을 앱에 넣으면 안 되므로, 아래 OWN_BLOG_IDS 에 명시한 블로그(본인 소유)의 포스트만 가져온다.
//    비어 있으면 아무것도 내려받지 않는다.
//
// 실행: node scripts/fetch-blog-images.mjs  → data/place-images.raw.json 매니페스트 생성
// 이후 node scripts/optimize-images.mjs 로 WebP 변환해 public/images/places 에 넣고, node scripts/normalize.mjs 로 반영.
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const OWN_BLOG_IDS = new Set([
  // 예: 'my-naver-blog-id'
]);

const ROOT = new URL('../', import.meta.url);
const SRC = new URL('data/jejudo-notion-export.json', ROOT);
const OUT_DIR = new URL('data/raw/places/', ROOT);
const MANIFEST = new URL('data/place-images.raw.json', ROOT);
const UA = 'Mozilla/5.0';
const MAX_PER_PLACE = 3;
const WIDTH = 'w773'; // 네이버가 지원하는 프리셋: w466 / w580 / w773 / w966

const src = JSON.parse(await readFile(SRC, 'utf8'));
await mkdir(OUT_DIR, { recursive: true });

const jobs = [];
let skipped = 0;
for (const key of ['숙소', '식당', '카페']) {
  for (const row of src[key]) {
    const m = (row['후기 포스트'] ?? '').match(/blog\.naver\.com\/([^/]+)\/(\d+)/);
    if (!m || !OWN_BLOG_IDS.has(m[1])) { skipped++; continue; }
    jobs.push({ id: row._id, name: row['이름'], blogId: m[1], logNo: m[2] });
  }
}
console.log(`대상 ${jobs.length}건, 제외 ${skipped}건 (OWN_BLOG_IDS 에 없는 블로그)`);

async function imageUrlsOf(blogId, logNo) {
  const res = await fetch(`https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const seen = new Set();
  const out = [];
  for (const mm of html.matchAll(/https:\/\/postfiles\.pstatic\.net\/[^"'?\s]+/g)) {
    const u = mm[0];
    if (!/\.(jpe?g|png)$/i.test(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

async function runPool(items, size, fn) {
  const it = items[Symbol.iterator]();
  await Promise.all(Array.from({ length: size }, async () => { for (const x of it) await fn(x); }));
}

const manifest = {};
let files = 0, bytes = 0;
await runPool(jobs, 6, async (job) => {
  try {
    const urls = (await imageUrlsOf(job.blogId, job.logNo)).slice(0, MAX_PER_PLACE);
    const saved = [];
    for (let i = 0; i < urls.length; i++) {
      const res = await fetch(`${urls[i]}?type=${WIDTH}`, { headers: { 'User-Agent': UA, Referer: 'https://blog.naver.com/' } });
      if (!res.ok) { console.warn(`  img ${res.status}: ${job.name}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const file = `${job.id}-${i + 1}.jpg`;
      await writeFile(new URL(file, OUT_DIR), buf);
      saved.push(`data/raw/places/${file}`);
      files++; bytes += buf.length;
    }
    manifest[job.id] = saved;
    if (saved.length === 0) console.warn(`  no images: ${job.name}`);
  } catch (e) {
    console.warn(`  post fail: ${job.name} ${e.message}`);
    manifest[job.id] = [];
  }
});
await writeFile(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`done: ${Object.keys(manifest).length} places, ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
