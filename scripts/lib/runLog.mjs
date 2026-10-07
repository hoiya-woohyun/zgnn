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

/** `error` 칸에 들어갈 수 있는 문구 전부(docs/todo/15 T2.1). 던지는 자리가 `runError` 로 붙이고 `classifyRunError` 가 꺼낸다. */
export const RUN_ERROR = Object.freeze({
  claudeAuth: 'Claude 인증 실패',
  naver429: '네이버 검색 429',
  claudeLimit: 'Claude 한도',
  dbWrite: 'DB 쓰기 실패',
  sigint: '중단(SIGINT)',
  unknown: '알 수 없음',
});

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
 * 실행 행이 섰을 때 알릴 곳 하나 — 상주 워커(`scripts/worker.mjs`)가 `workers.run_id` 를 그 행에 잇는 데만 쓴다.
 * 각 스크립트의 `main` 은 exit code 만 돌려주므로 id 를 밖으로 꺼낼 다른 길이 없다. 리스너가 던져도 본업은 그대로다(fail-soft).
 */
let runListener = null;
/** @param {((run: { id: string, script: string }) => void) | null} fn */
export function setRunListener(fn) {
  runListener = fn;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client  운영자 세션 클라이언트(createSupabase)
 * @param {{ script: 'collect'|'analyze'|'apply'|'approve'|'reject', args?: object|null }} run
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
  try {
    runListener?.({ id, script });
  } catch {
    /* 워커 쪽 표시가 하나 늦을 뿐이다 */
  }

  let lastBeat = now();
  let lastProgress = -Infinity;
  let ended = false;
  return {
    id,
    /** 자주 불러도 된다 — 60초에 한 번만 실제로 쓴다. 실패는 삼킨다(다음 tick 이 다시 찍는다). */
    async tick() {
      if (ended || now() - lastBeat < HEARTBEAT_MS) return;
      lastBeat = now();
      try {
        await client.from('pipeline_runs').update({ heartbeat_at: new Date(lastBeat).toISOString() }).eq('id', id);
      } catch {
        /* 심장 한 번 놓친 것 — 화면이 10분을 기다리므로 다음 tick 이 메운다 */
      }
    },
    /**
     * 어디까지 왔나(`{done, total, current}`) — 5초에 한 번만 쓴다. `tick` 과 같은 태도: 실패는 삼키고 다음 호출이 다시 쓴다.
     * 마지막 값이 스로틀에 걸려 안 써져도 괜찮다 — 끝나면 화면은 progress 가 아니라 status 를 읽는다.
     */
    async progress(value) {
      if (ended || now() - lastProgress < PROGRESS_MS) return;
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
          .update({ status, stats, error: error == null ? null : scrubUrls(error).slice(0, 200), ended_at: at, heartbeat_at: at }, { count: 'exact' })
          .eq('id', id);
        if (dbError) throw dbError;
        // 0행 = 에러 없이 아무것도 안 바뀌었다(정책이 행을 가렸다). 조용히 넘기면 "닫았다" 고 믿는 running 행이 남는다.
        if (count === 0) throw new Error('갱신된 행이 없음');
      } catch (e) {
        warn(`⚠️ 실행 기록 못 닫음(${reasonOf(e)}) — 화면에 중단된 듯으로 보일 수 있어요`);
      }
    },
  };
}
