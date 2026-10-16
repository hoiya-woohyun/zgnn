// 정적 번들(out/)에 시크릿이 구워지는 것을 빌드 실패로 잡는다.
//   `output: 'export'` 라 `NEXT_PUBLIC_` 이 붙은 env 는 out/ 의 JS 에 평문으로 들어간다 —
//   누군가 실수로 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` 라고 적는 날을 위한 자물쇠다(docs/todo/05-security.md).
// `pnpm build`(next build --webpack 뒤) 와 Vercel 빌드 양쪽에서 돈다. 의존성은 node:fs/node:path 와 공개 상수 하나뿐이다.
//
// 2026-09-29(ADR-018)부터 번들에 Supabase 가 **하나만** 들어간다 — 운영자 검수 화면(/admin)이 publishable 키로 우리 프로젝트를 부른다.
// 그래서 `supabase.co` 를 통째로 막던 규칙을 "우리 호스트가 아닌 supabase.co" 로 좁혔다. 시크릿 패턴(service 키 이름·secret 접두·JWT 형태)은
// 그대로다 — 좁힌 것은 호스트 한 줄뿐이고, 그 한 줄이 "다른 프로젝트로 데이터가 새는" 오타를 계속 잡는다.
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { PROJECT_REF } from './lib/supabasePublic.mjs';
import { firstOverlap, privateNeedles, squash } from './lib/bundleLeak.mjs';
import { extRanges, glyphsOutsideCore, judgeSwPrecache } from './lib/bundleSwPrecache.mjs';

const OUT_DIR = new URL(process.env.CHECK_BUNDLE_OUT ?? '../out/', import.meta.url);
const SOURCE_CACHE = new URL(process.env.CHECK_BUNDLE_SOURCE ?? '../data/raw/places-source.json', import.meta.url);
const DATA_DIR = new URL(process.env.CHECK_BUNDLE_DATA ?? '../src/data/', import.meta.url);
const EXT_CSS = new URL(process.env.CHECK_BUNDLE_EXT_CSS ?? '../src/styles/appSansExt.css', import.meta.url);
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.txt', '.webmanifest', '.map']);

// 각 패턴이 왜 시크릿 유출 신호인지 한 줄씩.
const PATTERNS = [
  { name: 'service_role', re: /service_role/g, why: 'Supabase service role 키 이름 자체가 노출' },
  { name: 'sk-ant-', re: /sk-ant-[A-Za-z0-9_-]{10,}/g, why: 'Anthropic API 키 접두' },
  { name: 'sb_secret_', re: /sb_secret_[A-Za-z0-9_-]{10,}/g, why: 'Supabase secret 키 접두' },
  // 헤더.페이로드 두 조각이 다 base64url 이어야 JWT 로 본다 — 그냥 `eyJ` 만 잡으면 오탐이 난다.
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\./g, why: 'JWT 형태(Supabase 키류)' },
  // 우리 프로젝트 호스트(`<ref>.supabase.co`)만 통과시킨다. lookbehind 로 ref 를 앞에 두고 보므로 `https://다른ref.supabase.co` ·
  // `evil.supabase.co` 는 그대로 걸린다. supabasePublic.mjs 가 주소를 **리터럴**로 들고 있는 이유가 이 검사다 —
  // 템플릿(`https://${ref}.supabase.co`)으로 조립하면 번들엔 `.supabase.co` 조각만 남아 자기 호스트도 걸린다.
  //
  // 두 번째 lookbehind(`*.`)는 **라이브러리 리터럴 하나**를 위한 허용이다 — `@supabase/supabase-js` 의
  // `getDefaultPropagationTargets` 가 `targets.push("*.supabase.co", "*.supabase.in")` 로 trace context 를
  // 흘려도 되는 도메인 목록을 만든다(dist/index.mjs:188). 우리가 부르는 주소가 아니라 그 라이브러리의 상수라
  // 지울 수 없고, 와일드카드 앞의 `*.` 는 호스트 이름에 들어갈 수 없는 글자라 실제 오타(`다른ref.supabase.co`)와
  // 섞이지 않는다. /admin 이 supabase-js 를 번들에 넣은 2026-09-29(ADR-018)부터 나온다.
  {
    name: 'supabase.co',
    re: new RegExp(String.raw`(?<!${PROJECT_REF}\.)(?<!\*\.)supabase\.co`, 'g'),
    why: `앱 번들이 부르는 Supabase 는 ${PROJECT_REF}.supabase.co 하나뿐이다(ADR-018) — 다른 호스트 문자열은 잘못됐다`,
  },
];

async function listFiles(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childUrl = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dirUrl);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(childUrl)));
    } else if (TEXT_EXTENSIONS.has(extname(entry.name))) {
      files.push(childUrl);
    }
  }
  return files;
}

// 시크릿 값 자체는 남기지 않는다 — 매치의 앞 8자만 두고 나머지는 마스킹.
const mask = (matched) => (matched.length <= 8 ? matched : `${matched.slice(0, 8)}…`);

