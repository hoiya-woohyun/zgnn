// 시크릿은 .env.local 이 아니라 macOS 키체인에 둔다(ADR-016). 이 파일이 키체인과 스크립트·GitHub·Vercel 사이의 유일한 통로다.
//   값은 사용자 터미널의 숨김 입력으로만 들어오고(`set`), 나갈 때는 자식 프로세스의 env 나 stdin 파이프로만 흐른다 —
//   화면에 한 번도 찍히지 않으니 에이전트(Claude)가 이 명령들을 실행해도 값을 볼 수 없다. `security` 는 macOS 내장이라 의존성이 없다.
//   Linux(GitHub Actions·Vercel)에는 키체인이 없으니 `run` 은 env 를 그대로 넘긴다 — 거기선 시크릿이 이미 env 로 들어온다.
//   이름 표(SECRETS)·허용 스크립트(RUNNABLE)·판정 함수는 scripts/lib/secretsFlow.mjs(테스트 동반).
//
//   pnpm secrets set <NAME>                         값을 숨김 입력으로 저장. 사용자 터미널에서만(TTY 아니면 거부)
//   pnpm secrets ls                                 어떤 이름이 있는지(값은 안 보인다). .env.local 에 시크릿이 남아 있으면 ⚠
//   pnpm secrets rm <NAME>
//   pnpm secrets push gh [NAME…]                    키체인 → GitHub Secrets(`gh secret set`, stdin 파이프)
//   pnpm secrets push vercel <production|preview> [NAME…]   키체인 → Vercel env(Sensitive, stdin 파이프)
//   pnpm secrets run <script> [args…]               키체인 값을 env 에 넣어 `node --env-file-if-exists=.env.local <script>` 실행(RUNNABLE 만)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { RUNNABLE, SECRETS, isSecretName, leakedEnvNames, selectNames } from './lib/secretsFlow.mjs';

const SERVICE = 'zgnn'; // 키체인 항목의 service. account 가 변수 이름이다
const NOT_FOUND = 44; // errSecItemNotFound(-25300) 의 하위 바이트. 실측: 없는 항목은 44, 그 외 non-zero 는 잠김·권한 등 "읽기 실패"

function fail(message) {
  console.error(message);
  process.exit(1);
}

// `security` 가 없는 환경(Linux)에서는 null. 값을 stdout 으로 받는 건 read 뿐이고, 그 값은 이 프로세스 밖으로 찍지 않는다.
function security(args, opts = {}) {
  const r = spawnSync('security', args, { encoding: 'utf8', ...opts });
  return r.error?.code === 'ENOENT' ? null : r;
}

