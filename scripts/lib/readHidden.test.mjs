import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { readHidden, readHiddenInit, readHiddenStep } from './readHidden.mjs';

const ESC = '\u001b';
// chunk 하나가 raw 모드의 키 하나(또는 붙여넣기 한 덩어리)다 — 인자를 나누면 키를 따로따로 친 것.
const feed = (...chunks) => chunks.reduce(readHiddenStep, readHiddenInit);

describe('readHiddenStep — 글자·제출·취소', () => {
  it('보통 글자는 쌓이고 CR/LF 가 제출이다(buf 그대로)', () => {
    expect(feed('ab', 'c', '\r')).toEqual({ buf: 'abc', mode: 'text', done: 'submit' });
    expect(feed('abc\n').done).toBe('submit');
    expect(feed('한글 pass!').buf).toBe('한글 pass!');
  });

  it('Ctrl-C/Ctrl-D 는 취소 — 시퀀스 도중이어도(사용자를 가두지 않는다)', () => {
    expect(feed('ab', '\u0003')).toMatchObject({ done: 'cancel' });
    expect(feed('ab', '\u0004')).toMatchObject({ done: 'cancel' });
    expect(feed(`${ESC}[`, '\u0003')).toMatchObject({ done: 'cancel' });
  });

  it('done 뒤의 입력은 무시한다', () => {
    const s = feed('a\r');
    expect(readHiddenStep(s, 'zzz')).toBe(s);
  });

  it('DEL/BS 는 코드포인트 하나를 지운다 — 한글·이모지가 반쪽으로 남지 않게', () => {
    expect(feed('한글\u007f').buf).toBe('한');
    expect(feed('a😀\u007f').buf).toBe('a');
    expect(feed('ab\b').buf).toBe('a');
    expect(feed('\u007f').buf).toBe(''); // 빈 상태에서 지워도 오류 없음
  });

  it('그 밖의 제어문자는 버린다', () => {
    expect(feed('a\tb\u0000c').buf).toBe('abc');
  });

  it('입력 state 를 바꾸지 않는다(순수)', () => {
    const before = { buf: 'a', mode: 'text' };
    readHiddenStep(before, 'b\u007f');
    expect(before).toEqual({ buf: 'a', mode: 'text' });
  });
});

