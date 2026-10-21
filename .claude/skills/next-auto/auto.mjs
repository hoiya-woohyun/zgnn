#!/usr/bin/env node
// /next-auto 감독 상태 — 감독(메인 세션)은 판단하지 않고 이 스크립트의 한 줄 답대로 레인을 띄우고 닫는다.
//
// 왜 스크립트인가: 감독은 몇 시간을 돈다. 고르기·겹침·멈춤을 감독이 매번 머리로 하면 그 추론이 컨텍스트에 쌓이고(= 턴당 비용 · 결국 /clear),
// 컨텍스트가 요약되면 "어느 pid 가 무슨 줄을 쥐었나" 를 잃는다. 상태를 파일에 두면 감독이 바뀌어도(/clear 뒤 새 세션) 그대로 이어 간다.
//
// 감독:  start [--lanes 3] [--max N] [--hours H] [--model sonnet|opus] [--adopt]
//        pick                          → LANE <pid> <model> <제목> | SCOUT <id> <n> | TIDY <id> <이유> | FULL|WAIT|DRAIN <이유> | STOP <이유>
//        reap <id> [--failed "<오류>"]  → 알림이 온 레인을 닫는다(레인이 report 를 안 남겼으면 실패로)
//        stop [이유] · status · summary · cleanup [--all]
// 레인:  me <pid> · lease <pid> <파일…> · report <id> <DONE|PARKED|BLOCKED> <해시|-> <한 줄> [--wait <pid>] [--unseen "<볼 것>"]
// 정찰:  unscouted · foot --title <제목> (--files a,b [--solo] [--model opus] | --skip "<이유>")
//
// 상태는 .claude/next-auto/(git 밖) — state.json · STOP(있으면 부드러운 멈춤) · reports/<id>.md(레인 세부 보고).
// 선점은 /next 의 claim.mjs 그대로다 — 레인마다 오래 사는 `sleep` 하나가 주인(pid)이다. 같은 세션의 서브에이전트는 CLAUDE_PID 를 나눠 가져서
// 그대로 take 하면 둘째 레인이 첫 레인의 줄을 RESUME 으로 받는다(PARALLEL.md).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT =
  process.env.NEXT_AUTO_ROOT || execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const DIR = join(ROOT, '.claude/next-auto');
const STATE = join(DIR, 'state.json');
const STOP_FILE = join(DIR, 'STOP');
const REPORTS = join(DIR, 'reports');
const LOCK = join(DIR, 'state.lock');
const NOW = join(ROOT, 'docs/todo/NOW.md');
const CLAIMS = join(ROOT, '.claude/next-claims.json');
const CLAIM = join(ROOT, '.claude/skills/next/claim.mjs');

/** 사용자 예산과 무관한 안전 상한(한 실행에서 띄우는 레인 수). 「발견」 → 정리 → 새 줄로 대기열이 스스로 차서 끝이 없을 수 있다. */
const HARD_CAP = 30;
/** 끝낸 일이 이만큼 쌓이고 「발견」 이 있으면, 레인이 다 빠진 틈에 정리 레인을 한 번. */
const TIDY_EVERY = 4;
/** 정찰 한 번에 발자국을 적는 줄 수. */
const SCOUT_BATCH = 6;
/** 이전 감독이 띄운 레인이 이만큼 조용하면 고아로 보고 같은 pid 로 다시 띄운다(RESUME). 레인은 me·lease·report 때마다 신호를 남긴다. */
const ORPHAN_MS = 45 * 60 * 1000;
/** 정찰 기록은 하루가 지나면 버린다 — 코드가 바뀌어 발자국이 낡는다. */
const FOOT_TTL_MS = 24 * 60 * 60 * 1000;
/** 레인이 이런 오류로 끝나면 구독 한도다 — 다시 띄워도 같은 벽이라 바로 멈춘다(감독도 같은 계정이다). */
const LIMIT_RE = /usage limit|rate.?limit|limit reached|한도|\b429\b|overloaded|quota/i;
/** 발자국에 넣지 않는 경로 — lane-commit 저널(--edits)로만 고쳐 레인끼리 겹쳐도 된다. */
const journalOnly = (file) => file.startsWith('docs/todo/') || file === 'CLAUDE.md';

