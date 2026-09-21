// Supabase 클라이언트를 만드는 유일한 곳(ADR-016 로그인 모델). 키는 두 경로로만 들어온다:
//   1. env(SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY) — GitHub Actions·Vercel. 시크릿은 거기서 이미 env 로 들어온다.
//   2. 로컬 — `supabase login` 된 CLI 에게 실행 시점에 받는다(`supabase projects api-keys`). 값을 어디에도 저장하지 않는다:
//      회전하면 다음 실행이 새 키를 받고, 로그인이 없으면 여기서 멈춘다. 값은 이 프로세스 안에만 있고 찍지 않는다 —
//      에이전트(Claude)가 `pnpm data:*` 를 실행해도 키를 볼 수 없다(`supabase projects api-keys` 자체는 .claude/settings.json 이 deny).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = new URL('../../', import.meta.url);

export function projectUrl(ref) {
  return `https://${ref}.supabase.co`;
}

// `supabase projects api-keys -o json` 의 목록에서 쓰기 키 하나. 새 secret 키(sb_secret_…, 개별 폐기 가능)를 우선하고,
// 없으면(아직 안 만든 프로젝트) legacy service_role JWT. 둘 다 없으면 undefined — 호출처가 멈춘다.
export function pickServiceKey(apiKeys) {
  const secret = apiKeys.find((k) => k.type === 'secret' && k.api_key);
  const legacy = apiKeys.find((k) => k.name === 'service_role' && k.api_key);
  return (secret ?? legacy)?.api_key;
}

// pnpm 이 아니라 `node scripts/x.mjs` 로 직접 불러도 devDependency 의 CLI 를 찾도록 node_modules/.bin 을 먼저 본다.
function cliBinary() {
  const local = fileURLToPath(new URL('node_modules/.bin/supabase', ROOT));
  return existsSync(local) ? local : 'supabase';
}

function linkedProjectRef() {
  try {
    return readFileSync(new URL('supabase/.temp/project-ref', ROOT), 'utf8').trim();
  } catch {
    return undefined;
  }
}

// { url, key } 또는 throw. env 가 먼저(CI 와 같은 규칙), 그다음 로그인된 CLI.
export function resolveSupabaseCredentials(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
  const ref = linkedProjectRef();
  if (!ref) throw new Error('Supabase 프로젝트가 link 돼 있지 않다 — `pnpm exec supabase link --project-ref <ref>` 를 먼저(supabase/.temp/project-ref).');
  // --reveal 이 없으면 새 secret 키는 마스킹된 값(sb_secret_…)이 와서 'Invalid API key' 가 난다(실측). legacy JWT 는 항상 전체가 온다.
  const r = spawnSync(cliBinary(), ['projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error?.code === 'ENOENT') throw new Error('Supabase CLI 가 없다 — `pnpm install`.');
  if (r.status !== 0) {
    // 대표적으로 "Access token not provided" — 로그인이 안 돼 있다. 값은 없고 안내만 있는 stderr 라 그대로 보여 준다.
    throw new Error(`Supabase 키를 받지 못했다 — 사용자 터미널에서 \`pnpm exec supabase login\`(브라우저 로그인) 뒤 다시 실행.\n${r.stderr.trim()}`);
  }
  const key = pickServiceKey(JSON.parse(r.stdout));
  if (!key) throw new Error(`프로젝트 ${ref} 에 secret/service_role 키가 없다 — 대시보드 Project Settings → API Keys 확인.`);
  return { url: projectUrl(ref), key };
}

// 스크립트 진입점용: 실패하면 이유를 찍고 exit 1. 조용히 스냅샷으로 넘어가지 않는다(CI 가 옛 데이터로 빌드되는 걸 막는다).
export function createSupabase() {
  let creds;
  try {
    creds = resolveSupabaseCredentials();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  return createClient(creds.url, creds.key, { auth: { persistSession: false } });
}
