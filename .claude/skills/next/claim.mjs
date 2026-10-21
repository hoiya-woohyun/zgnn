#!/usr/bin/env node
// /next 의 선점(claim) — 세션 여럿이 동시에 "/next" 해도 **친 순서대로** 「지금」 의 서로 다른 줄을 잡게 한다.
//
// 왜: 세 세션이 거의 같은 때 NOW.md 를 읽으면 셋 다 같은 "맨 위" 를 본다. 읽기와 잡기 사이에 틈이 있어서다.
// 그래서 잡기를 `mkdir` 잠금(원자적) 안에서 한 번에 한다 — 먼저 잠근 세션이 첫 빈 줄을, 다음 세션이 그다음 줄을 받는다.
//
// 주인은 그 터미널의 claude 프로세스(`CLAUDE_PID`, 없으면 조상의 claude·cursor-agent — `resolveOwner`)다. 세션 id 가 아니라 프로세스인 이유:
// - 프로세스가 죽으면(터미널을 닫음) `kill -0` 으로 알 수 있어 선점이 저절로 풀린다.
// - 같은 터미널이 `/clear` 뒤 다시 `/next` 하면 하던 줄을 그대로 돌려받는다(중단된 일을 이어 간다).
// 선점 기록은 git 밖(`.claude/next-claims.json`, .gitignore)이라 커밋에 섞이지 않는다.
//
//   node .claude/skills/next/claim.mjs take     → CLAIMED|RESUME <n>/<지금 수> <줄>  ·  없으면 NONE …
//   node .claude/skills/next/claim.mjs take <제목 앞부분>
//                                              → 그 줄만 — CLAIMED · TAKEN(남이 잡음·🔒) · NOTFOUND (/next-auto 감독용)
//   node .claude/skills/next/claim.mjs done     → 내 줄을 NOW.md 「지금」 에서 지우고 선점을 푼다(잠금 안에서)
//   node .claude/skills/next/claim.mjs release  → 줄은 남기고 선점만 푼다
//   node .claude/skills/next/claim.mjs park 🧑|🙋 <이유 · 명령/권고>
//                                              → 사람을 기다리게 된 내 줄을 「기다림」 맨 위로 옮기고 선점을 푼다(잠금 안에서)
//   node .claude/skills/next/claim.mjs list     → 지금 누가 무엇을 잡았나
//
// 테스트용: NEXT_CLAIM_OWNER 로 주인 pid 를, CLAUDE_PROJECT_DIR 로 루트를 바꿀 수 있다.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const NOW = join(ROOT, 'docs/todo/NOW.md');
const CLAIMS = join(ROOT, '.claude/next-claims.json');
const LOCK = join(ROOT, '.claude/next-claims.lock');
/** pid 재사용에 대한 안전망 — 이보다 오래된 선점은 주인이 살아 있어도 푼다. 한 일이 반나절을 넘기지 않는다. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** 잠금을 쥔 채 죽은 프로세스의 흔적. 잡기는 수 ms 라 10초면 확실히 죽은 잠금이다. */
const STALE_LOCK_MS = 10 * 1000;

/**
 * 셸의 조상 중 가장 가까운 에이전트 프로세스(claude · cursor-agent). Cursor 에이전트 셸엔 `CLAUDE_PID` 가 없는데, `process.ppid` 로 떨어지면
 * 그 셸은 호출마다 새로 뜨고 끝나 다음 호출 때 이미 죽어 있다 — `take` 직후 선점이 풀려 다른 세션이 같은 줄을 받는다(08 T0.12).
 * `.claude/` 같은 경로 조각은 앞이 `.` 이라 걸리지 않는다.
 */
