// 터미널 숨김 입력. `pnpm data:login` 의 비밀번호와 `pnpm data:collect` 의 네이버 검색 키(env 가 없을 때) — 두 소유자라 owner-prefix 를 붙이지 않는다.
// raw 모드로 한 글자씩 받아 **글자 수만큼 `*` 를 찍고**, readline 의 비공개 API(_writeToOutput)에 기대지 않는다. 받은 값은 호출자에게 돌려줄 뿐 어디에도 남기지 않는다.
//
// **왜 완전 무표시가 아니라 마스킹인가**(2026-09-28). 처음엔 아무것도 안 찍었는데, 그러면 **붙여넣기가 들어갔는지조차 알 수 없다** —
// 네이버 키 401 을 쫓을 때 값이 문제인지 설정이 문제인지 사용자가 가릴 방법이 없었고, 그게 BUG-006 을 어렵게 만든 조건이었다.
// `*` 는 "들어갔다"와 "몇 글자"를 돌려준다. 그 둘이 붙여넣기 사고(잘림·중복·아예 안 들어감)를 그 자리에서 잡는다.
// **내주는 것은 길이 하나다** — 어깨너머로 보는 사람에게 자릿수가 노출된다. 값·글자는 여전히 안 찍히고,
// 이 앱의 위협 모델(에이전트가 값을 읽는 것 · 파일에 남는 것)과도 무관하다. `sudo` 처럼 아무것도 안 보여 주는 쪽을
// 택하지 않은 이유는, 여기 입력이 **사람이 외워 치는 비밀번호가 아니라 붙여넣는 20자 난수**여서다.
//
// 지우기는 `\b \b`(뒤로·공백·뒤로)로 되돌린다. 줄바꿈을 넘어간 `*` 는 대부분의 터미널에서 `\b` 가 못 넘어가므로
// 아주 긴 값에서는 지운 자국이 남을 수 있다 — 값은 정확하고 화면만 어긋난다. 키 길이(20자 안팎)에선 일어나지 않는다.
// 키 하나가 여러 바이트로 오는 것(방향키·F1~F4·Alt+키)을 버리는 규칙이 핵심이다 — 섞이면 "틀린 비밀번호" 가 된다. 그 규칙은 순수 리듀서로 떼어
// 테스트하고(login.mjs 는 TTY 가드 때문에 import 하면 exit 한다), 터미널을 만지는 부분은 얇은 래퍼로 둔다.

// 이스케이프 시퀀스의 세 모양(ECMA-48). CSI 와 SS3 는 chunk 가 갈려 와도 이어 받아야 해서 mode 를 state 에 둔다.
//   ESC [ … 최종(0x40–0x7E)   CSI — 방향키(normal 모드)·Delete(ESC [ 3 ~)·Ctrl+방향키(ESC [ 1 ; 5 C)
//   ESC O 최종(0x40–0x7E)      SS3 — 방향키(application 모드)·F1~F4. 예전 코드는 여기서 'O' 를 최종 바이트로 봐 'A' 가 비밀번호에 섞였다.
//   ESC <그 외>                Alt+키 — 같은 chunk 에 함께 온 것만. ESC 만 온 chunk 는 단독 ESC 로 보고 버린다(raw 모드에선 키 하나가
//                              chunk 하나라, 사람이 다음 글자를 같은 chunk 에 넣을 수 없다). 예전 코드는 다음 chunk 의 글자를 최종 바이트로 오인해 버렸다.
//   ESC ESC …                  Meta 접두는 겹친다 — Option-as-Meta(Terminal.app)·Esc+(iTerm2)·tmux 는 Option+방향키를 ESC + 원래 시퀀스로
//                              보내므로 ESC ESC [ A 가 온다. 두 번째 ESC 를 "Alt+ESC" 로 끝내 버리면 뒤의 [A 가 비밀번호에 쌓인다.
// 감수한 것: chunk 하나가 정확히 `ESC [`·`ESC O` 면(Meta 모드의 Alt+[ · Alt+Shift+O) 분할 도착과 구별할 수 없어 다음 키 하나를 함께 버린다.
// 타이머 없이는 못 가르고, 결과는 로그인 한 번 실패라 감수한다.
const isFinal = (c) => c >= 0x40 && c <= 0x7e;
const isCsiBody = (c) => c >= 0x20 && c <= 0x3f; // 파라미터(0x30–0x3F)·중간(0x20–0x2F)

export const readHiddenInit = Object.freeze({ buf: '', mode: 'text' });

// 순수 리듀서: (state, chunk) → 새 state. state = { buf, mode: 'text'|'esc'|'csi'|'ss3', done?: 'submit'|'cancel' }. done 뒤의 입력은 무시.
// Ctrl-C/Ctrl-D 는 mode 와 무관하게 취소한다 — 시퀀스 도중이라고 사용자를 가두지 않는다.
export function readHiddenStep(state, chunk) {
  if (state.done) return state;
  let { buf, mode } = state;
  for (const ch of chunk) {
    const c = ch.codePointAt(0);
    if (c === 0x03 || c === 0x04) return { buf, mode: 'text', done: 'cancel' };
    if (mode === 'esc') {
      if (c === 0x1b) continue; // 겹친 Meta 접두 — esc 를 유지해야 뒤의 [A 가 시퀀스로 잡힌다
      mode = ch === '[' ? 'csi' : ch === 'O' ? 'ss3' : 'text';
      continue;
    }
    if (mode === 'csi') {
      if (c === 0x1b) mode = 'esc'; // 깨진 시퀀스 직후의 새 시퀀스 — 여기서 text 로 떨어지면 새 시퀀스 본체가 샌다
      else if (isFinal(c)) mode = 'text';
      else if (!isCsiBody(c)) mode = 'text'; // 시퀀스에 올 수 없는 바이트 — 깨진 시퀀스로 보고 함께 버린다
      continue;
    }
    if (mode === 'ss3') {
      mode = c === 0x1b ? 'esc' : 'text';
      continue;
    }
    if (ch === '\r' || ch === '\n') return { buf, mode: 'text', done: 'submit' };
    if (c === 0x1b) mode = 'esc';
    else if (c === 0x7f || c === 0x08) buf = Array.from(buf).slice(0, -1).join(''); // 코드포인트 단위 — 한글·이모지가 반쪽으로 남지 않게
    else if (c >= 0x20) buf += ch;
  }
  return { buf, mode: mode === 'esc' ? 'text' : mode };
}

// 터미널 래퍼. stdin/stdout 을 주입할 수 있어 가짜 스트림으로도 돈다. raw 모드는 끝나는 두 경로(제출·취소) 모두에서 되돌린다.
export function readHidden(prompt, { stdin, stdout } = process) {
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let state = readHiddenInit;
    let shown = 0; // 화면에 찍어 둔 `*` 개수. 리듀서는 순수하게 두고, 화면 맞추기는 이 얇은 래퍼의 몫이다.
    const onData = (chunk) => {
      state = readHiddenStep(state, chunk);
      // 길이는 **코드포인트 단위**로 센다 — 리듀서의 지우기가 그 단위라, 여기서 어긋나면 한글·이모지에서 `*` 가 남거나 모자란다.
      const length = [...state.buf].length;
      if (length > shown) stdout.write('*'.repeat(length - shown));
      else if (length < shown) stdout.write('\b \b'.repeat(shown - length));
      shown = length;
      if (!state.done) return;
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      if (state.done === 'cancel') reject(new Error('취소'));
      else resolve(state.buf);
    };
    stdin.on('data', onData);
  });
}
