// 쓰기 스크립트가 실행마다 `pipeline_runs` 에 한 행을 남긴다(ADR-023 결정 1·2, docs/todo/15 T2.1).
// 시작에 insert(`running`) → 긴 실행은 그 사이 `heartbeat_at` → 끝에 update(`ok`·`partial`·`failed` + stats · error).
// 운영 현황 화면(`/admin/ops`)이 이 행으로 "언제 돌았나 · 실패했나 · 죽었나(심장이 멎은 running)" 를 읽는다.
//
// 이 모듈은 **DB 호출만** 맡는다. 요약 문장은 `src/lib/runSummary.ts`, stats 의 모양은 각 스크립트(docs/todo/15 T2.1 표).
//
// ⚠️ **기록은 본업을 막지 않는다(fail-soft).** 어떤 실패도 throw 하지 않는다 — insert 가 안 되면(표가 아직 원격에 없다 ·
//   세션 만료 · 네트워크) 경고 한 줄을 찍고 아무것도 안 하는 핸들을 돌려준다. 관측 장치가 수집·분석을 멈추게 하면 본말이 뒤집힌다.
//   그래서 이 표는 analyze 의 시작 점검(컬럼·마이그레이션 사전 검사)에도 **넣지 않는다** — 넣으면 push 전까지 pnpm data analyze 가 멈춘다.
//
// ⚠️ `error` 칸에는 **분류 문구만**(RUN_ERROR) 적는다. 원문은 콘솔에만 남긴다 — PostgREST 오류의 details 에는 `Key (…)=(값)` 꼴로
//   장소명이 들어올 수 있고, 이 칸은 나중에 Slack 트리거(T5)가 읽는다. 그래도 넘어온 문자열에서 URL 모양은 지운다(이중 안전).
import { randomUUID } from 'node:crypto';
import { RUN_ERROR } from './runErrors.mjs';

export { RUN_ERROR };

const KNOWN_ERRORS = new Set(Object.values(RUN_ERROR));

/**
 * 예외 → 분류 문구. **메시지를 읽지 않는다** — 던지는 자리가 `Object.assign(err, { runError: RUN_ERROR.x })` 로 붙인 값만 믿는다.
 * 메시지 패턴으로 가르면 문구 한 줄 고치는 순간 분류가 조용히 '알 수 없음' 으로 샌다.
 */
export function classifyRunError(e) {
  return KNOWN_ERRORS.has(e?.runError) ? e.runError : RUN_ERROR.unknown;
}

/** 실행 인자 → 기록할 플래그 이름 목록. **값은 버린다**(`--dump=경로`·`--note "…"` 의 값이 남지 않게). */
export function argFlags(argv) {
  return [...new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0]))];
}

const HEARTBEAT_MS = 60_000;
/** `progress` 를 실제로 쓰는 간격 — 화면이 구독해 "분석 중 12/40" 을 그린다(docs/todo/17 T3.3). 심장(60초)과 따로 센다. */
export const PROGRESS_MS = 5_000;
const scrubUrls = (text) => String(text ?? '').replace(/https?:\/\/\S+/g, '<url>');
/** 콘솔 경고에 실을 이유 한 줄 — 첫 줄만, URL 은 지운다. */
const reasonOf = (e) => scrubUrls(e?.message ?? e).split('\n')[0].slice(0, 200);

/** 기록하지 않는 실행(`--dry-run`)과 기록에 실패한 실행이 쓰는 핸들. 부르는 쪽이 분기하지 않게 같은 모양이다. */
export const NO_RUN = Object.freeze({
  id: null,
  async tick() {},
  async progress() {},
  async end() {},
});

/*
 * 실행 행이 섰을 때 알릴 곳 하나 — 상주 워커(`scripts/worker.mjs`)가 `workers.run_id` 를 그 행에 잇고, 신호를 받았을 때 그 행을 닫는 데(`end`) 쓴다.
 * 각 스크립트의 `main` 은 exit code 만 돌려주므로 id·핸들을 밖으로 꺼낼 다른 길이 없다. 리스너가 던져도 본업은 그대로다(fail-soft).
 */
