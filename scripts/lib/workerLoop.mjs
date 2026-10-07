// 상주 워커(`pnpm data`, ADR-024 결정 3)의 **순수한 부분** — 깨우기 디바운스 · 다음 정기 수집 시각 · 요청 집기 · 한 바퀴의 단계 결정.
// DB·타이머·프로세스는 `scripts/worker.mjs` 가 갖고, 이 파일은 그 판단만 맡아 단위 테스트로 못 박는다(docs/todo/17 T3.1).
//
// 한 바퀴는 `planCycle` 을 **단계마다 다시** 부른다(worker.mjs). 수집이 요청 글에 `requested_at` 을 찍어야 분석할 것이 생기고,
// 분석이 auto 후보를 바로 approved 로 넣어야 반영할 것이 생긴다 — 바퀴 앞에서 한 번 세면 뒤 단계를 놓친다. 이미 돈 단계는 `done` 이 거른다.

/** `taken` 인데 이만큼 지나면 그 워커가 죽은 것으로 보고 다시 집는다(ADR-024 결정 2). */
export const STALE_TAKEN_MS = 10 * 60_000;

/**
 * 폴링이 같은 일을 다시 깨우기 전 기다리는 시간. 계속 403 인 요청 글·반영이 안 되는 승인 후보는 지워지지 않고 남아,
 * 그대로 두면 60초마다 analyze·apply 를 다시 돌려 `pipeline_runs` 가 분당 한 행씩 쌓인다. 수가 **늘었으면**(새 요청) 바로 돈다.
 */
export const RETRY_AFTER_MS = 30 * 60_000;

/** 「지금 분석」 요청에 수가 없거나 이상할 때의 건수와 상한 — 구독 5시간 한도를 한 번에 태우지 않게(화면은 10/30 을 고른다, T6). */
export const ANALYZE_REQUEST_DEFAULT_LIMIT = 10;
export const ANALYZE_REQUEST_MAX_LIMIT = 100;

/** Claude 한도에 걸렸는데 리셋 시각을 못 읽었을 때 쉬는 시간(ADR-024 결정 5). */
export const RATE_LIMIT_FALLBACK_MS = 30 * 60_000;

const KST_OFFSET_MS = 9 * 3600_000; // KST 는 서머타임이 없다 — 고정 +9 로 충분하다
const DAY_MS = 86_400_000;

/**
 * `wake()` 디바운스. 도는 중에 다시 부르면 **끝난 뒤 한 번 더**(플래그 하나) — 몇 번을 불러도 동시에 두 바퀴가 돌지 않고, 놓치지도 않는다.
 * Realtime(workerRealtime.mjs) · 60초 폴링 · 정기 수집(09:00)이 전부 이것 하나를 부른다. `daily` 는 쌓였다가 다음 바퀴 하나가 가져간다.
 * 바퀴가 던져도 루프는 산다(`onError`) — 워커 하나가 예외 한 번에 죽으면 큐가 DB 에 있어도 아무도 안 본다.
 * 정기 수집을 맡은 바퀴가 한 단계도 못 돌았으면(던졌거나 `{ dailyDone: false }` — 세션·네트워크) `daily` 를 **다음 wake 에** 얹는다(docs/todo/17 리뷰 9).
 * 그 자리에서 다시 돌지 않는다 — 네트워크가 죽어 있으면 빈 바퀴가 쉬지 않고 돈다. 다음 폴링(60초)이 들고 간다.
 * @param {(o: { daily: boolean }) => Promise<{ dailyDone?: boolean } | void>} runCycle
 */
