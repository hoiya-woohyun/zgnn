// 상주 워커의 심장 — `workers` 표의 이 기기 한 행(ADR-024 결정 2, docs/todo/17 T3.3).
// 시작할 때 upsert(`idle`), 15초마다 `last_seen_at`, 단계 들어갈 때·나올 때 `phase`·`run_id`. 화면은 `last_seen_at` 이 5분 넘게 조용하면 "워커 없음" 이다(T5.1).
//
// 시작 upsert 만 던진다 — 표가 없으면(마이그레이션 전) 워커가 거기서 멈춰 그렇게 말해야 한다. 그 뒤의 쓰기는 **fail-soft**(runLog.mjs 와 같은 태도):
// 세션이 막 끝났거나 네트워크가 잠깐 죽었다고 수집·분석이 멈추면 본말이 뒤집힌다. 대신 끊긴 순간과 다시 붙은 순간을 한 줄씩 말한다.
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

export const HEARTBEAT_MS = 15_000;

/** 지금 도는 코드의 git sha(짧게). git 이 없거나 레포 밖이면 null — 화면은 "버전 모름" 으로 그린다. */
export function gitVersion() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: new URL('../../', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} initialClient
 * @returns {Promise<{ host: string, phase: () => string, setClient: (c: object) => void, setPhase: (phase: string, runId?: string|null) => Promise<void>, setRunId: (runId: string|null) => Promise<void>, close: () => Promise<void> }>}
 */
export async function startHeartbeat(initialClient, { host = hostname(), version = gitVersion(), intervalMs = HEARTBEAT_MS, warn = (line) => console.warn(line) } = {}) {
  let client = initialClient;
  const startedAt = new Date().toISOString();
  const { error } = await client
    .from('workers')
    .upsert({ host, phase: 'idle', run_id: null, last_seen_at: startedAt, started_at: startedAt, version }, { onConflict: 'host' });
  if (error) throw Object.assign(new Error(`workers 행을 못 세움: ${error.message}`), { dbError: error });

  let phase = 'idle';
  let failing = false;
  async function write(patch) {
    try {
      const { error: writeError } = await client
        .from('workers')
        .update({ ...patch, last_seen_at: new Date().toISOString() })
        .eq('host', host);
      if (writeError) throw writeError;
      if (failing) {
        failing = false;
        warn('워커 심장 다시 붙음');
      }
    } catch (e) {
      if (!failing) {
        failing = true;
        warn(`⚠️ 워커 심장 못 씀(${String(e?.message ?? e).split('\n')[0].slice(0, 120)}) — 수집·분석은 그대로 돈다. 5분 넘게 이어지면 화면에 "워커 없음"`);
      }
    }
  }
  const timer = setInterval(() => write({}), intervalMs);

  return {
    host,
    phase: () => phase,
    /** 재로그인 뒤 새 세션의 클라이언트로 바꾼다. */
    setClient(next) {
      client = next;
    },
    async setPhase(next, runId = null) {
      phase = next;
      await write({ phase: next, run_id: runId });
    },
    async setRunId(runId) {
      await write({ run_id: runId });
    },
    /** 끝낼 때 — 행을 지우지 않고(delete grant 가 없다) `idle` 로 닫는다. 그 뒤 `last_seen_at` 이 멎어 5분 뒤 "워커 없음" 이 된다. */
    async close() {
      clearInterval(timer);
      phase = 'idle';
      await write({ phase: 'idle', run_id: null });
    },
  };
}