const AGENT_COMMAND = /(?:^|[\s/])(?:claude|cursor-agent)(?:[\s/]|$)/;
const agentAncestor = () => {
  let pid = process.ppid;
  for (let depth = 0; pid > 1 && depth < 32; depth++) {
    let row;
    try {
      row = execFileSync('ps', ['-o', 'ppid=,command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    } catch {
      return undefined; // ps 가 없거나 그사이 프로세스가 끝났다 — 아래 경고로 떨어진다.
    }
    const [, ppid, commandLine] = row.match(/^(\d+)\s+(.*)$/) ?? [];
    if (commandLine === undefined) return undefined;
    if (AGENT_COMMAND.test(commandLine)) return pid;
    pid = Number(ppid);
  }
  return undefined;
};

const resolveOwner = () => {
  const fixed = process.env.NEXT_CLAIM_OWNER || process.env.CLAUDE_PID;
  if (fixed) return Number(fixed);
  const agent = agentAncestor();
  if (agent) return agent;
  process.stderr.write(
    `⚠️ 조상에서 claude·cursor-agent 를 못 찾아 부모 프로세스를 주인으로 적는다(pid ${process.ppid}) — 셸이 호출마다 바뀌면 선점이 곧장 풀린다(NEXT_CLAIM_OWNER 로 고정)\n`,
  );
  return process.ppid;
};

const owner = resolveOwner();

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const withLock = (fn) => {
  for (let i = 0; ; i++) {
    try {
      mkdirSync(LOCK);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > STALE_LOCK_MS) rmdirSync(LOCK);
      } catch {
        // 그사이 주인이 잠금을 풀었거나 다른 세션이 먼저 치웠다 — 어느 쪽이든 다음 바퀴의 mkdir 이 다시 겨룬다.
      }
      if (i > 500) throw new Error(`잠금을 얻지 못했다: ${LOCK}`);
      sleep(20);
    }
  }
  try {
    return fn();
  } finally {
    rmdirSync(LOCK);
  }
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

// todoNow.mjs 와 같은 규칙 — 링크·설명을 뗀 제목이 줄의 이름이다(설명에 메모를 덧붙여도 선점이 안 풀리게).
const titleOf = (line) => line.replace(/^- (\[.\] )?/, '').split(' — ')[0].replace(/\*\*/g, '').trim();

/** 「지금」 절의 `- ` 줄들과 그 줄 번호. */
const nowLines = (lines) => {
  const start = lines.findIndex((line) => /^## 지금/.test(line));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    if (/^- /.test(lines[i])) out.push({ index: i, line: lines[i], title: titleOf(lines[i]) });
  }
  return out;
};

/** 죽은 주인·오래된 선점·NOW.md 에서 사라진 줄의 선점을 털어 낸 기록. */
const liveClaims = (items) => {
  let claims = {};
  try {
    claims = JSON.parse(readFileSync(CLAIMS, 'utf8'));
  } catch {
    // 기록이 없다(첫 실행 · 사용자가 지워 선점을 손으로 풀었다)·깨졌다 — 빈 기록으로 시작한다. 잃는 것은 선점뿐이고 NOW.md 는 그대로다.
  }
  const titles = new Set(items.map((item) => item.title));
  return Object.fromEntries(
    Object.entries(claims).filter(
      ([title, c]) => titles.has(title) && alive(c.pid) && Date.now() - c.at < MAX_AGE_MS,
    ),
  );
};

const save = (claims) => writeFileSync(CLAIMS, `${JSON.stringify(claims, null, 2)}\n`);

const readNow = () => (existsSync(NOW) ? readFileSync(NOW, 'utf8').split('\n') : []);

const command = process.argv[2] ?? 'take';

const result = withLock(() => {
  const lines = readNow();
  const items = nowLines(lines);
  const claims = liveClaims(items);
  const mine = Object.keys(claims).find((title) => claims[title].pid === owner);
  const position = (title) => `${items.findIndex((item) => item.title === title) + 1}/${items.length}`;

  if (command === 'take') {
    if (mine) {
      save(claims);
      return `RESUME ${position(mine)} ${items.find((item) => item.title === mine).line}`;
    }
    // 감독(/next-auto)은 파일이 안 겹치는 줄을 골라 제목으로 잡는다 — 그 줄만 본다. 남이 잡았거나 🔒 면 내주지 않는다.
    const want = process.argv.slice(3).join(' ').trim();
    if (want) {
      const item = items.find((i) => i.title === want) ?? items.find((i) => i.title.startsWith(want));
      save(claims);
      if (!item) return `NOTFOUND ${want}`;
      if (claims[item.title] || item.title.startsWith('🔒')) return `TAKEN ${item.title}`;
      claims[item.title] = { pid: owner, at: Date.now() };
      save(claims);
      return `CLAIMED ${position(item.title)} ${item.line}`;
    }
    // 제목이 `🔒` 로 시작하면 사람이나 다른 세션이 손으로 잡아 둔 줄이다 — 레지스트리에 없어도 내주지 않는다.
    const free = items.find((item) => !claims[item.title] && !item.title.startsWith('🔒'));
    if (!free) {
      save(claims);
      const taken = Object.keys(claims);
      return items.length === 0
        ? 'NONE 「지금」 이 비었다 — SKILL.md 4 의 정리부터'
        : `NONE 「지금」 ${items.length}개를 모두 다른 세션이 잡았다: ${taken.join(' · ')}`;
    }
    claims[free.title] = { pid: owner, at: Date.now() };
    save(claims);
    return `CLAIMED ${position(free.title)} ${free.line}`;
  }

  if (command === 'done' || command === 'release') {
    if (!mine) {
      save(claims);
      return 'NOCLAIM 이 세션이 잡은 줄이 없다';
    }
    delete claims[mine];
    save(claims);
    if (command === 'done') {
      const item = items.find((i) => i.title === mine);
      lines.splice(item.index, 1);
      writeFileSync(NOW, lines.join('\n'));
      return `DONE NOW.md 에서 지웠다: ${mine}`;
    }
    return `RELEASED ${mine}`;
  }

  // release 뒤에 Edit 로 「기다림」 에 옮기면 그 틈에 다른 세션의 take 가 같은 줄(막 풀린 첫 줄)을 받아 같은 벽에 부딪힌다.
  // 그래서 옮기기와 풀기를 한 잠금 안에서 한다.
  if (command === 'park') {
    if (!mine) {
      save(claims);
      return 'NOCLAIM 이 세션이 잡은 줄이 없다';
    }
    const args = process.argv.slice(3);
    const kind = args[0] === '🙋' ? '🙋' : '🧑';
    const why = (args[0] === '🙋' || args[0] === '🧑' ? args.slice(1) : args).join(' ').trim();
    if (!why) throw new Error('park 에는 이유가 필요하다: park 🧑|🙋 <이유 · 명령/권고>');
    const head = lines.findIndex((line) => /^## 기다림/.test(line));
    if (head < 0) throw new Error('NOW.md 에 「기다림」 절이 없다');
    const item = items.find((i) => i.title === mine);
    // 「기다림」 은 「지금」 밑이라 먼저 넣고 나서 지운다 — 지우는 줄의 번호가 밀리지 않게.
    // 빈 줄은 절이 비어 있을 때만 — 목록 줄 앞에 끼우면 「기다림」 목록이 둘로 갈린다.
    const entry = `- ${kind} ${item.line.replace(/^- (\[.\] )?/, '')} · 막힘: ${why}`;
    lines.splice(head + 2, 0, ...(lines[head + 2]?.startsWith('- ') ? [entry] : [entry, '']));
    lines.splice(item.index, 1);
    delete claims[mine];
    save(claims);
    writeFileSync(NOW, lines.join('\n'));
    return `PARKED 「기다림」 으로 옮겼다: ${mine}`;
  }

  if (command === 'list') {
    save(claims);
    const rows = items.map(
      (item, i) =>
        `${i + 1}. ${claims[item.title] ? `🔒 pid ${claims[item.title].pid}${claims[item.title].pid === owner ? '(나)' : ''}` : '  '} ${item.title}`,
    );
    return rows.join('\n') || '「지금」 이 비었다';
  }

  throw new Error(`모르는 명령: ${command} (take | done | release | park | list)`);
});

process.stdout.write(`${result}\n`);