// ── 바닥 ────────────────────────────────────────────────────────────────────

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const withLock = (fn) => {
  mkdirSync(DIR, { recursive: true });
  for (let i = 0; ; i++) {
    try {
      mkdirSync(LOCK);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 10_000) rmdirSync(LOCK);
      } catch {
        // 그사이 풀렸다 — 다음 바퀴가 다시 겨룬다.
      }
      if (i > 500) throw new Error(`잠금을 얻지 못했다: ${LOCK}`);
      sleepMs(20);
    }
  }
  try {
    const state = load();
    const out = fn(state);
    save(state);
    return out;
  } finally {
    try {
      rmdirSync(LOCK);
    } catch {
      // 10초를 넘겨 남이 stale 로 치웠다 — 이미 풀렸다.
    }
  }
};

const load = () => {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return { run: null, env: {}, foot: {}, lanes: {} };
  }
};
const save = (state) => writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

/** pid 는 재사용된다 — 끄기 전에 그 pid 가 아직 우리가 띄운 sleep 인지 본다(광역 kill 금지). */
const isOurSleep = (pid) => {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim().startsWith('sleep ');
  } catch {
    return false;
  }
};
const spawnSleep = () => {
  const child = spawn('sleep', ['36000'], { detached: true, stdio: 'ignore' });
  child.unref();
  return child.pid;
};
const killSleep = (pid) => {
  if (Number.isInteger(pid) && isOurSleep(pid)) {
    try {
      process.kill(pid);
    } catch {
      // 그사이 끝났다.
    }
  }
};

const claim = (pid, ...argv) =>
  execFileSync('node', [CLAIM, ...argv], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NEXT_CLAIM_OWNER: String(pid), CLAUDE_PROJECT_DIR: ROOT },
  }).trim();

// claim.mjs 와 같은 규칙 — 링크·설명을 뗀 제목이 줄의 이름이다.
const titleOf = (line) => line.replace(/^- (\[.\] )?/, '').split(' — ')[0].replace(/\*\*/g, '').trim();
const section = (head) => {
  const lines = existsSync(NOW) ? readFileSync(NOW, 'utf8').split('\n') : [];
  const start = lines.findIndex((line) => line.startsWith(`## ${head}`));
  const out = [];
  for (let i = start + 1; start >= 0 && i < lines.length && !lines[i].startsWith('## '); i++) {
    if (/^- /.test(lines[i])) out.push(lines[i]);
  }
  return out;
};
const nowItems = () => section('지금').map((line) => ({ line, title: titleOf(line) }));
const foundCount = () => section('발견').length;

const liveClaims = () => {
  try {
    return Object.fromEntries(Object.entries(JSON.parse(readFileSync(CLAIMS, 'utf8'))).filter(([, c]) => alive(c.pid)));
  } catch {
    return {};
  }
};

/** 커밋 안 된 경로 전부(남의 세션 것 포함). 레인이 남의 편집 위에서 일하면 pathspec·저널이 서로를 되돌린다. */
const dirtyFiles = () => {
  const parts = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0');
  const out = new Set();
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    out.add(parts[i].slice(3));
    if (/^[RC]/.test(parts[i])) out.add(parts[++i]); // 이름 바꿈은 옛 경로가 다음 칸에 온다.
  }
  return out;
};

/** 파일 둘이 겹치나 — `/` 로 끝나는 발자국은 그 폴더 전부. */
const touches = (a, b) => a === b || (a.endsWith('/') && b.startsWith(a)) || (b.endsWith('/') && a.startsWith(b));
const normPath = (file) => file.trim().replace(/^\.\//, '');

const argOf = (argv, name) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = argv.splice(i, 2);
  return value;
};
const hasFlag = (argv, name) => {
  const i = argv.indexOf(name);
  if (i >= 0) argv.splice(i, 1);
  return i >= 0;
};

const minutes = (ms) => `${Math.round(ms / 60000)}분`;
const active = (lane) => lane.status === 'running' || lane.status === 'held';

// ── 멈춤 ────────────────────────────────────────────────────────────────────

/**
 * 예산 멈춤 — 새 레인을 더 띄워도 되나. null 이면 계속, 문자열이면 그 이유로 **부드럽게** 멈춘다(달리는 레인은 커밋까지 끝낸다).
 * 안전장치(STOP 파일 · 사용자 "멈춰" · 컨텍스트 알림 · 구독 한도 · 안전 상한 30)는 이 함수 밖에서 이미 건다 — 여기는 "얼마나 돌릴까" 의 취향이다.
 *
 * @param {{ launched: number, done: number, failStreak: number, max: number|null, hours: number|null, startedAt: number }} run
 *   launched 띄운 레인 수(다시 띄운 것 포함) · done 커밋으로 끝낸 일 수 · failStreak 보고 없이 끝난 레인의 연속 수
 *   max · hours 는 `start --max N --hours H` 로 받은 값(안 주면 null)
 * @param {number} now Date.now()
 * @returns {string|null}
 */
 