// 값 | undefined(없음·키체인 없음). "없음" 과 "읽기 실패" 를 구분한다 — 잠김·비 GUI 세션의 실패를 "저장 안 됨" 으로 오인하면
// `ls` 는 `·`, `run` 은 값 없이 진행해 원인을 가리키는 곳이 없어진다.
function read(name) {
  const r = security(['find-generic-password', '-s', SERVICE, '-a', name, '-w'], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (!r || r.status === NOT_FOUND) return undefined;
  if (r.status !== 0) throw new Error(`${name}: 키체인 읽기 실패(exit ${r.status}) — 잠김·권한 프롬프트? ${r.stderr.trim()}`);
  return r.stdout.replace(/\n$/, '');
}

function requireName(name) {
  if (!isSecretName(name)) fail(`모르는 이름: ${name}. scripts/lib/secretsFlow.mjs 의 SECRETS 에 먼저 적는다`);
}

function set(name) {
  requireName(name);
  // TTY 가 아니면 `security` 가 빈 값을 저장하고 0 으로 끝난다(재입력 불일치 뒤 빈 값끼리 일치). 에이전트가 부르면 여기서 멈춘다.
  if (!process.stdin.isTTY) fail(`${name}: 값은 사용자 터미널에서 직접 입력한다 — 파이프·에이전트로는 넣지 않는다`);
  // -w 를 맨 끝에 값 없이 두면 숨김 입력으로 두 번 묻는다. 값이 argv·히스토리·화면 어디에도 남지 않는다.
  const r = security(['add-generic-password', '-U', '-s', SERVICE, '-a', name, '-w'], { stdio: 'inherit' });
  if (!r) fail('macOS 키체인(security) 이 없는 환경이다');
  if (r.status !== 0) fail(`${name}: 저장 실패(exit ${r.status})`);
  console.log(`✓ ${name} → 키체인(${SERVICE})`);
}

function ls() {
  for (const [name, { run, gh, vercel, why }] of Object.entries(SECRETS)) {
    const flows = [run && 'run', gh && 'gh', vercel && 'vercel'].filter(Boolean).join('·');
    let mark = '·';
    try {
      if (read(name) !== undefined) mark = '✓';
    } catch (e) {
      mark = '✗';
      console.error(`⚠ ${e.message}`);
    }
    console.log(`${mark} ${name.padEnd(26)} ${flows.padEnd(13)} ${why}`);
  }
  // 이 프로세스는 .env.local 을 읽어도 된다 — 값은 찍지 않고 이름만 경고한다. 에이전트가 파일을 못 읽어도 이관이 끝났는지 알 수 있게.
  let envFile = '';
  try {
    envFile = readFileSync('.env.local', 'utf8');
  } catch {
    return;
  }
  for (const name of leakedEnvNames(envFile)) {
    console.log(`⚠ ${name} 이(가) .env.local 에 값으로 남아 있다 — 키체인에 둘 값이면 'pnpm secrets set' 으로 옮기고, 그 줄은 지운다`);
  }
}

function rm(name) {
  requireName(name);
  const r = security(['delete-generic-password', '-s', SERVICE, '-a', name], { stdio: 'ignore' });
  if (!r) fail('macOS 키체인(security) 이 없는 환경이다');
  if (r.status === NOT_FOUND) fail(`${name}: 키체인에 없다`);
  if (r.status !== 0) fail(`${name}: 삭제 실패(exit ${r.status})`);
  console.log(`✓ ${name} 삭제`);
}

// 값은 spawnSync 의 input(stdin) 으로만 넘긴다. gh/vercel 은 stdin 에서 값을 읽는다.
function push(target, rest) {
  const env = target === 'vercel' ? rest.shift() : undefined;
  if (target === 'vercel' && !['production', 'preview'].includes(env)) fail('pnpm secrets push vercel <production|preview> [NAME…]');
  if (!['gh', 'vercel'].includes(target)) fail('pnpm secrets push <gh|vercel …> [NAME…]');
  let names;
  try {
    names = selectNames(target, rest);
  } catch (e) {
    fail(e.message);
  }
  for (const name of names) {
    let value;
    try {
      value = read(name);
    } catch (e) {
      fail(e.message);
    }
    if (value === undefined) {
      console.log(`· ${name}: 키체인에 없어 건너뜀`);
      continue;
    }
    const argv =
      target === 'gh' ? ['gh', ['secret', 'set', name]] : ['vercel', ['env', 'add', name, env, '--sensitive', '--force']];
    const r = spawnSync(argv[0], argv[1], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
    if (r.status !== 0) fail(`${name} → ${target} 실패(exit ${r.status})`);
    console.log(`✓ ${name} → ${target}${env ? ` ${env}` : ''}`);
  }
}

function run(script, args) {
  if (!RUNNABLE.has(script)) fail(`pnpm secrets run <${[...RUNNABLE].join('|')}> [args…] — 다른 스크립트에는 시크릿을 넘기지 않는다`);
  const env = { ...process.env };
  // 우선순위는 셸 env > 키체인 > .env.local(실측). 이미 env 에 있으면(CI·셸 export) 그쪽이 이기고, 키체인은 로컬의 빈자리만 채운다.
  for (const name of selectNames('run')) {
    if (env[name] !== undefined) continue;
    let value;
    try {
      value = read(name);
    } catch (e) {
      fail(e.message); // 값 없이 조용히 진행하면 자식이 "키체인을 확인하라" 며 죽고, 원인은 어디에도 안 남는다
    }
    if (value !== undefined) env[name] = value;
  }
  const r = spawnSync(process.execPath, ['--env-file-if-exists=.env.local', script, ...args], { stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case 'set':
    set(rest[0]);
    break;
  case 'ls':
    ls();
    break;
  case 'rm':
    rm(rest[0]);
    break;
  case 'push':
    push(rest[0], rest.slice(1));
    break;
  case 'run':
    run(rest[0], rest.slice(1));
    break;
  default:
    fail('pnpm secrets <set NAME | ls | rm NAME | push gh|vercel … | run SCRIPT …>');
}
