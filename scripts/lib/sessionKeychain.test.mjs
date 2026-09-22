import { describe, expect, it } from 'vitest';
import { deleteSession, readSession, writeSession } from './sessionKeychain.mjs';

// 서명 없는 가짜 JWT — 여기선 모양만 본다(값을 찍지 않는 것도 함께 본다).
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const TOKEN = jwt({ sub: 'u1', exp: 1_800_000_000 });

// spawnSync 결과 모양. 진짜 `security` 는 부르지 않는다 — deny 된 명령이고, 테스트가 사용자 키체인을 건드려선 안 된다.
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const exit = (status, stderr = '') => ({ status, stdout: '', stderr });
const spawnError = (code) => ({ status: null, stdout: null, stderr: null, error: Object.assign(new Error(code), { code }) });

// 호출을 기록하고 결과를 순서대로 돌려주는 run.
function fakeRun(...results) {
  const calls = [];
  const run = (args, input) => { calls.push({ args, input }); return results.shift(); };
  return { run, calls };
}

describe('readSession', () => {
  it('stdout 을 trim 해 돌려준다', () => {
    const { run, calls } = fakeRun(ok(`${TOKEN}\n`));
    expect(readSession({ run })).toBe(TOKEN);
    expect(calls[0].args).toEqual(['find-generic-password', '-s', 'zgnn', '-a', 'SUPABASE_SESSION', '-w']);
  });

  it('없음(exit 44)·security 없음(ENOENT, Linux 러너)·빈 stdout 은 undefined — "로그인 안 됨"', () => {
    expect(readSession({ run: () => exit(44) })).toBeUndefined();
    expect(readSession({ run: () => spawnError('ENOENT') })).toBeUndefined();
    expect(readSession({ run: () => ok('') })).toBeUndefined();
    expect(readSession({ run: () => ok('  \n') })).toBeUndefined();
  });

  it('그 밖의 exit 는 throw 하고 exit 코드를 말한다 — 잠긴 키체인을 "로그인 안 됨" 으로 오진하지 않게', () => {
    expect(() => readSession({ run: () => exit(36, 'User interaction is not allowed.') })).toThrow(/security exit 36.*User interaction/s);
  });

  it('spawn 자체가 실패하면(EACCES) 그 error 를 그대로 던진다', () => {
    expect(() => readSession({ run: () => spawnError('EACCES') })).toThrow(expect.objectContaining({ code: 'EACCES' }));
  });
});

describe('writeSession', () => {
  it('JWT(세그먼트 3개) 가 아니면 저장하지 않는다 — security 를 부르지도 않는다', () => {
    const { run, calls } = fakeRun();
    for (const bad of ['sb_secret_x', 'a.b', 'a.b.c.d', '', 'a b.c.d', `${TOKEN}\n`, [TOKEN], { toString: () => TOKEN }, undefined]) {
      expect(() => writeSession(bad, { run })).toThrow(/JWT/);
    }
    expect(calls).toHaveLength(0);
  });

  it('argv 는 -i 뿐이고 토큰은 stdin 에만 실린다(ps 에 안 보이게). 다시 읽어 같으면 조용히 끝난다', () => {
    const { run, calls } = fakeRun(ok(), ok(`${TOKEN}\n`));
    expect(() => writeSession(TOKEN, { run })).not.toThrow();
    expect(calls).toHaveLength(2);
    expect(calls[0].args).toEqual(['-i']);
    expect(calls[0].input).toContain(`-w ${TOKEN}\n`);
    expect(calls[1].args[0]).toBe('find-generic-password'); // readback 도 같은 run 으로
  });

  it('실패 stderr 에 토큰이 되돌아와도 메시지엔 <token> 으로 지워진다', () => {
    const { run } = fakeRun(exit(1, `add-generic-password -U -s zgnn -a SUPABASE_SESSION -w ${TOKEN}: failed`));
    let msg = '';
    try { writeSession(TOKEN, { run }); } catch (e) { msg = e.message; }
    expect(msg).toMatch(/저장하지 못했다.*security exit 1/s);
    expect(msg).toContain('<token>');
    expect(msg).not.toContain(TOKEN);
  });

  it('다시 읽은 값이 다르면 throw — 잠긴 키체인·다른 기본 키체인', () => {
    expect(() => writeSession(TOKEN, fakeRun(ok(), ok(jwt({ sub: 'other' }))))).toThrow(/다시 읽은 값이 다르다/);
    expect(() => writeSession(TOKEN, fakeRun(ok(), exit(44)))).toThrow(/다시 읽은 값이 다르다/);
  });
});

describe('deleteSession — 멱등', () => {
  it('지웠으면 true, 원래 없었으면(44·ENOENT) false', () => {
    expect(deleteSession({ run: () => ok() })).toBe(true);
    expect(deleteSession({ run: () => exit(44) })).toBe(false);
    expect(deleteSession({ run: () => spawnError('ENOENT') })).toBe(false);
  });

  it('그 밖의 실패는 throw', () => {
    expect(() => deleteSession({ run: () => exit(36, 'locked') })).toThrow(/지우지 못했다.*security exit 36/s);
    expect(() => deleteSession({ run: () => spawnError('EACCES') })).toThrow(expect.objectContaining({ code: 'EACCES' }));
  });
});