let runListener = null;
/** @param {((run: { id: string, script: string, end: (r: { status: string, stats?: object|null, error?: string|null }) => Promise<void> }) => void) | null} fn */
export function setRunListener(fn) {
  runListener = fn;
}

/**
 * 심장이 이만큼 멎은 `running` 행은 끝난 것이다. 화면의 "중단된 듯"(10분, `HEARTBEAT_STALE_MS`)보다 넉넉히 잡는다 —
 * 닫는 것은 표시가 아니라 기록을 고치는 일이라, 긴 호출 하나에 걸려 심장을 놓친 산 실행을 닫으면 안 된다. 심장은 60초에 한 번이다.
 */
export const LOST_AFTER_MS = 30 * 60 * 1000;

/**
 * 끝 기록(`end`) 없이 죽은 실행을 닫는다 — 서버 함수가 시간 제한에 잘렸거나 `kill -9`·노트북 덮개처럼 신호 없이 끝난 것.
 * 그대로 두면 그 행은 영원히 `running` 이라 운영 현황에 "중단된 듯" 이 쌓이고, 무엇이 언제 끝났는지 읽을 수 없다(2026-10 원격에 9건).
 * `ended_at` 은 마지막 심장 — 그때가 살아 있던 마지막 시각이다. 진행(`progress`)은 그대로 두어 화면이 "5/5 다 하고 기록만 끊김" 과
 * "12/40 에서 끊김" 을 가른다(`src/lib/runOutcome.ts`). 새 실행이 설 때마다 부르므로 따로 도는 청소 작업이 없다.
 * 실패는 삼킨다(fail-soft) — 기록 정리가 본업을 막지 않는다. 닫은 수를 돌려준다.
 */
