#!/usr/bin/env node
// SessionStart 훅 — 대기열(docs/todo/NOW.md)에서 아직 아무 세션도 안 잡은 위 셋과 「기다림」 수를 세션 첫 화면에 한 줄로 보인다.
//
// 목적은 새 세션에서 "다음에 뭘 하지?" 를 없애는 것이다 — 사용자는 "/next" 한 마디만 치면 된다(.claude/skills/next).
// 대기열이 없거나 비면 아무것도 안 한다(조용히 끝낸다). 맥락에 넣는 것도 세 줄뿐이라 토큰이 거의 들지 않는다.
//
// 테스트: node .claude/hooks/todoNow.mjs

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const NOW = join(ROOT, 'docs/todo/NOW.md');
if (!existsSync(NOW)) process.exit(0);

const text = readFileSync(NOW, 'utf8');

/** `## 제목` 아래의 `- ` 줄들. 다음 `## ` 에서 끝난다. */
const section = (title) => {
  const start = text.search(new RegExp(`^## ${title}`, 'm'));
  if (start < 0) return [];
  const rest = text.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).filter((line) => /^- /.test(line));
};

// 링크·뒤의 설명은 떼고 제목만 — 첫 화면 한 줄이 길어지지 않게.
const titleOf = (line) => line.replace(/^- (\[ \] )?/, '').split(' — ')[0].replace(/\*\*/g, '').trim();

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

/** 다른 세션이 `/next` 로 잡아 둔 줄(.claude/skills/next/claim.mjs). 주인이 죽은 선점은 세지 않는다. */
const claimed = (() => {
  try {
    const claims = JSON.parse(readFileSync(join(ROOT, '.claude/next-claims.json'), 'utf8'));
    return new Set(Object.keys(claims).filter((title) => alive(claims[title].pid)));
  } catch {
    return new Set();
  }
})();

const now = section('지금');
const waiting = section('기다림');
const found = section('발견');
if (now.length === 0 && waiting.length === 0) process.exit(0);

const free = now.map(titleOf).filter((title) => !claimed.has(title));
const busy = now.length - free.length;
const top = free.slice(0, 3);
const userLine =
  top.length > 0
    ? `📋 다음: ${top[0]}${free.length > 1 ? ` 외 ${free.length - 1}` : ''}${busy ? ` · 다른 세션 진행 중 ${busy}` : ''} · 기다림 ${waiting.length} → /next`
    : now.length > 0
      ? `📋 「지금」 ${now.length}개 모두 다른 세션이 진행 중 · 기다림 ${waiting.length}`
      : `📋 할 일 없음 · 기다림 ${waiting.length}(사람 손) — docs/todo/NOW.md`;

process.stdout.write(
  JSON.stringify({
    systemMessage: userLine,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        `[todo] 대기열 docs/todo/NOW.md — 지금 ${now.length}(다른 세션 진행 중 ${busy}) · 기다림 ${waiting.length} · 발견 ${found.length}. ` +
        (top.length ? `안 잡힌 위 셋: ${top.map((t, i) => `${i + 1}) ${t}`).join(' ')}. ` : '') +
        '사용자가 "진행"·"다음"·"/next" 라고 하면 .claude/skills/next 대로 묻지 않고 처리한다 — ' +
        '일은 NOW.md 에서 직접 고르지 말고 `node .claude/skills/next/claim.mjs take` 로 선점한 줄을 한다(여러 세션이 동시에 돈다).',
    },
  }),
);
