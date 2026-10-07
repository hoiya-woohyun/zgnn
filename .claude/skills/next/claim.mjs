#!/usr/bin/env node
// /next 의 선점(claim) — 세션 여럿이 동시에 "/next" 해도 **친 순서대로** 「지금」 의 서로 다른 줄을 잡게 한다.
//
// 왜: 세 세션이 거의 같은 때 NOW.md 를 읽으면 셋 다 같은 "맨 위" 를 본다. 읽기와 잡기 사이에 틈이 있어서다.
// 그래서 잡기를 `mkdir` 잠금(원자적) 안에서 한 번에 한다 — 먼저 잠근 세션이 첫 빈 줄을, 다음 세션이 그다음 줄을 받는다.
//
// 주인은 그 터미널의 claude 프로세스(`CLAUDE_PID`)다. 세션 id 가 아니라 프로세스인 이유:
// - 프로세스가 죽으면(터미널을 닫음) `kill -0` 으로 알 수 있어 선점이 저절로 풀린다.
// - 같은 터미널이 `/clear` 뒤 다시 `/next` 하면 하던 줄을 그대로 돌려받는다(중단된 일을 이어 간다).
// 선점 기록은 git 밖(`.claude/next-claims.json`, .gitignore)이라 커밋에 섞이지 않는다.
//
//   node .claude/skills/next/claim.mjs take     → CLAIMED|RESUME <n>/<지금 수> <줄>  ·  없으면 NONE …
//   node .claude/skills/next/claim.mjs done     → 내 줄을 NOW.md 「지금」 에서 지우고 선점을 푼다(잠금 안에서)
//   node .claude/skills/next/claim.mjs release  → 줄은 남기고 선점만 푼다(사람을 기다리게 됐을 때 등)
//   node .claude/skills/next/claim.mjs list     → 지금 누가 무엇을 잡았나
//
// 테스트용: NEXT_CLAIM_OWNER 로 주인 pid 를, CLAUDE_PROJECT_DIR 로 루트를 바꿀 수 있다.

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

const owner = Number(process.env.NEXT_CLAIM_OWNER || process.env.CLAUDE_PID || process.ppid);

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
      } catch {}
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
  } catch {}
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

  if (command === 'list') {
    save(claims);
    const rows = items.map(
      (item, i) =>
        `${i + 1}. ${claims[item.title] ? `🔒 pid ${claims[item.title].pid}${claims[item.title].pid === owner ? '(나)' : ''}` : '  '} ${item.title}`,
    );
    return rows.join('\n') || '「지금」 이 비었다';
  }

  throw new Error(`모르는 명령: ${command} (take | done | release | list)`);
});

process.stdout.write(`${result}\n`);
