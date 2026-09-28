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

const OUT_DIR = new URL('../out/', import.meta.url);
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
  {
    name: 'supabase.co',
    re: new RegExp(String.raw`(?<!${PROJECT_REF}\.)supabase\.co`, 'g'),
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

if (leaked) {
  console.error('번들 유출 검사 실패: 위 항목을 확인해라.');
  process.exit(1);
}

console.log(`번들 유출 검사 통과: ${files.length} 파일`);