export function createWaker(runCycle, { onError = (e) => console.error(e) } = {}) {
  let running = null;
  let again = false;
  let daily = false;
  let carried = false; // 못 돈 정기 수집 — 다음 wake 가 가져간다(루프를 다시 돌게 하지 않는다)

  // 다 돌면 `running` 을 **루프 안에서 동기적으로** 비운다 — `.finally` 로 비우면 루프가 끝난 뒤 그 마이크로태스크까지의 틈에 들어온 wake() 가
  // 끝나 가는 바퀴를 보고 `again` 만 세운 채 버려진다(지금 깨우는 길은 전부 매크로태스크라 실제로는 안 일어난다, todo/17 리뷰 11).
  async function loop() {
    for (;;) {
      again = false;
      const isDaily = daily || carried;
      daily = false;
      carried = false;
      try {
        const result = await runCycle({ daily: isDaily });
        if (isDaily && result?.dailyDone === false) carried = true;
      } catch (e) {
        if (isDaily) carried = true;
        onError(e);
      }
      if (!again && !daily) {
        running = null;
        return;
      }
    }
  }

  /** @returns {Promise<void>} 지금 바퀴(와 그 뒤 한 번 더)가 끝날 때 풀린다 */
  function wake({ daily: isDaily = false } = {}) {
    if (isDaily) daily = true;
    if (running) {
      again = true;
      return running;
    }
    running = loop();
    return running;
  }

  return { wake, isRunning: () => running !== null, dailyCarried: () => carried };
}

/** 다음 `hourKST` 시 정각(KST)의 timestamp. 지금이 정확히 그 시각이면 내일이다(방금 돈 것을 또 돌지 않게). */
export function nextDailyAt(now, hourKST = 9) {
  const kst = new Date(now + KST_OFFSET_MS);
  let at = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hourKST) - KST_OFFSET_MS;
  if (at <= now) at += DAY_MS;
  return at;
}

/**
 * `pipeline_requests` 행 → kind 별로 **이번에 할** 요청. `queued` 와, `taken` 인데 10분이 지난 것(집은 워커가 죽었다).
 * 모르는 kind 는 버린다(표의 check 가 막지만 화면 코드가 앞서 갈 수 있다).
 * @param {{ id: string, kind: string, status: string, taken_at?: string|null, args?: object|null }[]} rows
 */
export function pickRequests(rows, now) {
  const out = { collect: [], analyze: [], apply: [] };
  for (const row of rows ?? []) {
    if (!Object.hasOwn(out, row.kind)) continue;
    const takenAt = row.taken_at ? Date.parse(row.taken_at) : Number.NaN;
    const stale = row.status === 'taken' && (!Number.isFinite(takenAt) || now - takenAt > STALE_TAKEN_MS);
    if (row.status === 'queued' || stale) out[row.kind].push(row);
  }
  return out;
}

/** 「지금 분석」 요청 하나의 건수 — 정수가 아니면 기본값, 상한으로 자른다. */
export function requestLimit(row) {
  const limit = row?.args?.limit;
  return Math.min(Number.isInteger(limit) && limit > 0 ? limit : ANALYZE_REQUEST_DEFAULT_LIMIT, ANALYZE_REQUEST_MAX_LIMIT);
}

/** 요청 하나가 되돌아올 수 있는 횟수 — 넘으면 `done` 으로 닫고 경고한다(같은 요청이 영원히 되돌아오지 않게, docs/todo/17 리뷰 3). */
export const MAX_REQUEST_ATTEMPTS = 3;

/**
 * 단계가 끝난 뒤 요청 행을 어떻게 닫나. **실패했는데 실행 행이 서지 않았거나**(잠금에 막힘 · 키 없음 · 세션 — 돌지 않았다)
 * **Claude 한도로 끊긴** 실패만 `queued` 로 되돌린다(`taken_at` 은 비운다) — 다음 바퀴(한도면 리셋 뒤)가 다시 집는다.
 * 나머지는 `done`: 성공은 물론, 실행 행이 선 실패도 그 행이 실패를 말하고 되풀이해도 같은 실패라서다.
 * 실행 행 없이 성공한 것(요청 글 0건 · 실행 기록 insert 실패)도 `done` 이다 — 되돌리면 같은 일을 세 번 한다.
 * 되돌릴 때마다 `args.attempts` 를 센다(스키마 그대로 jsonb 안). `MAX_REQUEST_ATTEMPTS` 째면 `done` + `gaveUp`.
 * @param {{ args?: object|null }} row
 * @param {{ code: number, runId: string|null, rateLimited: boolean }} outcome
 * @returns {{ patch: object, gaveUp: boolean }}
 */
export function requestClose(row, { code, runId, rateLimited }) {
  const runIdPatch = runId ? { run_id: runId } : {};
  if (code === 0 || (runId != null && !rateLimited)) return { patch: { status: 'done', ...runIdPatch }, gaveUp: false };
  const attempts = (Number.isInteger(row.args?.attempts) ? row.args.attempts : 0) + 1;
  const args = { ...(row.args ?? {}), attempts };
  if (attempts >= MAX_REQUEST_ATTEMPTS) return { patch: { status: 'done', args, ...runIdPatch }, gaveUp: true };
  return { patch: { status: 'queued', taken_at: null, args }, gaveUp: false };
}

