// `pnpm data:login` — Supabase Auth 사용자(운영자)로 로그인해 access token 하나를 키체인에 넣는다(ADR-016 v4).
// 이 뒤로 `pnpm data:*` 가 그 토큰으로 붙고, `exp`(대시보드 JWT expiry)가 지나면 다시 이 명령을 부르라고 멈춘다.
// 사용자 터미널에서만 돈다 — TTY 가 아니면(에이전트가 부르면) 거부. 비밀번호는 화면에 찍지 않고, 토큰도 찍지 않는다.
// refresh token 은 버린다(무료 플랜엔 세션 타임박스가 없어 저장하면 영구 로그인이 된다). "하루 한 번 로그인" 이 요구사항이다.
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { writeSession } from './lib/sessionKeychain.mjs';
import { PROJECT_REF, PUBLISHABLE_KEY, jwtExpiresAt, projectUrl, sessionTtlProblem } from './lib/supabaseClient.mjs';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('pnpm data:login 은 사용자 터미널에서만 된다(TTY 아님). 에이전트 세션이 아니라 별도 터미널에서 실행.');
  process.exit(1);
}
if (process.env.CLAUDECODE) {
  console.error('Claude Code 세션 안이다 — 비밀번호가 대화 기록에 실릴 수 있다. 별도 터미널에서 실행.');
  process.exit(1);
}
if (!PUBLISHABLE_KEY) {
  console.error('publishable 키가 코드에 없다 — scripts/lib/supabaseClient.mjs 의 PUBLISHABLE_KEY.');
  process.exit(1);
}

// 비밀번호: raw 모드로 한 글자씩 받아 화면에 아무것도 찍지 않는다. readline 의 비공개 API(_writeToOutput)에 기대지 않는다.
// Ctrl-C/Ctrl-D 는 취소, 방향키 같은 이스케이프 시퀀스와 제어문자는 버린다(섞이면 "틀린 비밀번호" 가 된다), 백스페이스는 코드포인트 단위로 지운다.
function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    let esc = false;
    const done = (fn) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      fn();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\u0003' || ch === '\u0004') return done(() => reject(new Error('취소')));
        if (ch === '\r' || ch === '\n') return done(() => resolve(buf));
        if (ch === '\u001b') { esc = true; continue; }
        if (esc) { if (/[A-Za-z~]/.test(ch)) esc = false; continue; } // CSI 시퀀스의 최종 바이트까지 버린다
        if (ch === '\u007f' || ch === '\b') buf = Array.from(buf).slice(0, -1).join('');
        else if (ch >= ' ') buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}
// 예외로 빠져나가도 터미널이 raw 모드에 남지 않게.
process.on('exit', () => { try { process.stdin.setRawMode(false); } catch { /* TTY 아님 */ } });

const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question(`Supabase 로그인(${PROJECT_REF}) — 이메일: `)).trim();
rl.close();
if (!email) {
  console.error('이메일이 비었다.');
  process.exit(1);
}
let password;
try {
  password = await readHidden('비밀번호: ');
} catch {
  process.exit(130);
}

const supabase = createClient(projectUrl(PROJECT_REF), PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  // "Invalid login credentials" 등 GoTrue 의 문구. 값은 없다.
  console.error(`로그인 실패: ${error.message}`);
  process.exit(1);
}

const token = data.session.access_token;
const exp = jwtExpiresAt(token);
// 요구 ⑤ — 하루 넘는 토큰은 키체인에 넣지 않는다(supabaseClient 도 같은 검사로 거부하지만, 애초에 남기지 않는다).
const tooLong = exp !== undefined && sessionTtlProblem(exp, Date.now() / 1000);
if (tooLong) {
  console.error(tooLong);
  process.exit(1);
}
writeSession(token);
console.log(`로그인 완료 — ${email}. 세션 만료: ${exp ? new Date(exp * 1000).toLocaleString('ko-KR') : '알 수 없음'} (대시보드 JWT expiry). 그 뒤엔 다시 pnpm data:login.`);
