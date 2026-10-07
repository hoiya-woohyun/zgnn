// 한 머신에서 한 번에 하나만 — `pnpm data analyze` 두 개가 동시에 돌면 둘 다 시작할 때 같은 미분석 글을 골라
// 같은 글을 두 번 분석하고 후보를 두 번 넣는다(2026-10-03 실제로 2쌍). 글마다 analyzed_at 을 다시 보는 것으로는
// 둘이 같은 글을 동시에 잡는 틈이 남아, 실행 단위로 막는다.
//
// 잠금 파일에 pid 를 적는다. 그 pid 가 이미 죽었으면(강제 종료로 exit 훅이 못 돈 경우) 잠금을 이어받는다.
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';

/** pid 가 살아 있나 — 신호 0 은 존재만 본다. EPERM 은 남의 프로세스라 살아 있는 것이다. */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function readHolder(path) {
  try {
    const pid = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ ok: true, release: () => void } | { ok: false, holder: number | null }}
 */
export function acquireRunLock(path, { pid = process.pid, alive = isAlive } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, String(pid));
      closeSync(fd);
      const release = () => {
        // 남이 이어받은 잠금은 지우지 않는다.
        if (readHolder(path) === pid) {
          try {
            unlinkSync(path);
          } catch {
            /* 이미 없다 */
          }
        }
      };
      return { ok: true, release };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const holder = readHolder(path);
      if (holder !== null && alive(holder)) return { ok: false, holder };
      try {
        unlinkSync(path);
      } catch {
        /* 다른 실행이 먼저 치웠다 */
      }
    }
  }
  return { ok: false, holder: readHolder(path) };
}