/**
 * 상태 칸이 큐인 단계(요청 수집 · 요청 글 분석 · 반영)를 **폴링이** 다시 돌릴 차례인가. 할 것이 있고, 지난번 뒤로 수가 늘었거나,
 * 지난번 실행이 수를 **줄였거나**(진척 — 블로그당 상한·limit 에 걸려 남은 것, 바로 이어 간다) `RETRY_AFTER_MS` 가 지났을 때.
 * 30분 대기는 수가 그대로였을 때만이다 — 계속 403 인 글·반영이 안 되는 후보처럼 돌아도 안 줄어드는 일감.
 * @param {{ count: number, at: number, progressed?: boolean } | undefined} last  그 단계가 끝난 직후 다시 센 수·시각·진척(`recordRun`)
 */
export function isDue(count, last, now) {
  return count > 0 && (!last || count > last.count || last.progressed === true || now - last.at >= RETRY_AFTER_MS);
}

/** 단계 → 그 단계를 깨우는 상태 칸의 수(`readWorkerState` 의 이름). 명시 요청(`pipeline_requests`)·정기 수집은 여기 없다 — 늘 돈다. */
export const STEP_TRIGGER = Object.freeze({ collect: 'collectQueued', 'analyze:requested': 'requestedPosts', apply: 'approved' });

/** 단계가 끝난 뒤 다시 센 상태(`after`)로 `last` 를 갱신한 새 객체 — 단계 앞의 수(`before`)보다 줄었으면 `progressed`. 트리거가 없는 단계(「지금 분석」)는 그대로. */
export function recordRun(last, key, before, after, now) {
  const field = STEP_TRIGGER[key];
  if (!field) return last;
  const count = after[field] ?? 0;
  return { ...last, [key]: { count, at: now, progressed: count < (before?.[field] ?? 0) } };
}

/**
 * 한 바퀴에서 **지금 할 수 있는** 단계들, 순서대로(collect → analyze → apply). 비면 할 일이 없다.
 *  - collect: 정기(09:00) 이거나 「지금 수집」 요청이면 키워드 전체, 아니면 추가 수집 요청이 있을 때 `--only-requests`.
 *  - analyze: 요청 글(`requested_at`)이 있으면 `--requested-only`(ADR-024 결정 4 — 저수지는 안 읽는다). 「지금 분석 N건」 요청은 그와 따로 `--limit N`
 *    (저수지 포함, 기존 순서). Claude 한도로 쉬는 동안(`claudePausedUntil`)은 둘 다 빠진다 — 요청은 queued 로 남아 리셋 뒤 집힌다.
 *  - apply: 승인 후보가 있거나 「지금 반영」 요청.
 * `forced` 는 Realtime 이벤트가 깨운 단계 key — 그 단계는 `isDue` 의 재시도 간격을 안 본다(이벤트가 "일이 늘었다" 그 자체다). 간격은 폴링에서만.
 * @returns {{ key: string, step: 'collect'|'analyze'|'apply', args: string[], requests: object[], requestIds: string[], reason: string }[]}
 */
