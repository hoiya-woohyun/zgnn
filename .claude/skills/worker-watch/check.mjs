#!/usr/bin/env node
// /worker-watch 의 한 회차 판정 — **읽기 전용**(DB select · `vercel logs` · 전원 상태)으로 "지금 /admin 버튼을 눌러 서버 워커를 깨워도 되나" 를 한 줄로 낸다.
//
// 왜 스크립트인가: `/loop 30m` 의 회차는 서로를 기억하지 못한다(5시간 한도로 몇 회차가 통째로 빠질 수도 있다). 그래서 판정은 대화가 아니라
// DB · 함수 로그 · 이 파일의 상태(`.claude/worker-watch.json`, .gitignore)만 보고, 회차마다 처음부터 다시 낸다. 한도가 풀린 뒤 첫 회차가 알아서 잇는다.
//
// 한도(5시간 창)를 다루는 법 — 서버가 한도에 걸리면 DB 에는 흔적이 거의 없다(심장은 홉 끝에 idle, 요청은 queued 로 돌아간다).
// 리셋 시각은 함수 로그 한 줄(`Claude 구독 한도 — 오후 9:37:12 까지 분석을 쉰다`)에만 있다. 그 줄을 읽으면 `pausedUntil` 로 **파일에 적는다**
// (로그 창 40분을 넘어도 남게). 판정은 "지금 < pausedUntil + 여유" 일 때만 쉰다 — "최근에 한도 로그가 있었나" 로 보면 리셋 뒤에도 영영 쉰다.
//
//   node .claude/skills/worker-watch/check.mjs                  → 판정 JSON 한 줄 + 사람용 한 줄
//   node .claude/skills/worker-watch/check.mjs --pressed <결과> → 버튼 결과를 적는다(ok · already · expiring · failed · login · no-button)
//   node .claude/skills/worker-watch/check.mjs --reset          → 멈춤(halt)과 상태를 지운다(사람이 문제를 본 뒤)
//
// 판정(verdict): press(눌러라) · wait(한도·바쁨 — 다음 회차) · halt(사람이 봐야 한다 — 누르지 않는다) · idle(할 일 없음) · blocked(CLI 가 안 된다)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE = join(ROOT, '.claude/worker-watch.json');
const MIN = 60_000;
/** 서버 심장이 이보다 오래 안 뛰었는데 idle 이 아니면 홉이 끊긴 것(300초 상한 + 여유) */
const STUCK_MS = 6 * MIN;
/** 로컬 워커가 살아 있다고 치는 창 — scripts/lib/workerQueue.mjs 의 PEER_FRESH_MS 와 같다 */
const PEER_FRESH_MS = MIN;
/** 한도 리셋 뒤 여유 — 리셋 직후엔 창이 덜 풀린 경우가 있다 */
const RESET_SLACK_MS = 5 * MIN;
/** 리셋 시각을 못 읽은 한도 실패면 이만큼 쉰다 */
const RATE_FALLBACK_MS = 60 * MIN;
/** /admin 은 JWT 가 50분 미만이면 깨우지 않는다(adminWorkerWake.ts WAKE_MIN_REMAINING_S) — 그 전에 멈추고 알린다 */
const JWT_MARGIN_MS = 55 * MIN;
/** 누른 뒤 이만큼 지나도 실행 행이 하나도 안 서면 깨우기가 안 닿는 것 */
const WAKE_EFFECT_MS = 8 * MIN;
/** 하루 깨우기 상한 — 30분 간격이면 최대 48 */
const MAX_WAKES_PER_DAY = 40;
/** 같은 알림은 이 안에 다시 보내지 않는다 */
const NOTIFY_QUIET_MS = 6 * 60 * MIN;
/** 홉 하나의 분석이 이보다 길면 300초 상한(T11)이 가깝다 */
const SLOW_HOP_S = 240;