const budgetStop = (run, now) => {
  // TODO(사용자): 멈춤 정책 — 아래 셋을 어떻게 셀지 정한다.
  //   ① --max 는 "띄운 레인 수(launched)" 인가 "끝낸 일 수(done)" 인가 — launched 는 실패·다시 띄움도 한도를 먹는다(비용 상한),
  //      done 은 결과 기준이지만 실패가 이어지면 한도에 영영 안 닿는다.
  //   ② --hours 가 지나면 멈출까 — 자는 동안 "7시엔 끝나 있게" 같은 쓰임.
  //   ③ failStreak 가 몇이면 멈출까 — 1 이면 일시적 오류 하나에도 멈추고, 크게 두면 같은 원인(남의 세션이 tsc 를 깨 둠 등)으로 줄을 연달아 태운다.
  //      (구독 한도로 끝난 것은 이 함수와 무관하게 이미 멈춘다.)
  return null;
};

const stopReason = (state, now) => {
  if (existsSync(STOP_FILE)) return 'STOP 파일';
  if (state.run.stop) return state.run.stop.why;
  if (state.run.launched >= HARD_CAP) return `안전 상한 — 레인 ${HARD_CAP}개`;
  return budgetStop(state.run, now);
};

// ── 감독 ────────────────────────────────────────────────────────────────────

const probePlaywright = async () => {
  const base = join(homedir(), '.npm/_npx');
  const version = (dir) => {
    try {
      return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    } catch {
      return '0';
    }
  };
  const newer = (a, b) => {
    const [x, y] = [a, b].map((v) => v.split('.').map(Number));
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  };
  let dirs = [];
  try {
    dirs = readdirSync(base)
      .map((d) => join(base, d, 'node_modules/playwright'))
      .filter((d) => existsSync(join(d, 'index.mjs')) && !version(d).includes('-'));
  } catch {
    return null;
  }
  // 남의 npx 사본은 브라우저가 안 받아져 있거나 깨져 있다(2026-10-15) — 실제로 headless 가 뜨는 판을 고른다.
  for (const dir of dirs.sort((a, b) => newer(version(a), version(b)))) {
    try {
      const { chromium } = await import(pathToFileURL(join(dir, 'index.mjs')).href);
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      return join(dir, 'index.mjs');
    } catch {
      // 다음 판.
    }
  }
  return null;
};