export function planCycle({
  requests = { collect: [], analyze: [], apply: [] },
  collectQueued = 0,
  requestedPosts = 0,
  approved = 0,
  isDailyTick = false,
  last = {},
  done = new Set(),
  forced = new Set(),
  claudePausedUntil = 0,
  now = Date.now(),
} = {}) {
  const ids = (rows) => rows.map((row) => row.id);
  const due = (count, key) => isDue(count, forced.has(key) ? undefined : last[key], now);
  const steps = [];

  if (isDailyTick || requests.collect.length > 0) {
    const why = [isDailyTick && '정기 수집(09:00)', requests.collect.length > 0 && `「지금 수집」 요청 ${requests.collect.length}건`].filter(Boolean);
    steps.push({ key: 'collect', step: 'collect', args: [], requests: requests.collect, requestIds: ids(requests.collect), reason: `${why.join(' · ')} — 키워드 전체` });
  } else if (due(collectQueued, 'collect')) {
    steps.push({ key: 'collect', step: 'collect', args: ['--only-requests'], requests: [], requestIds: [], reason: `추가 수집 요청 ${collectQueued}건` });
  }

  const claudeOk = now >= claudePausedUntil;
  if (claudeOk && due(requestedPosts, 'analyze:requested')) {
    steps.push({ key: 'analyze:requested', step: 'analyze', args: ['--requested-only'], requests: [], requestIds: [], reason: `요청 글 ${requestedPosts}건` });
  }
  // 「지금 분석」 은 **가장 오래된 하나만** 집는다 — 나머지는 queued 로 남아 다음 바퀴가 집는다(여럿을 한 번에 done 으로 닫으면 뒤의 것이 할 일을 잃는다).
  if (claudeOk && requests.analyze.length > 0) {
    const [oldest] = requests.analyze;
    const limit = requestLimit(oldest);
    const waiting = requests.analyze.length > 1 ? ` · 뒤에 ${requests.analyze.length - 1}건 대기` : '';
    steps.push({ key: 'analyze:limit', step: 'analyze', args: ['--limit', String(limit)], requests: [oldest], requestIds: [oldest.id], reason: `「지금 분석」 ${limit}건(저수지 포함)${waiting}` });
  }

  if (requests.apply.length > 0 || due(approved, 'apply')) {
    const why = [approved > 0 && `승인 후보 ${approved}건`, requests.apply.length > 0 && `「지금 반영」 요청 ${requests.apply.length}건`].filter(Boolean);
    steps.push({ key: 'apply', step: 'apply', args: [], requests: requests.apply, requestIds: ids(requests.apply), reason: why.join(' · ') });
  }

  return steps.filter((step) => !done.has(step.key));
}

/** dry-run·로그용 한 줄 — `analyze --requested-only — 요청 글 3건`. */
export function formatStep(step) {
  return [step.step, ...step.args].join(' ') + ` — ${step.reason}`;
}

/**
 * Claude 한도 문구에서 리셋 시각. 읽는 모양 둘: `…limit reached|1759820400`(epoch 초) · `resets 3pm` / `resets at 15:30`(이 기기의 현지 시각).
 * 지금 뒤 하루 안의 값만 믿는다 — 아니면 null(부르는 쪽이 `RATE_LIMIT_FALLBACK_MS` 만큼 잔다).
 */
export function claudeResetAt(text, now) {
  const source = String(text ?? '');
  const within = (at) => (at > now && at - now <= DAY_MS ? at : null);
  const epoch = source.match(/\|(\d{10})\b/);
  if (epoch) return within(Number(epoch[1]) * 1000);
  const clock = source.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!clock) return null;
  let hour = Number(clock[1]);
  const minute = Number(clock[2] ?? 0);
  const half = clock[3]?.toLowerCase();
  if (half === 'pm' && hour < 12) hour += 12;
  if (half === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  const at = new Date(now);
  at.setHours(hour, minute, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return within(at.getTime());
}

/** 로그 머리 `[05:17:22]`(이 기기의 현지 시각). */
export function clockStamp(date = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `[${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}]`;
}

/** `pnpm data once` 의 인자 — `--dry-run` 하나뿐. 모르는 인자는 거부한다(`--dryrun` 오타로 실제 수집이 도는 일이 없게, apply 와 같은 원칙). */
export function parseOnceArgs(argv) {
  const unknown = argv.filter((arg) => arg !== '--dry-run');
  if (unknown.length > 0) throw new Error(`알 수 없는 인자: ${unknown.join(' ')} — 사용법: pnpm data once [--dry-run]`);
  return { dryRun: argv.includes('--dry-run') };
}

/** 상주 워커(`pnpm data`)의 인자 — `--no-realtime`(폴링만, 디버깅용) 하나뿐. 모르는 인자는 거부한다(parseOnceArgs 와 같은 원칙). */
export function parseResidentArgs(argv) {
  const unknown = argv.filter((arg) => arg !== '--no-realtime');
  if (unknown.length > 0) throw new Error(`알 수 없는 인자: ${unknown.join(' ')} — 사용법: pnpm data [--no-realtime]`);
  return { realtime: !argv.includes('--no-realtime') };
}