describe('readHiddenStep — 이스케이프 시퀀스는 통째로 버린다', () => {
  it('CSI: ESC [ 파라미터·중간 … 최종. 방향키·Ctrl+방향키·Delete', () => {
    expect(feed(`${ESC}[A`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}[1;5C`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}[3~`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}[?25l`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}[ q`)).toEqual({ buf: '', mode: 'text' }); // 중간 바이트(0x20)
    expect(feed(`a${ESC}[Ab`).buf).toBe('ab'); // 시퀀스 뒤 글자는 정상
  });

  it('SS3: ESC O 최종 — application 모드 방향키·F1~F4. 예전엔 O 에서 끝나 A 가 비밀번호에 섞였다', () => {
    expect(feed(`${ESC}OA`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}OP`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`p${ESC}OAq`).buf).toBe('pq');
  });

  it('Alt+키(같은 chunk 의 ESC + 글자)는 둘 다 버린다', () => {
    expect(feed(`${ESC}p`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}\r`)).toEqual({ buf: '', mode: 'text' }); // Alt+Enter 는 제출이 아니다
  });

  it('단독 ESC(chunk 끝에서 esc 상태)는 버리고, 다음 chunk 의 글자는 정상 입력이다 — 예전엔 그 글자가 최종 바이트로 오인돼 사라졌다', () => {
    expect(feed(ESC)).toEqual({ buf: '', mode: 'text' });
    expect(feed('a', ESC, 'p')).toEqual({ buf: 'ap', mode: 'text' });
    expect(feed(ESC, '[A').buf).toBe('[A'); // 갈라져 오면 글자로 남는다 — 단독 ESC 를 버리는 규칙의 대가(스펙 결정)
  });

  it('Meta 접두가 겹친 ESC ESC [ A · ESC ESC O A(Option-as-Meta·Esc+ 의 Option+방향키)도 통째로 버린다', () => {
    expect(feed(`${ESC}${ESC}[A`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}${ESC}OA`)).toEqual({ buf: '', mode: 'text' });
    expect(feed('a', `${ESC}${ESC}[A`, 'b').buf).toBe('ab');
    expect(feed(`${ESC}${ESC}`, 'p')).toEqual({ buf: 'p', mode: 'text' }); // ESC ESC 단독(Alt+ESC) 뒤 글자는 정상
  });

  it('CSI/SS3 도중에 ESC 가 오면(깨진 시퀀스 직후 새 시퀀스) 새 시퀀스도 버린다', () => {
    expect(feed(`${ESC}[${ESC}[A`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}[`, `${ESC}[A`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}O${ESC}OA`)).toEqual({ buf: '', mode: 'text' });
  });

  it('CSI/SS3 도중에 chunk 가 갈려도 state 를 유지해 이어서 버린다', () => {
    expect(feed(`${ESC}[`)).toEqual({ buf: '', mode: 'csi' });
    expect(feed(`${ESC}[`, '3~')).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}[3`, '~', 'x')).toEqual({ buf: 'x', mode: 'text' });
    expect(feed(`${ESC}[1;`, '5C')).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}O`)).toEqual({ buf: '', mode: 'ss3' });
    expect(feed(`${ESC}O`, 'A', 'x')).toEqual({ buf: 'x', mode: 'text' });
    expect(feed(`${ESC}O`, '\r')).toEqual({ buf: '', mode: 'text' }); // SS3 다음 바이트는 범위를 안 본다 — 제출로 새지 않는다
  });

  it('CSI 안에 올 수 없는 바이트가 오면 깨진 시퀀스로 보고 그 바이트까지 버린다', () => {
    expect(feed(`${ESC}[한`)).toEqual({ buf: '', mode: 'text' });
    expect(feed(`${ESC}[\r`)).toEqual({ buf: '', mode: 'text' }); // 제출로 새지 않는다
  });
});

// 가짜 TTY: EventEmitter + raw 모드 토글 기록. 실제 터미널은 건드리지 않는다.
function fakeTty() {
  const stdin = Object.assign(new EventEmitter(), {
    raw: [],
    setRawMode(v) { this.raw.push(v); },
    resume() {},
    pause() {},
    setEncoding() {},
  });
  const stdout = { out: '', write(s) { this.out += s; } };
  return { stdin, stdout };
}

describe('readHidden — 래퍼', () => {
  it('입력을 `*` 로 가려 찍고, 제출하면 buf 로 resolve 하고 raw 모드를 되돌린다', async () => {
    const tty = fakeTty();
    const p = readHidden('비밀번호: ', tty);
    tty.stdin.emit('data', 'se');
    tty.stdin.emit('data', `${ESC}OA`);
    tty.stdin.emit('data', 'cret\r');
    await expect(p).resolves.toBe('secret');
    expect(tty.stdout.out).toBe('비밀번호: ******\n'); // 'secret' 6자 — 방향키(ESC O A)는 `*` 를 늘리지 않는다
    expect(tty.stdin.raw).toEqual([true, false]);
    expect(tty.stdin.listenerCount('data')).toBe(0);
  });

  it('Ctrl-C 면 reject 하고 raw 모드를 되돌린다', async () => {
    const tty = fakeTty();
    const p = readHidden('비밀번호: ', tty);
    tty.stdin.emit('data', 'ab\u0003');
    await expect(p).rejects.toThrow('취소');
    expect(tty.stdin.raw).toEqual([true, false]);
    expect(tty.stdout.out).not.toContain('ab');
  });

  it('같은 stdin 으로 두 번 이어 부를 수 있다(collect-blog 의 id·secret) — 앞 호출의 리스너가 남아 뒤 입력을 삼키지 않는다', async () => {
    const tty = fakeTty();
    const p1 = readHidden('ID: ', tty);
    tty.stdin.emit('data', 'id\r');
    await expect(p1).resolves.toBe('id');
    const p2 = readHidden('SECRET: ', tty);
    tty.stdin.emit('data', 'sec\r');
    await expect(p2).resolves.toBe('sec');
    expect(tty.stdout.out).toBe('ID: **\nSECRET: ***\n');
    expect(tty.stdin.raw).toEqual([true, false, true, false]);
    expect(tty.stdin.listenerCount('data')).toBe(0);
  });
});

// `*` 는 "붙여넣기가 들어갔는가" 를 돌려주려고 있다(BUG-006). 값이 새면 안 되므로 **개수만** 맞는지 본다.
describe('readHidden — 마스킹', () => {
  it('붙여넣기처럼 한 chunk 로 와도 글자 수만큼 `*` 를 찍고 값은 안 찍는다', async () => {
    const tty = fakeTty();
    const p = readHidden('키: ', tty);
    tty.stdin.emit('data', 'AbCdEfGhIjKlMnOpQrSt\r');
    await expect(p).resolves.toBe('AbCdEfGhIjKlMnOpQrSt');
    expect(tty.stdout.out).toBe(`키: ${'*'.repeat(20)}\n`);
    expect(tty.stdout.out).not.toContain('AbCdEf');
  });

  it('지우면 `*` 도 하나 줄어든다', async () => {
    const tty = fakeTty();
    const p = readHidden('키: ', tty);
    tty.stdin.emit('data', 'abc');
    tty.stdin.emit('data', '\u007f'); // Backspace
    tty.stdin.emit('data', '\r');
    await expect(p).resolves.toBe('ab');
    expect(tty.stdout.out).toBe('키: ***\b \b\n');
  });

  // 시퀀스가 `*` 를 늘리면 사용자는 "들어갔다" 고 잘못 읽는다 — 마스킹이 거짓말을 하는 자리라 못 박는다.
  it('방향키·Alt 시퀀스는 버려지므로 `*` 가 늘지 않는다', async () => {
    const tty = fakeTty();
    const p = readHidden('키: ', tty);
    tty.stdin.emit('data', `${ESC}[A`);
    tty.stdin.emit('data', `${ESC}${ESC}[D`);
    tty.stdin.emit('data', 'x\r');
    await expect(p).resolves.toBe('x');
    expect(tty.stdout.out).toBe('키: *\n');
  });

  it('한글·이모지는 코드포인트 하나에 `*` 하나다', async () => {
    const tty = fakeTty();
    const p = readHidden('키: ', tty);
    tty.stdin.emit('data', '가나🐶\r');
    await expect(p).resolves.toBe('가나🐶');
    expect(tty.stdout.out).toBe('키: ***\n');
  });
});