const args = process.argv.slice(2);
const now = Date.now();

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
}
function saveState(s) {
  writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`);
}
const mask = (line) => line.replace(/[A-Za-z0-9_\-.]{32,}/g, '[가림]');
const dayKey = (t) => new Date(t).toLocaleDateString('sv-SE');

// ── 기록 모드 ──────────────────────────────────────────────────────────────
if (args[0] === '--reset') {
  saveState({});
  console.log('상태를 지웠다 — 다음 회차가 처음부터 판정한다');
  process.exit(0);
}
if (args[0] === '--pressed') {
  const result = args[1];
  const known = ['ok', 'already', 'expiring', 'failed', 'login', 'no-button'];
  if (!known.includes(result)) {
    console.error(`--pressed 결과는 ${known.join('·')} 중 하나`);
    process.exit(2);
  }
  const s = loadState();
  const day = dayKey(now);
  s.wakes = { ...(s.wakes ?? {}), [day]: (s.wakes?.[day] ?? 0) + (result === 'ok' || result === 'already' ? 1 : 0) };
  s.lastPress = { at: now, result };
  if (result === 'expiring' || result === 'login') {
    s.halt = { key: `login-${result}`, at: now, reason: result === 'login' ? '/admin 이 로그인 화면이다' : '/admin 로그인이 곧 끝나 서버를 못 깨운다' };
  } else if (result === 'failed' || result === 'no-button') {
    s.pressFailures = (s.pressFailures ?? 0) + 1;
    if (s.pressFailures >= 2) s.halt = { key: `press-${result}`, at: now, reason: `버튼 누르기가 두 번 연속 ${result}` };
  } else {
    s.pressFailures = 0;
  }
  saveState(s);
  console.log(`기록: ${result}${s.halt ? ` · 멈춤 — ${s.halt.reason}` : ''}`);
  process.exit(0);
}

// ── 판정 모드 ──────────────────────────────────────────────────────────────
const state = loadState();
const out = { verdict: 'idle', reason: '', notify: null, warn: [], facts: {} };

function sh(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000, ...opts });
}

// 1) DB — 한 번의 select 로 전부
const SQL = `select json_build_object(
  'workers', (select json_agg(json_build_object('host', host, 'phase', phase, 'seen', last_seen_at)) from workers),
  'runs', (select json_agg(r) from (select script, status, started_at, heartbeat_at, error, stats->>'analyzed' as analyzed
           from pipeline_runs where started_at > now() - interval '6 hours' order by started_at desc limit 40) r),
  'requested', (select count(*) from blog_posts where requested_at is not null and analyzed_at is null),
  'queuedAnalyze', (select count(*) from pipeline_requests where kind = 'analyze' and status in ('queued', 'taken')),
  'backlog', (select count(*) from blog_posts where analyzed_at is null and excluded_at is null)
) as s`;
let db;
try {
  const raw = sh('./node_modules/.bin/supabase', ['db', 'query', '--linked', SQL]);
  db = JSON.parse(raw.slice(raw.indexOf('{'))).rows[0].s;
} catch (e) {
  out.verdict = 'blocked';
  out.reason = `DB 조회 실패 — supabase CLI 로그인이 풀렸을 수 있다(${String(e.message).split('\n')[0].slice(0, 120)})`;
  out.notify = 'zgnn 감시: supabase CLI 가 안 된다 — 로그인 확인 필요, 버튼은 안 누름';
}

// 2) 함수 로그 — 최근 40분
let logLines = [];
if (out.verdict !== 'blocked') {
  try {
    const raw = sh('vercel', ['logs', '--since', '40m', '--limit', '300', '--expand'], { cwd: join(ROOT, 'worker') });
    logLines = raw.split('\n').map(mask);
  } catch (e) {
    out.verdict = 'blocked';
    out.reason = `vercel logs 실패(${String(e.message).split('\n')[0].slice(0, 120)})`;
    out.notify = 'zgnn 감시: vercel logs 가 안 된다 — vercel 로그인 확인 필요, 버튼은 안 누름';
  }
}

// 함수 로그의 시각은 **UTC** 다 — Vercel 함수에 TZ 가 없고 스크립트가 `toLocaleString('ko-KR')` 로만 찍는다(10-08 로그의 "만료 오후 9:37:12" = 06:37 KST).
// 오전/오후는 ICU 가 있는 런타임(Vercel)의 표기, AM/PM 은 small-icu 의 표기 — 둘 다 받는다.
function clock(ampm, h, m, s) {
  let hour = Number(h) % 12;
  if (ampm === '오후' || ampm === 'PM') hour += 12;
  return { hour, minute: Number(m), second: Number(s) };
}
const AMPM = '(오전|오후|AM|PM)';
const problems = [];
let slowest = 0;
for (const line of logLines) {
  let m;
  if ((m = new RegExp(`Claude 구독 한도 — ${AMPM} (\\d{1,2}):(\\d{2}):(\\d{2}) 까지`).exec(line))) {
    const c = clock(m[1], m[2], m[3], m[4]);
    const t = new Date(now);
    t.setUTCHours(c.hour, c.minute, c.second, 0);
    // 로그 창은 40분 — 그보다 이른 시각이면 다음 날이다
    if (t.getTime() < now - 45 * MIN) t.setUTCDate(t.getUTCDate() + 1);
    state.pausedUntil = Math.max(state.pausedUntil ?? 0, t.getTime());
  }
  if ((m = new RegExp(`만료 (\\d{4})\\. (\\d{1,2})\\. (\\d{1,2})\\. ${AMPM} (\\d{1,2}):(\\d{2}):(\\d{2})`).exec(line))) {
    const c = clock(m[4], m[5], m[6], m[7]);
    const exp = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), c.hour, c.minute, c.second);
    state.jwtExp = Math.max(state.jwtExp ?? 0, exp);
  }
  if (/다음 홉\(\d+\) 호출 — 508/.test(line)) problems.push(['loop-508', '다음 홉 호출이 508(Vercel 루프 감지)']);
  if (/claude 인증 실패|Invalid bearer token/i.test(line)) problems.push(['claude-auth', 'Claude 토큰 인증 실패(401) — 서버 env 의 setup-token 확인']);
  if (/⚠️ 홉 \d+\/\d+ 실패/.test(line)) problems.push(['hop-failed', mask(line.trim()).slice(0, 160)]);
  if (/바이너리\(linux-x64\)를 못 찾음/.test(line)) problems.push(['no-binary', 'Vercel 위 claude 바이너리를 못 찾음']);
  if (/Task timed out|FUNCTION_INVOCATION_TIMEOUT|timed out after/i.test(line)) problems.push(['timeout', '홉이 300초 상한에 끊겼다(T11)']);
  if ((m = /분석 끝 — 성공 · (?:(\d+)분 )?(\d+(?:\.\d+)?)초/.exec(line))) slowest = Math.max(slowest, Number(m[1] ?? 0) * 60 + Number(m[2]));
}
if (slowest >= SLOW_HOP_S) out.warn.push(`느린 홉 ${Math.round(slowest)}초 — 300초 상한에 가깝다(T11)`);

if (db) {
  const workers = db.workers ?? [];
  const runs = db.runs ?? [];
  const server = workers.find((w) => w.host === 'vercel');
  const seenAgo = server ? now - Date.parse(server.seen) : Infinity;
  const serverBusy = server && server.phase !== 'idle' && seenAgo < STUCK_MS;
  const serverStuck = server && server.phase !== 'idle' && seenAgo >= STUCK_MS;
  const localAlive = workers.some(
    (w) => w.host !== 'vercel' && now - Date.parse(w.seen) < PEER_FRESH_MS && w.phase !== 'login-needed' && w.phase !== 'rate-limited',
  );
  const staleRun = runs.find((r) => r.status === 'running' && now - Date.parse(r.heartbeat_at) > STUCK_MS);
  const since = state.lastCheckAt ?? now - 40 * MIN;
  const newRuns = runs.filter((r) => Date.parse(r.started_at) > since);
  const newFailed = newRuns.filter((r) => r.status === 'failed');
  for (const r of newFailed) {
    if (/인증/.test(r.error ?? '')) problems.push(['claude-auth', `분석 실패: ${r.error}`]);
    else if (/한도|limit/i.test(r.error ?? '')) state.pausedUntil = Math.max(state.pausedUntil ?? 0, now + RATE_FALLBACK_MS);
  }
  if (serverStuck) problems.push(['stuck', `서버 심장이 ${Math.round(seenAgo / MIN)}분째 '${server.phase}' — 홉이 끊겼을 수 있다`]);
  if (staleRun) problems.push(['stuck-run', `실행 행(${staleRun.script})이 ${Math.round((now - Date.parse(staleRun.heartbeat_at)) / MIN)}분째 running`]);

  // 누른 뒤 아무 일도 안 일어났나
  const lp = state.lastPress;
  if (lp && (lp.result === 'ok' || lp.result === 'already') && now - lp.at > WAKE_EFFECT_MS && !serverBusy) {
    const after = runs.some((r) => Date.parse(r.started_at) > lp.at);
    if (!after && !localAlive) problems.push(['wake-no-effect', '버튼을 눌렀는데 서버가 한 번도 안 돌았다 — rewrite·헤더·JWT 확인']);
    if (after) state.lastPress = { ...lp, confirmed: true, result: 'confirmed' };
  }

  const workLeft = db.requested > 0 || db.queuedAnalyze > 0 || db.backlog > 0;
  const wakesToday = state.wakes?.[dayKey(now)] ?? 0;
  out.facts = {
    server: server ? `${server.phase} · ${Math.round(seenAgo / 1000)}초 전` : '없음',
    localAlive,
    requested: db.requested,
    queuedAnalyze: db.queuedAnalyze,
    backlog: db.backlog,
    runsSinceLastCheck: newRuns.length,
    analyzedSinceLastCheck: newRuns.reduce((n, r) => n + Number(r.analyzed ?? 0), 0),
    failedSinceLastCheck: newFailed.length,
    wakesToday,
    pausedUntil: state.pausedUntil && state.pausedUntil > now ? new Date(state.pausedUntil).toLocaleTimeString('ko-KR') : null,
    jwtExp: state.jwtExp ? new Date(state.jwtExp).toLocaleString('ko-KR') : '모름(첫 깨우기 뒤 로그에서 읽는다)',
    // 새 요청이 들어가면 30건을 고른다 — 이미 대기 중이면 버튼은 깨우기만 한다
    selectLimit: db.queuedAnalyze > 0 ? null : 30,
  };

  const firstProblem = problems[0];
  if (state.halt) {
    out.verdict = 'halt';
    out.reason = `멈춤 유지 — ${state.halt.reason}(${new Date(state.halt.at).toLocaleTimeString('ko-KR')}). 사람이 본 뒤 --reset`;
    if (firstProblem && firstProblem[0] !== state.halt.key) out.warn.push(`새 문제: ${firstProblem[1]}`);
  } else if (firstProblem) {
    state.halt = { key: firstProblem[0], at: now, reason: firstProblem[1] };
    out.verdict = 'halt';
    out.reason = firstProblem[1];
    out.notify = `zgnn 서버 워커 멈춤: ${firstProblem[1]}`.slice(0, 190);
  } else if (state.pausedUntil && now < state.pausedUntil + RESET_SLACK_MS) {
    out.verdict = 'wait';
    out.reason = `Claude 5시간 한도 — ${new Date(state.pausedUntil + RESET_SLACK_MS).toLocaleTimeString('ko-KR')} 뒤에 다시 깨운다(요청은 queued 로 남아 있다)`;
    out.notifyKey = `rate-${state.pausedUntil}`;
    out.notify = `zgnn: Claude 5시간 한도 — ${new Date(state.pausedUntil).toLocaleTimeString('ko-KR')} 리셋 뒤 자동으로 이어 간다`;
  } else if (state.jwtExp && now > state.jwtExp - JWT_MARGIN_MS) {
    state.halt = { key: 'jwt', at: now, reason: '/admin 로그인이 곧 끝난다 — 다시 로그인해야 서버를 깨울 수 있다' };
    out.verdict = 'halt';
    out.reason = state.halt.reason;
    out.notify = 'zgnn: /admin 로그인이 곧 끝나 서버 깨우기를 멈췄다 — 다시 로그인 후 --reset';
  } else if (serverBusy) {
    out.verdict = 'wait';
    out.reason = '서버 워커가 도는 중';
  } else if (localAlive) {
    out.verdict = 'wait';
    out.reason = '로컬 워커(pnpm data)가 살아 있다 — 서버는 비킨다(누를 필요 없음)';
  } else if (!workLeft) {
    out.verdict = 'idle';
    out.reason = '할 일이 없다';
  } else if (wakesToday >= MAX_WAKES_PER_DAY) {
    out.verdict = 'wait';
    out.reason = `오늘 깨우기 상한 ${MAX_WAKES_PER_DAY}번`;
  } else {
    out.verdict = 'press';
    out.reason = `서버가 쉬고 일이 남았다(요청 글 ${db.requested} · 분석 요청 ${db.queuedAnalyze} · 미분석 ${db.backlog})`;
  }
}

// 전원 — 잠들면 회차가 안 온다
try {
  const batt = sh('pmset', ['-g', 'batt']);
  if (!/AC Power/.test(batt)) {
    out.warn.push('배터리로 돌고 있다 — 전원이 빠지면 잠든다');
    if (!out.notify) {
      out.notify = 'zgnn 감시: 맥이 배터리로 돈다 — 전원을 꽂아 주세요(잠들면 감시·깨우기가 멈춘다)';
      out.notifyKey = 'power';
    }
  }
  let caf = false;
  try {
    caf = sh('pgrep', ['-x', 'caffeinate']).trim() !== '';
  } catch {
    caf = false;
  }
  if (!caf) out.warn.push('caffeinate 가 안 돈다 — 맥이 잠들 수 있다');
} catch {
  /* pmset 없는 곳 */
}

// 알림 중복 막기
if (out.notify) {
  const key = out.notifyKey ?? out.notify;
  const last = state.notified?.[key];
  if (last && now - last < NOTIFY_QUIET_MS) out.notify = null;
  else state.notified = { ...(state.notified ?? {}), [key]: now };
}
delete out.notifyKey;
if (out.verdict !== 'blocked') state.lastCheckAt = now;
saveState(state);

console.log(JSON.stringify(out));
const f = out.facts;
console.log(
  `[${out.verdict}] ${out.reason}` +
    (f.requested !== undefined ? ` · 서버 ${f.server} · 지난 회차 뒤 실행 ${f.runsSinceLastCheck}(분석 ${f.analyzedSinceLastCheck}, 실패 ${f.failedSinceLastCheck}) · 남은 요청 글 ${f.requested} · 미분석 ${f.backlog} · 오늘 깨우기 ${f.wakesToday}` : '') +
    (out.warn.length ? ` · ⚠️ ${out.warn.join(' / ')}` : ''),
);