const devUp = () => {
  try {
    return execFileSync('lsof', ['-nP', '-iTCP:7727', '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim() !== '';
  } catch {
    return false;
  }
};

const start = async (argv) => {
  const adopt = hasFlag(argv, '--adopt');
  const lanes = argOf(argv, '--lanes');
  const max = argOf(argv, '--max');
  const hours = argOf(argv, '--hours');
  const model = argOf(argv, '--model');
  const env = { dev7727: devUp(), playwright: await probePlaywright() };
  return withLock((state) => {
    const now = Date.now();
    const resumed = Boolean(state.run && !state.run.endedAt);
    if (!resumed) {
      state.run = {
        id: new Date(now).toISOString(),
        startedAt: now,
        lanes: 3,
        max: null,
        hours: null,
        model: 'sonnet',
        launched: 0,
        done: 0,
        failStreak: 0,
        doneSinceTidy: 0,
        scoutFails: 0,
        stop: null,
      };
    }
    const run = state.run;
    if (lanes) run.lanes = Math.max(1, Number(lanes));
    if (max) run.max = Number(max);
    if (hours) run.hours = Number(hours);
    if (model) run.model = model === 'opus' ? 'opus' : 'sonnet';
    Object.assign(run, { stop: null, finalTidy: false, failStreak: 0 });
    // 이전 감독이 띄운 레인 — 그 알림은 이 세션에 오지 않는다. 오래 조용했으면(또는 --adopt) 쥔 선점 그대로 다시 띄울 줄로.
    const notes = [];
    for (const [id, lane] of Object.entries(state.lanes)) {
      if (lane.status !== 'running') continue;
      if (adopt || now - lane.beat > ORPHAN_MS) {
        lane.status = lane.kind === 'lane' && isOurSleep(Number(id)) ? 'held' : 'failed';
        notes.push(`↩️ 이전 감독의 ${lane.kind} ${id} → ${lane.status}`);
      } else {
        lane.orphan = true;
        notes.push(`⚠️ 이전 감독의 ${lane.kind} ${id}(${lane.title ?? ''}) 가 ${minutes(now - lane.beat)} 전까지 신호 — 아직 돌 수 있어 자리를 비워 둔다(${minutes(ORPHAN_MS)} 조용하면 다시 띄움 · 당장은 start --adopt)`);
      }
    }
    for (const [title, foot] of Object.entries(state.foot)) if (now - foot.at > FOOT_TTL_MS) delete state.foot[title];
    state.env = env;
    if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE);
    mkdirSync(REPORTS, { recursive: true });
    const free = freeItems(state);
    return [
      `${resumed ? 'RESUMED' : 'STARTED'} ${run.id} · 동시 ${run.lanes} · 모델 ${run.model} · max ${run.max ?? '-'} · hours ${run.hours ?? '-'} · 띄움 ${run.launched}`,
      `빈 줄 ${free.length}(발자국 없음 ${free.filter((i) => !state.foot[i.title]).length}) · 발견 ${foundCount()} · 7727 ${env.dev7727 ? '켜짐' : '꺼짐'} · playwright ${env.playwright ?? '없음'}`,
      ...notes,
    ].join('\n');
  });
};

/** 아무도 안 잡았고 🔒 가 아닌 「지금」 줄. */
const freeItems = (state) => {
  const claims = liveClaims();
  const ours = new Set(Object.values(state.lanes).filter(active).map((l) => l.title));
  return nowItems().filter((item) => !claims[item.title] && !ours.has(item.title) && !item.title.startsWith('🔒'));
};

const newId = (kind) => `${kind}-${Date.now().toString(36)}`;

const pick = (state) => {
  const run = state.run;
  if (!run || run.endedAt) return 'STOP 실행이 없다 — start 부터';
  const now = Date.now();
  for (const lane of Object.values(state.lanes)) {
    if (lane.status === 'running' && lane.orphan && now - lane.beat > ORPHAN_MS) Object.assign(lane, { status: 'held', orphan: false });
  }
  const entries = Object.entries(state.lanes);
  const running = entries.filter(([, l]) => l.status === 'running');
  const found = foundCount();

  const why = stopReason(state, now);
  if (why) {
    run.stop ??= { why, at: now };
    if (running.length) return `DRAIN ${running.length} ${why} — 달리는 레인이 끝나기를 기다린다`;
    // 멈추기 전 정리(/next SKILL 4) — 한도로 멈춘 때는 정리 레인도 같은 벽이라 건너뛴다.
    if (!run.finalTidy && !run.stop.hard && found > 0) {
      run.finalTidy = true;
      return startTidy(state, '멈추기 전 정리');
    }
    return `STOP ${why}`;
  }
  if (running.some(([, l]) => l.solo)) return 'WAIT 혼자 도는 레인(정리·공통 부품)이 끝나기를';
  const laneCount = running.filter(([, l]) => l.kind === 'lane').length;
  if (laneCount >= run.lanes) return `FULL ${laneCount}/${run.lanes}`;

  // 정리 차례 — 레인을 계속 채우면 다 빠지는 순간이 안 와서, 새 레인을 멈추고 빠지기를 기다린다(정리는 「지금」 순서를 바꾸므로 혼자 돈다).
  if (found > 0 && run.doneSinceTidy >= TIDY_EVERY) {
    if (running.length) return `WAIT 정리 차례(일 ${run.doneSinceTidy}개 끝 · 발견 ${found}) — 달리는 레인이 빠지기를`;
    return startTidy(state, `일 ${run.doneSinceTidy}개 끝 · 발견 ${found}`);
  }

  const reservedBy = (exceptId) =>
    entries.filter(([id, l]) => id !== exceptId && active(l)).flatMap(([id, l]) => (l.files ?? []).map((f) => [f, id]));
  const clash = (files, exceptId) => {
    for (const f of files) for (const [g, id] of reservedBy(exceptId)) if (touches(f, g)) return `${f}(${id})`;
    return null;
  };

  // 1) 쥔 채 멈춘 줄(막힘·보고 없이 끝남·고아)을 먼저 — 같은 pid 로 띄우면 레인의 take 가 RESUME 이다.
  for (const [id, lane] of entries) {
    if (lane.kind !== 'lane' || lane.status !== 'held') continue;
    if (lane.waitFor && state.lanes[lane.waitFor] && active(state.lanes[lane.waitFor])) continue;
    if (!isOurSleep(Number(id))) {
      lane.status = 'failed';
      lane.note = 'sleep 이 사라져 선점을 잃었다';
      continue;
    }
    if (lane.solo && running.length) continue;
    if (clash(lane.files ?? [], id)) continue;
    Object.assign(lane, { status: 'running', beat: now, rounds: (lane.rounds ?? 1) + 1, waitFor: null });
    run.launched++;
    return `LANE ${id} ${lane.model} ${lane.title}`;
  }

  // 2) 발자국이 없는 위쪽 줄은 정찰에 — 정찰이 도는 동안에도 발자국 있는 줄은 띄운다.
  const free = freeItems(state);
  const unscouted = free.filter((i) => !state.foot[i.title]).slice(0, SCOUT_BATCH);
  const scouting = running.some(([, l]) => l.kind === 'scout');
  if (unscouted.length && !scouting && (run.scoutFails ?? 0) < 2) return startScout(state, unscouted.length);

  // 3) 위에서부터, 달리는 레인과 파일이 안 겹치고 남의 편집이 없는 첫 줄.
  const dirty = dirtyFiles();
  const waits = [];
  for (const item of free) {
    const foot = state.foot[item.title];
    if (!foot) {
      waits.push(`정찰 대기 ${item.title}`);
      continue;
    }
    if (foot.skip) continue;
    if (foot.solo && running.length) {
      // 혼자 돌 줄이 차례면 그 밑을 더 띄우지 않는다 — 밑을 계속 띄우면 이 줄이 영영 자리를 못 얻는다.
      waits.push(`혼자 돌 차례 ${item.title}`);
      break;
    }
    const hit = clash(foot.files);
    if (hit) {
      waits.push(`겹침 ${hit}`);
      continue;
    }
    // 우리 레인의 편집은 위 겹침에서 이미 걸렀다 — 여기 걸리는 것은 다른 세션의 커밋 안 된 편집이다.
    const foreign = foot.files.find((f) => !f.startsWith('docs/') && [...dirty].some((d) => touches(f, d)));
    if (foreign) {
      waits.push(`남의 편집 ${foreign}`);
      continue;
    }
    const pid = spawnSleep();
    const out = claim(pid, 'take', item.title);
    if (!out.startsWith('CLAIMED')) {
      // 그 틈에 다른 세션이 잡았다 — 다음 줄로.
      killSleep(pid);
      continue;
    }
    const model = foot.model === 'opus' ? 'opus' : run.model;
    state.lanes[pid] = {
      kind: 'lane',
      title: item.title,
      line: item.line,
      files: [...foot.files],
      model,
      solo: Boolean(foot.solo),
      status: 'running',
      startedAt: now,
      beat: now,
      rounds: 1,
      tries: 0,
    };
    run.launched++;
    return `LANE ${pid} ${model} ${item.title}`;
  }

  if (running.length) return `WAIT ${waits.slice(0, 3).join(' · ') || '자리 없음'}`;
  if (scouting) return 'WAIT 정찰';
  if (found > 0 && !(run.lastTidyFound === found && run.doneSinceTidy === 0) && !run.finalTidy) {
    return startTidy(state, `띄울 줄이 없다 · 발견 ${found}`);
  }
  const skipped = free.filter((i) => state.foot[i.title]?.skip).length;
  run.stop = { why: `띄울 줄이 없다(빈 줄 ${free.length} · 뺌 ${skipped} · ${waits.slice(0, 2).join(' · ') || '-'})`, at: now };
  return `STOP ${run.stop.why}`;
};

const startScout = (state, n) => {
  const id = newId('scout');
  state.lanes[id] = { kind: 'scout', status: 'running', startedAt: Date.now(), beat: Date.now() };
  return `SCOUT ${id} ${n}`;
};
const startTidy = (state, why) => {
  const id = newId('tidy');
  state.lanes[id] = { kind: 'tidy', status: 'running', solo: true, startedAt: Date.now(), beat: Date.now() };
  return `TIDY ${id} ${why}`;
};

const reap = (state, argv) => {
  const failed = argOf(argv, '--failed');
  const [id] = argv;
  const lane = state.lanes[id];
  if (!lane) return `UNKNOWN ${id}`;
  if (lane.status !== 'running') return `ALREADY ${id} ${lane.status}`;
  const run = state.run;
  const result = lane.result;
  lane.endedAt = Date.now();
  if (failed && LIMIT_RE.test(failed)) run.stop = { why: `구독 한도 — ${failed.slice(0, 80)}`, at: Date.now(), hard: true };

  if (lane.kind !== 'lane') {
    lane.status = result ? 'done' : 'failed';
    if (lane.kind === 'scout' && !result) run.scoutFails = (run.scoutFails ?? 0) + 1;
    if (lane.kind === 'tidy') Object.assign(run, { doneSinceTidy: 0, lastTidyFound: foundCount() });
    return `${result ? '🧭' : '❌'} ${id} — ${result?.note ?? failed ?? '보고 없이 끝남'}`;
  }

  // 보고가 정본이다 — 보고를 남긴 뒤 오류로 끝난 레인도 그 일은 끝났다.
  if (result?.status === 'DONE' || result?.status === 'PARKED') {
    // done 을 빼먹고 끝났다면 줄이 작업 트리 「지금」 에 남아 다음 pick 이 같은 일을 또 띄운다.
    if (result.status === 'DONE' && nowItems().some((i) => i.title === lane.title)) claim(id, 'done');
    killSleep(Number(id));
    lane.status = result.status.toLowerCase();
    run.failStreak = 0;
    if (result.status === 'DONE') {
      run.done++;
      run.doneSinceTidy++;
      return `✅ ${result.hash ?? '-'} ${lane.title} — ${result.note}`;
    }
    return `⏸ 기다림으로 — ${lane.title} — ${result.note}`;
  }
  if (result?.status === 'BLOCKED') {
    Object.assign(lane, { status: 'held', waitFor: result.waitFor ?? null, note: result.note });
    delete lane.result;
    run.failStreak = 0;
    return `↩️ 막힘(${result.waitFor ? `${result.waitFor} 가 끝나면` : '나중에'} 다시) — ${lane.title} — ${result.note}`;
  }
  // 보고 없이 끝났다(한도·오류·사용자 중단). 선점은 쥔 채 한 번은 다시 띄운다 — 커밋 전 편집이 작업 트리에 있으면 다음 회차가 잇는다.
  lane.note = failed ?? '보고 없이 끝남';
  if (run.stop?.hard) {
    // 한도는 그 줄 탓이 아니다 — 실패로 세지 않고 쥔 채 멈춘다. 한도가 풀린 뒤 /next-auto 가 같은 pid 로 RESUME.
    lane.status = 'held';
    return `⛔ 한도로 끝남 — ${lane.title} — 선점을 쥔 채 멈춘다(한도가 풀리면 /next-auto 가 잇는다)`;
  }
  lane.tries++;
  run.failStreak++;
  if (lane.tries >= 2) {
    killSleep(Number(id));
    lane.status = 'failed';
    state.foot[lane.title] = { ...(state.foot[lane.title] ?? { files: lane.files, at: Date.now() }), skip: `실패: 레인이 두 번 보고 없이 끝났다(${lane.note})` };
    return `❌ 두 번 실패 — ${lane.title} — 이번 실행에서 뺀다(커밋 안 된 편집은 summary)`;
  }
  lane.status = 'held';
  return `❌ 보고 없이 끝남 — ${lane.title} — ${lane.note} · 선점을 쥔 채 다시 띄운다`;
};

const stop = (state, argv) => {
  if (!state.run || state.run.endedAt) return 'STOP 실행이 없다';
  state.run.stop ??= { why: argv.join(' ') || '사용자', at: Date.now() };
  const running = Object.values(state.lanes).filter((l) => l.status === 'running').length;
  return `STOPPING ${state.run.stop.why} — 새 레인 없음 · 달리는 ${running}개는 커밋까지 끝낸다`;
};

const status = (state) => {
  const run = state.run;
  if (!run) return '실행 기록 없음';
  const now = Date.now();
  const rows = Object.entries(state.lanes)
    .filter(([, l]) => active(l))
    .map(([id, l]) => `- ${l.status === 'running' ? '🏃' : '✋'} ${id} ${l.kind} ${l.title ?? ''} [${(l.files ?? []).join(', ')}] ${minutes(now - l.startedAt)}${l.orphan ? ' · 이전 감독' : ''}${l.waitFor ? ` · ${l.waitFor} 대기` : ''}`);
  const free = freeItems(state);
  return [
    `실행 ${run.id}${run.endedAt ? ' (끝남)' : ''} · 동시 ${run.lanes} · 띄움 ${run.launched} · 끝 ${run.done} · 연속 실패 ${run.failStreak} · 멈춤 ${run.stop?.why ?? (existsSync(STOP_FILE) ? 'STOP 파일' : '없음')}`,
    ...rows,
    `지금: 빈 줄 ${free.length}(발자국 없음 ${free.filter((i) => !state.foot[i.title]).length} · 뺌 ${free.filter((i) => state.foot[i.title]?.skip).length}) · 발견 ${foundCount()}`,
  ].join('\n');
};

const summary = (state) => {
  const run = state.run;
  if (!run) return '실행 기록 없음';
  const lanes = Object.entries(state.lanes).filter(([, l]) => l.kind === 'lane');
  const dirty = dirtyFiles();
  const by = (s) => lanes.filter(([, l]) => l.status === s);
  const out = [
    `/next-auto ${run.id} — 커밋 ${by('done').length} · 기다림 ${by('parked').length} · 쥔 채 ${by('held').length} · 실패 ${by('failed').length} · 멈춘 이유: ${run.stop?.why ?? '-'}`,
  ];
  for (const [, l] of by('done')) out.push(`✅ ${l.result?.hash ?? '-'} ${l.title} — ${l.result?.note ?? ''}`);
  for (const [, l] of by('parked')) out.push(`⏸ ${l.title} — ${l.result?.note ?? ''}`);
  for (const [id, l] of [...by('held'), ...by('failed')]) {
    const left = (l.files ?? []).filter((f) => [...dirty].some((d) => touches(f, d)));
    out.push(`${l.status === 'held' ? '✋' : '❌'} ${id} ${l.title} — ${l.note ?? ''}${left.length ? ` · 커밋 안 된 편집: ${left.join(', ')}` : ''}`);
  }
  for (const [, l] of lanes) if (l.result?.unseen) out.push(`👀 화면 확인 필요 — ${l.title}: ${l.result.unseen}`);
  const skipped = Object.entries(state.foot).filter(([, f]) => f.skip);
  for (const [title, f] of skipped) out.push(`⤼ 자동에서 뺌 — ${title}: ${f.skip}`);
  out.push(`「지금」 ${nowItems().length}줄 · 「발견」 ${foundCount()}줄 · 세부 보고 ${REPORTS}/`);
  return out.join('\n');
};

const cleanup = (state, argv) => {
  const all = hasFlag(argv, '--all');
  const notes = [];
  for (const [id, lane] of Object.entries(state.lanes)) {
    if (lane.status === 'running') {
      notes.push(`🏃 ${id} 는 아직 달린다 — 남긴다`);
      continue;
    }
    if (lane.status === 'held' && !all) {
      notes.push(`✋ ${id} ${lane.title} — 선점을 쥔 채 남긴다(다음 /next-auto 가 잇는다 · 풀려면 cleanup --all)`);
      continue;
    }
    if (lane.kind === 'lane') killSleep(Number(id));
    delete state.lanes[id];
  }
  if (state.run && !Object.values(state.lanes).some((l) => l.status === 'running')) state.run.endedAt = Date.now();
  return [`CLEANED${all ? ' --all' : ''}`, ...notes].join('\n');
};

// ── 레인·정찰 ────────────────────────────────────────────────────────────────

const laneOf = (state, pid) => {
  const lane = state.lanes[pid];
  if (!lane) throw new Error(`감독이 띄운 레인이 아니다: ${pid}`);
  lane.beat = Date.now();
  return lane;
};

const me = (state, [pid]) => {
  const lane = laneOf(state, pid);
  const others = Object.entries(state.lanes).filter(([id, l]) => id !== pid && active(l) && l.kind === 'lane');
  return [
    `레인 ${pid} · ${lane.model} · ${lane.rounds ?? 1}회차${(lane.rounds ?? 1) > 1 ? ' — 발자국 파일에 이미 있는 diff 는 이전 회차(너)의 것이다, 이어 간다' : ''}`,
    `줄: ${lane.line}`,
    `발자국(lease 됨): ${(lane.files ?? []).join(', ') || '(없음 — 고치기 전에 lease)'}`,
    '규칙: .claude/skills/next-auto/LANE.md 를 읽고 따른다(그 안에서 .claude/skills/next/PARALLEL.md 「레인 규칙」)',
    `claim.mjs · auto.mjs 를 부를 때마다 앞에: NEXT_CLAIM_OWNER=${pid}`,
    `화면: ${state.env.dev7727 ? 'http://localhost:7727 (next dev · SW 없음 · 남의 서버라 죽이지 않는다)' : '7727 이 꺼져 있다 — 띄우지 말고 report --unseen 으로'} · playwright: ${state.env.playwright ?? '없음 — report --unseen 으로'}`,
    `세부 보고: ${join(REPORTS, `${pid}.md`)}`,
    `다른 레인: ${others.map(([id, l]) => `${id} 「${l.title}」 [${(l.files ?? []).join(', ')}]`).join(' · ') || '없음'}`,
  ].join('\n');
};

const lease = (state, [pid, ...files]) => {
  const lane = laneOf(state, pid);
  const dirty = dirtyFiles();
  const wanted = files.map(normPath).filter((f) => f && !journalOnly(f));
  for (const f of wanted) {
    for (const [id, other] of Object.entries(state.lanes)) {
      if (id === pid || !active(other)) continue;
      const hit = (other.files ?? []).find((g) => touches(f, g));
      if (hit) return `CONFLICT ${f} ${id} 「${other.title}」 — 고치지 말고 「발견」, 꼭 필요하면 report BLOCKED --wait ${id}`;
    }
    const already = (lane.files ?? []).some((g) => touches(g, f));
    if (!already && !f.startsWith('docs/') && dirty.has(f)) return `DIRTY ${f} — 다른 세션의 커밋 안 된 편집이다, 고치지 않는다`;
  }
  lane.files = [...new Set([...(lane.files ?? []), ...wanted])];
  return `OK ${lane.files.join(', ')}`;
};

const report = (state, argv) => {
  const waitFor = argOf(argv, '--wait');
  const unseen = argOf(argv, '--unseen');
  const [id, status, hash, ...note] = argv;
  const lane = laneOf(state, id);
  const allowed = lane.kind === 'lane' ? ['DONE', 'PARKED', 'BLOCKED'] : ['DONE'];
  if (!allowed.includes(status)) throw new Error(`report 상태는 ${allowed.join('|')} 중 하나: ${status}`);
  lane.result = { status, hash: hash && hash !== '-' ? hash : null, note: note.join(' '), waitFor, unseen, at: Date.now() };
  return `REPORTED ${id} ${status}`;
};

const unscouted = (state) => {
  const rows = freeItems(state)
    .filter((i) => !state.foot[i.title])
    .slice(0, SCOUT_BATCH)
    .map((i) => i.line);
  return rows.join('\n') || '없음';
};

const foot = (state, argv) => {
  const title = argOf(argv, '--title');
  const files = argOf(argv, '--files');
  const model = argOf(argv, '--model');
  const skip = argOf(argv, '--skip');
  const solo = hasFlag(argv, '--solo');
  if (!title) throw new Error('foot 에는 --title 이 필요하다');
  const items = nowItems();
  const matches = items.filter((i) => i.title === title);
  const item = matches[0] ?? (items.filter((i) => i.title.startsWith(title)).length === 1 ? items.find((i) => i.title.startsWith(title)) : null);
  if (!item) throw new Error(`「지금」 에 그 제목이 없거나 여럿과 맞는다: ${title}`);
  // 문서는 고를 때의 발자국에 넣지 않는다 — 화면 일은 거의 다 같은 문서(app-shell-and-state·ADR-008)에 머리 줄을 쌓아,
  // 넣으면 서로 다른 화면 일끼리도 하나씩만 돈다. 문서의 주인은 레인이 고칠 때 먼저 lease 한 쪽이고, 진 쪽은 「발견」 의 "v 메모" 로 넘긴다.
  const list = (files ?? '').split(',').map(normPath).filter((f) => f && !journalOnly(f) && !f.startsWith('docs/'));
  if (!skip && !list.length) throw new Error('--files(고칠 파일) 또는 --skip(뺄 이유) 중 하나는 있어야 한다');
  state.foot[item.title] = { files: list, solo, model: model === 'opus' ? 'opus' : undefined, skip, at: Date.now() };
  return `FOOT ${item.title} ← ${list.join(', ') || '-'}${solo ? ' · 혼자' : ''}${model === 'opus' ? ' · opus' : ''}${skip ? ` · 뺌: ${skip}` : ''}`;
};

// ── 진입 ────────────────────────────────────────────────────────────────────

const [command = 'status', ...argv] = process.argv.slice(2);
const commands = {
  pick: () => withLock(pick),
  reap: () => withLock((s) => reap(s, argv)),
  stop: () => withLock((s) => stop(s, argv)),
  status: () => status(load()),
  summary: () => summary(load()),
  cleanup: () => withLock((s) => cleanup(s, argv)),
  me: () => withLock((s) => me(s, argv)),
  lease: () => withLock((s) => lease(s, argv)),
  report: () => withLock((s) => report(s, argv)),
  unscouted: () => unscouted(load()),
  foot: () => withLock((s) => foot(s, argv)),
};

try {
  const out = command === 'start' ? await start(argv) : commands[command]?.();
  if (out === undefined) throw new Error(`모르는 명령: ${command} (start | pick | reap | stop | status | summary | cleanup | me | lease | report | unscouted | foot)`);
  process.stdout.write(`${out}\n`);
} catch (error) {
  process.stderr.write(`next-auto: ${error.message}\n`);
  process.exitCode = 1;
}
