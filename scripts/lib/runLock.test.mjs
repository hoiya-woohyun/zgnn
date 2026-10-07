import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acquireRunLock } from './runLock.mjs';

const lockPath = () => join(mkdtempSync(join(tmpdir(), 'runlock-')), 'x.lock');

describe('acquireRunLock — pnpm data analyze 동시 실행 막기', () => {
  it('비어 있으면 잡고, release 하면 풀린다', () => {
    const path = lockPath();
    const lock = acquireRunLock(path, { pid: 111 });
    expect(lock.ok).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('111');
    lock.release();
    expect(existsSync(path)).toBe(false);
  });

  it('살아 있는 실행이 잡고 있으면 거절하고 그 pid 를 알려 준다', () => {
    const path = lockPath();
    acquireRunLock(path, { pid: 111 });
    expect(acquireRunLock(path, { pid: 222, alive: () => true })).toEqual({ ok: false, holder: 111 });
  });

  it('잡은 실행이 죽었으면(강제 종료) 이어받는다', () => {
    const path = lockPath();
    acquireRunLock(path, { pid: 111 });
    const lock = acquireRunLock(path, { pid: 222, alive: () => false });
    expect(lock.ok).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('222');
  });

  it('남이 이어받은 잠금은 release 가 지우지 않는다', () => {
    const path = lockPath();
    const first = acquireRunLock(path, { pid: 111 });
    writeFileSync(path, '222');
    first.release();
    expect(readFileSync(path, 'utf8')).toBe('222');
  });

  it('내용이 깨진 잠금 파일은 죽은 것으로 본다', () => {
    const path = lockPath();
    writeFileSync(path, 'garbage');
    expect(acquireRunLock(path, { pid: 333 }).ok).toBe(true);
  });
});
