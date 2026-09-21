// scripts/secrets.mjs 의 순수 부분 — 어떤 이름이 어디로 흐르는지(SECRETS), `run` 이 시크릿을 넘겨 줄 스크립트(RUNNABLE),
// .env.local 에 시크릿이 남았는지 판정. 키체인·프로세스를 건드리는 코드는 여기 없다 — 그래서 import 해도 부작용이 없고 테스트가 붙는다.
import { parseEnv } from 'node:util';

// 어떤 이름이 어디로 흐르는가. run = 로컬 스크립트 env, gh = GitHub Secrets, vercel = Vercel env.
// 여기 없는 이름은 `set` 도 거부한다 — 오타로 고아 항목이 생기고 `run` 은 모르는 채 지나가는 걸 막는다.
export const SECRETS = {
  SUPABASE_SERVICE_ROLE_KEY: { run: true, gh: true, vercel: true, why: 'RLS 우회 키. data:* 전부·Vercel 빌드(data:pull)' },
  KAKAO_REST_API_KEY: { run: true, gh: true, vercel: false, why: '03 좌표 보강(선택). 지도 JS 키와 다른 키' },
  NAVER_CLIENT_ID: { run: true, gh: true, vercel: false, why: '02 수집' },
  NAVER_CLIENT_SECRET: { run: true, gh: true, vercel: false, why: '02 수집' },
  // 구독 계정 그 자체. 로컬 `claude -p` 는 키체인 로그인을 쓰므로 run 에 넣지 않는다 — env 에 있으면 CLI 가 그걸 먼저 본다.
  CLAUDE_CODE_OAUTH_TOKEN: { run: false, gh: true, vercel: false, why: '03 분석(Actions 전용). `claude setup-token` 으로 발급' },
};

// `run` 이 시크릿을 env 로 넘겨 주는 스크립트 — package.json 의 data:* 중 시크릿이 필요한 다섯(테스트가 드리프트를 잡는다).
// 아무 경로나 받으면 "값을 찍는 한 줄짜리 디버그 스크립트" 가 곧 유출 경로가 된다 — 여기 없는 파일은 거부한다.
export const RUNNABLE = new Set([
  'scripts/pull-db.mjs',
  'scripts/seed-db.mjs',
  'scripts/collect-blog.mjs',
  'scripts/analyze-candidates.mjs',
  'scripts/apply-approved.mjs',
]);

// 프로토타입 이름(`constructor`·`toString`)이 `SECRETS[name]` 을 통과하지 않게.
export function isSecretName(name) {
  return typeof name === 'string' && Object.hasOwn(SECRETS, name);
}

// flow(run|gh|vercel) 에 해당하는 이름들. requested 가 있으면 그중 모르는 이름·그 flow 가 아닌 이름은 에러다.
export function selectNames(flow, requested = []) {
  const eligible = Object.keys(SECRETS).filter((name) => SECRETS[name][flow]);
  if (requested.length === 0) return eligible;
  for (const name of requested) {
    if (!isSecretName(name)) throw new Error(`모르는 이름: ${name}. scripts/lib/secretsFlow.mjs 의 SECRETS 에 먼저 적는다`);
    if (!SECRETS[name][flow]) throw new Error(`${name} 은(는) ${flow} 로 보내지 않는 이름이다(SECRETS 참고)`);
  }
  return requested;
}

// .env.local 에 값과 함께 남아 있으면 안 되는 이름. SECRETS 전부 + 이름만 봐도 비밀인 것(`vercel env pull` 이 남기는 VERCEL_OIDC_TOKEN 등).
// Node 가 `--env-file` 에 쓰는 파서(util.parseEnv)로 읽는다 — `export X=`·따옴표·`# 주석`·CRLF 를 직접 흉내 내면 어긋난다.
// 빈 값(`NAME=` · `NAME=""` · `NAME=  # 주석`)은 .env.example 을 복사한 자리표시자라 시크릿이 아니다.
export function leakedEnvNames(envFileText) {
  return Object.entries(parseEnv(envFileText))
    .filter(([name, value]) => value !== '' && (isSecretName(name) || /(SECRET|TOKEN|PASSWORD|SERVICE_ROLE)/.test(name)))
    .map(([name]) => name);
}