let outStat;
try {
  outStat = await stat(OUT_DIR);
} catch {
  console.error('번들 유출 검사 실패: out/ 이 없다 — 빌드가 아직 안 돌았다.');
  process.exit(1);
}
if (!outStat.isDirectory()) {
  console.error('번들 유출 검사 실패: out/ 이 디렉터리가 아니다.');
  process.exit(1);
}

const files = await listFiles(OUT_DIR);
let leaked = false;

for (const fileUrl of files) {
  const content = await readFile(fileUrl, 'utf8');
  for (const { name, re, why } of PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content))) {
      leaked = true;
      const start = Math.max(0, match.index - 20);
      const end = Math.min(content.length, match.index + match[0].length + 20);
      const context = content.slice(start, match.index) + mask(match[0]) + content.slice(match.index + match[0].length, end);
      console.error(`[${name}] ${fileUrl.pathname} — ${why}\n  …${context}…`);
    }
  }
}

// 비공개 원문 유출 검사(21 S8.1) — 캐시(원문 포함 행, gitignored)가 있을 때만. 캐시가 없으면(Vercel 은 pull 뒤에야 생긴다) 조용히 건너뛴다.
// **경고만** 한다(exit 0): 15자 이음이 일반 문구와 우연히 겹쳐도 배포를 막지 않는다. 시크릿 패턴과 달리 가림 수준이 "확인" 이라서다.
// 새 원문 줄이 새어 나가는 일은 `places.json` 쪽에서 막고(S8 `derived`), 여기는 그 뒤에서 한 번 더 보는 안전망이다.
let sourceRows = null;
try {
  sourceRows = JSON.parse(await readFile(SOURCE_CACHE, 'utf8'));
} catch {
  sourceRows = null;
}
if (Array.isArray(sourceRows)) {
  const haystack = squash((await Promise.all(files.map((f) => readFile(f, 'utf8')))).join('\n'));
  const warns = [];
  for (const { name, segments } of privateNeedles(sourceRows)) {
    for (const segment of segments) {
      const hit = firstOverlap(segment, haystack);
      if (hit) {
        warns.push(`  - ${name}: "${hit}"`);
        break;
      }
    }
  }
  if (warns.length > 0) {
    console.warn(`번들 원문 경고(배포는 막지 않는다): 비공개 행 원문과 15자 이상 같은 구간이 out/ 에 있다 — ${warns.length}곳. 일반 문구 우연인지 확인해라.\n${warns.join('\n')}`);
  }
}

// 서비스워커 프리캐시 지킴이(14 W261010.33o) — /_next/static/ 항목의 revision 이 전부 null 이어야 한다(next.config.mjs 의 dontCacheBustURLsMatching).
// 목록을 못 읽은 것도 실패다(sw.js 가 minify 돼 있어 정규식이 0건을 집으면 "전부 null" 이 그냥 참이 된다).
let swProblems = [];
try {
  swProblems = judgeSwPrecache(await readFile(new URL('sw.js', OUT_DIR), 'utf8'));
} catch {
  swProblems = ['out/sw.js 를 읽지 못했다 — PWA 빌드(--webpack)가 sw.js 를 만들었는지 봐라.'];
}
for (const problem of swProblems) console.error(`[sw-precache] ${problem}`);
if (swProblems.length > 0) leaked = true;

// 글꼴 Core 밖 데이터 글자 경고(배포는 막지 않는다) — Vercel 빌드는 `pnpm data pull` 로 데이터를 새로 받아, 커밋된 글꼴 분할이 낡을 수 있다.
// 깨지지 않고 그 글자가 나오는 화면이 Ext 를 받아 무거워질 뿐이다. 로컬은 appSansExt.test.ts 가 같은 일을 실패로 잡는다(고칠 명령은 거기 문구).
try {
  const ranges = extRanges(await readFile(EXT_CSS, 'utf8'));
  const jsons = (await readdir(DATA_DIR)).filter((n) => n.endsWith('.json'));
  const text = (await Promise.all(jsons.map((n) => readFile(new URL(n, DATA_DIR), 'utf8')))).join('\n');
  const outside = glyphsOutsideCore(text, ranges);
  if (outside === null) {
    console.warn('글꼴 경고(배포는 막지 않는다): appSansExt.css 에서 unicode-range 를 못 읽었다 — 데이터 글자 검사를 건너뛴다.');
  } else if (outside.length > 0) {
    console.warn(`글꼴 경고(배포는 막지 않는다): 데이터에 Core 글꼴 밖 한글이 ${outside.length}자 있다(${outside.slice(0, 10).join('')}) — 그 글자가 나오는 화면은 Ext 글꼴을 받는다. 고치려면 python3 scripts/split-fonts.py 로 다시 쪼개 woff2·CSS 를 함께 커밋해라.`);
  }
} catch {
  // 데이터 폴더·CSS 가 없는 환경(테스트 등)은 조용히 건너뛴다.
}

if (leaked) {
  console.error('번들 유출 검사 실패: 위 항목을 확인해라.');
  process.exit(1);
}

console.log(`번들 유출 검사 통과: ${files.length} 파일`);
