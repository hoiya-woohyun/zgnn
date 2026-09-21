// `pnpm data:login` 이 받은 Supabase 세션(access token 하나)을 macOS 키체인에 넣고 꺼낸다(ADR-016 v4).
// 파일이 아니라 키체인인 이유: 레포 어디에도 값이 없어야 에이전트가 `cat` 으로 볼 수 없다. 읽는 명령
// (`security find-generic-password`)은 .claude/settings.json 이 deny 하고, 이 모듈은 값을 프로세스 안에서만 쓰고 찍지 않는다.
// refresh token 은 저장하지 않는다 — 무료 플랜엔 세션 타임박스가 없어 저장하면 사실상 영구 로그인이 된다. access token 의
// `exp`(대시보드 JWT expiry)가 곧 "하루 한 번 로그인" 이다.
import { spawnSync } from 'node:child_process';

const SERVICE = 'zgnn';
const ACCOUNT = 'SUPABASE_SESSION';

function run(args, input) {
  return spawnSync('security', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
}

// spawn 자체가 실패하면(EACCES 등) status·stderr 가 null 이라 `.trim()` 이 진짜 원인을 덮는다 — error 를 먼저 던진다.
function fail(what, r, scrub = '') {
  if (r.error) throw r.error;
  const raw = (r.stderr ?? '').trim();
  const err = scrub ? raw.replaceAll(scrub, '<token>') : raw;
  throw new Error(`${what}(security exit ${r.status}): ${err}`);
}

// 저장된 토큰 또는 undefined(없음·macOS 가 아님). 다른 실패는 throw — 잠긴 키체인 같은 상태를 "로그인 안 됨" 으로 오진하지 않게.
export function readSession() {
  const r = run(['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w']);
  if (r.error?.code === 'ENOENT') return undefined; // Linux 러너(Actions·Vercel) — 거기선 env 나 publishable 경로를 쓴다
  if (r.status === 44) return undefined; // errSecItemNotFound
  if (r.status !== 0) fail('키체인을 읽지 못했다', r);
  return r.stdout.trim() || undefined;
}

// 토큰을 argv 가 아니라 `security -i` 의 stdin 으로 넘긴다 — argv 는 `ps` 에 잠깐 보인다. -U 는 있으면 덮어쓴다.
// JWT 문자 집합([A-Za-z0-9._-])은 security 의 명령 파서에서 따옴표가 필요 없다.
export function writeSession(token) {
  if (!/^[A-Za-z0-9._-]+$/.test(token)) throw new Error('토큰 형식이 예상과 다르다 — 저장하지 않는다.');
  const r = run(['-i'], `add-generic-password -U -s ${SERVICE} -a ${ACCOUNT} -w ${token}\n`);
  // stderr 가 실패한 명령줄(토큰 포함)을 되돌려 줄 수 있어 메시지에서 지운다. `-i` 가 내부 명령의 실패를 exit 로 전파하는지 확실치 않아 읽어서 확인한다.
  if (r.status !== 0) fail('키체인에 저장하지 못했다', r, token);
  if (readSession() !== token) throw new Error('키체인에 저장했지만 다시 읽은 값이 다르다 — 잠긴 키체인이거나 기본 키체인이 다른지 확인.');
}

// 없어도 성공으로 본다(로그아웃은 멱등).
export function deleteSession() {
  const r = run(['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT]);
  if (r.error?.code === 'ENOENT' || r.status === 44) return false;
  if (r.status !== 0) fail('키체인에서 지우지 못했다', r);
  return true;
}
