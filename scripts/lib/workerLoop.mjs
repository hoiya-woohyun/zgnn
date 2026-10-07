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
 * @param {(o: { daily: boolean }) => Promise<unknown>} runCycle
 */
export function createWaker(runCycle, { onError = (e) => console.error(e) } = {}) {
  let running = null;
  let again = false;
  let daily = false;

  async function loop() {
    do {
      again = false;
      const isDaily = daily;
      daily = false;
      try {
        await runCycle({ daily: isDaily });
      } catch (e) {
        onError(e);
      }
    } while (again || daily);
  }

  /** @returns {Promise<void>} 지금 바퀴(와 그 뒤 한 번 더)가 끝날 때 풀린다 */
  function wake({ daily: isDaily = false } = {}) {
    if (isDaily) daily = true;
    if (running) {
      again = true;
      return running;
    }
    running = loop().finally(() => {
      running = null;
    });
    return running;
  }

  return { wake, isRunning: () => running !== null };
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

/** 「지금 분석」 요청들의 건수 — 가장 큰 것 하나(같은 kind 의 queued 가 있으면 화면이 더 넣지 않는다, T6). 정수가 아니면 기본값. */
export function requestLimit(rows) {
  const limits = rows.map((row) => row.args?.limit).filter((n) => Number.isInteger(n) && n > 0);
  return Math.min(limits.length ? Math.max(...limits) : ANALYZE_REQUEST_DEFAULT_LIMIT, ANALYZE_REQUEST_MAX_LIMIT);
}

/**
 * 상태 칸이 큐인 단계(요청 수집 · 요청 글 분석 · 반영)를 **폴링이** 다시 돌릴 차례인가. 할 것이 있고, 지난번 뒤로 수가 늘었거나 `RETRY_AFTER_MS` 가 지났을 때.
 * @param {{ count: number, at: number } | undefined} last  그 단계가 끝난 직후 다시 센 수와 시각(`recordRun`)
 */
export function isDue(count, last, now) {
  return count > 0 && (!last || count > last.count || now - last.at >= RETRY_AFTER_MS);
}

/** 단계 → 그 단계를 깨우는 상태 칸의 수(`readWorkerState` 의 이름). 명시 요청(`pipeline_requests`)·정기 수집은 여기 없다 — 늘 돈다. */
export const STEP_TRIGGER = Object.freeze({ collect: 'collectQueued', 'analyze:requested': 'requestedPosts', apply: 'approved' });

/** 단계가 끝난 뒤 다시 센 상태로 `last` 를 갱신한 새 객체. 트리거가 없는 단계(「지금 분석」)는 그대로. */
export function recordRun(last, key, state, now) {
  const field = STEP_TRIGGER[key];
  return field ? { ...last, [key]: { count: state[field] ?? 0, at: now } } : last;
}

/**
 * 한 바퀴에서 **지금 할 수 있는** 단계들, 순서대로(collect → analyze → apply). 비면 할 일이 없다.
 *  - collect: 정기(09:00) 이거나 「지금 수집」 요청이면 키워드 전체, 아니면 추가 수집 요청이 있을 때 `--only-requests`.
 *  - analyze: 요청 글(`requested_at`)이 있으면 `--requested-only`(ADR-024 결정 4 — 저수지는 안 읽는다). 「지금 분석 N건」 요청은 그와 따로 `--limit N`
 *    (저수지 포함, 기존 순서). Claude 한도로 쉬는 동안(`claudePausedUntil`)은 둘 다 빠진다 — 요청은 queued 로 남아 리셋 뒤 집힌다.
 *  - apply: 승인 후보가 있거나 「지금 반영」 요청.
 * `forced` 는 Realtime 이벤트가 깨운 단계 key — 그 단계는 `isDue` 의 재시도 간격을 안 본다(이벤트가 "일이 늘었다" 그 자체다). 간격은 폴링에서만.
 * @returns {{ key: string, step: 'collect'|'analyze'|'apply', args: string[], requestIds: string[], reason: string }[]}
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
    steps.push({ key: 'collect', step: 'collect', args: [], requestIds: ids(requests.collect), reason: `${why.join(' · ')} — 키워드 전체` });
  } else if (due(collectQueued, 'collect')) {
    steps.push({ key: 'collect', step: 'collect', args: ['--only-requests'], requestIds: [], reason: `추가 수집 요청 ${collectQueued}건` });
  }

  const claudeOk = now >= claudePausedUntil;
  if (claudeOk && due(requestedPosts, 'analyze:requested')) {
    steps.push({ key: 'analyze:requested', step: 'analyze', args: ['--requested-only'], requestIds: [], reason: `요청 글 ${requestedPosts}건` });
  }
  if (claudeOk && requests.analyze.length > 0) {
    const limit = requestLimit(requests.analyze);
    steps.push({ key: 'analyze:limit', step: 'analyze', args: ['--limit', String(limit)], requestIds: ids(requests.analyze), reason: `「지금 분석」 ${limit}건(저수지 포함)` });
  }

  if (requests.apply.length > 0 || due(approved, 'apply')) {
    const why = [approved > 0 && `승인 후보 ${approved}건`, requests.apply.length > 0 && `「지금 반영」 요청 ${requests.apply.length}건`].filter(Boolean);
    steps.push({ key: 'apply', step: 'apply', args: [], requestIds: ids(requests.apply), reason: why.join(' · ') });
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