export async function closeLostRuns(client, { now = Date.now, exceptId = null } = {}) {
  try {
    const before = new Date(now() - LOST_AFTER_MS).toISOString();
    const { data, error } = await client
      .from('pipeline_runs')
      .select('id, heartbeat_at')
      .eq('status', 'running')
      .lt('heartbeat_at', before)
      .limit(50);
    if (error || !Array.isArray(data)) return 0;
    let closed = 0;
    for (const row of data) {
      if (row.id === exceptId) continue;
      // status 를 다시 건다 — 고르는 사이 그 실행이 스스로 닫혔으면 덮지 않는다.
      const { error: updateError, count } = await client
        .from('pipeline_runs')
        .update({ status: 'failed', error: RUN_ERROR.lost, ended_at: row.heartbeat_at }, { count: 'exact' })
        .eq('id', row.id)
        .eq('status', 'running');
      if (!updateError && count) closed += 1;
    }
    return closed;
  } catch {
    return 0;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client  운영자 세션 클라이언트(createSupabase)
 * @param {{ script:'collect'|'analyze'|'apply'|'approve'|'reject', args?: object|null }} run
 * @param {{ now?: () => number, warn?: (line: string) => void }} [deps]  시계·경고 출력(테스트 주입용)
 * @returns {Promise<{ id: string|null, tick: () => Promise<void>, progress: (p: { done: number, total: number, current?: string|null }) => Promise<void>, end: (r: { status: 'ok'|'partial'|'failed', stats?: object|null, error?: string|null }) => Promise<void> }>}
 */
export async function beginRun(client, { script, args = null }, { now = Date.now, warn = (line) => console.warn(line) } = {}) {
  // id 를 여기서 정한다 — insert 에 `.select()` 를 붙이면 RETURNING 때문에 select 권한·정책까지 걸리고(`20260922120000` 의 원칙과 어긋난다),
  // 시각도 이 프로세스의 시계 하나로 맞춘다(소요 = ended_at − started_at 이 서버·로컬 시계 차로 음수가 되지 않게).
  const id = randomUUID();
  const startedAt = new Date(now()).toISOString();
  try {
    const { error } = await client.from('pipeline_runs').insert({ id, script, args, started_at: startedAt, heartbeat_at: startedAt });
    if (error) throw error;
  } catch (e) {
    warn(`⚠️ 실행 기록 못 남김: ${reasonOf(e)}`);
    return NO_RUN;
  }
  const closed = await closeLostRuns(client, { now, exceptId: id });
  if (closed > 0) warn(`ℹ️ 끝 기록 없이 멎은 실행 ${closed}건을 "${RUN_ERROR.lost}" 로 닫았어요`);
  let lastBeat = now();
  let lastProgress = -Infinity;
  let latestProgress = null; // 스로틀에 걸려 안 써진 값도 쥔다 — `end` 가 마지막 값을 함께 쓴다
  let ended = false;
  const handle = {
    id,
    /** 자주 불러도 된다 — 60초에 한 번만 실제로 쓴다. 실패는 삼킨다(다음 tick 이 다시 찍는다). */
    async tick() {
      if (ended || now() - lastBeat < HEARTBEAT_MS) return;
      lastBeat = now();
      try {
        // 상태도 함께 "도는 중" 으로 적는다 — 노트북 덮개처럼 30분 넘게 잠든 사이 다른 실행이 이 행을 '기록 없이 끝남' 으로 닫았을 수 있다(`closeLostRuns`).
        // 이 프로세스가 tick 을 부른다는 것 자체가 살아 있고 아직 끝내지 않았다는 증거라(끝내면 `ended` 로 멈춘다) 덮어써도 남의 끝을 지우지 않는다.
        await client
          .from('pipeline_runs')
          .update({ heartbeat_at: new Date(lastBeat).toISOString(), status: 'running', error: null, ended_at: null })
          .eq('id', id);
      } catch {
        /* 심장 한 번 놓친 것 — 화면이 10분을 기다리므로 다음 tick 이 메운다 */
      }
    },
    /**
     * 어디까지 왔나(`{done, total, current}`) — 5초에 한 번만 쓴다. `tick` 과 같은 태도: 실패는 삼키고 다음 호출이 다시 쓴다.
     * 루프가 끝난 뒤의 마지막 값은 `{ force: true }` 로 스로틀을 건너뛴다 — 안 그러면 막대가 "11/12" 에 멈춘 채 끝난다.
     * 그래도 놓친 값은 `end` 가 함께 쓴다.
     */
    async progress(value, { force = false } = {}) {
      if (ended) return;
      latestProgress = value;
      if (!force && now() - lastProgress < PROGRESS_MS) return;
      lastProgress = now();
      try {
        await client.from('pipeline_runs').update({ progress: value }).eq('id', id);
      } catch {
        /* 한 번 놓친 진행 — 5초 뒤 다음 값이 덮는다 */
      }
    },
    /** 한 번만 닫는다. 실패하면 행이 running 으로 남는다 — 화면에 "중단된 듯" 으로 보이는 거짓 경보지만 들키는 쪽이라 한 줄로 알린다. */
    async end({ status, stats = null, error = null }) {
      if (ended) return;
      ended = true;
      const at = new Date(now()).toISOString();
      try {
        const { error: dbError, count } = await client
          .from('pipeline_runs')
          .update(
            {
              status,
              stats,
              error: error == null ? null : scrubUrls(error).slice(0, 200),
              ended_at: at,
              heartbeat_at: at,
              ...(latestProgress ? { progress: latestProgress } : {}),
            },
            { count: 'exact' },
          )
          .eq('id', id);
        if (dbError) throw dbError;
        // 0행 = 에러 없이 아무것도 안 바뀌었다(정책이 행을 가렸다). 조용히 넘기면 "닫았다" 고 믿는 running 행이 남는다.
        if (count === 0) throw new Error('갱신된 행이 없음');
      } catch (e) {
        warn(`⚠️ 실행 기록 못 닫음(${reasonOf(e)}) — 화면에 중단된 듯으로 보일 수 있어요`);
      }
    },
  };
  try {
    runListener?.({ id, script, end: handle.end });
  } catch {
    /* 워커 쪽 표시가 하나 늦을 뿐이다 */
  }
  return handle;
}
