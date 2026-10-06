#!/usr/bin/env node
// SessionStart 훅 — 이번 주(월요일 시작, KST) 사용성 평가 종합이 없으면 실행을 권한다.
//
// 완료의 기준은 `docs/reviews/ux-eval/YYYY-MM-DD/00-종합.md` 가 **있는 것**이다.
// 디렉터리만 있고 종합이 없으면(구독 한도로 평가자가 중간에 죽은 경우) 아직 안 한 주로 본다.
// 날짜는 mtime 이 아니라 디렉터리 이름에서 읽는다 — checkout·worktree 가 mtime 을 바꾼다.
// 이번 주만 보므로 몇 주를 건너뛰어도 권고는 한 번(이번 주 한 회차)뿐이다.
//
// 테스트: UX_EVAL_TODAY=2026-10-12 node .claude/hooks/uxEvalWeekly.mjs

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const EVAL_DIR = join(ROOT, 'docs/reviews/ux-eval');
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;

const kstToday = () =>
  process.env.UX_EVAL_TODAY ||
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

// YYYY-MM-DD 문자열끼리만 다룬다 — 시각·시간대가 끼면 자정 근처에서 주가 어긋난다.
const mondayOf = (ymd) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
};

const doneRuns = () => {
  if (!existsSync(EVAL_DIR)) return [];
  return readdirSync(EVAL_DIR)
    .filter((name) => DATE_DIR.test(name) && existsSync(join(EVAL_DIR, name, '00-종합.md')))
    .sort();
};

const today = kstToday();
const monday = mondayOf(today);
const runs = doneRuns();
if (runs.some((d) => d >= monday && d <= today)) process.exit(0);

const last = runs.at(-1);
const lastNote = last ? `마지막 회차 ${last}` : '아직 회차 없음';
const userLine = `🐶 이번 주(${monday}~) 사용성 평가가 아직 없어요 · ${lastNote} → /model 로 Fable 을 고른 뒤 /ux-eval`;

process.stdout.write(
  JSON.stringify({
    systemMessage: userLine,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        `[ux-eval] 이번 주(${monday} 월요일부터) docs/reviews/ux-eval/<날짜>/00-종합.md 가 없다(${lastNote}). ` +
        '사용자의 첫 요청을 처리한 뒤 한 줄로 "이번 주 사용성 평가(/ux-eval)를 돌릴까요?" 를 권한다. ' +
        '여러 주를 건너뛰었어도 이번 주 한 번만 권하고, 사용자가 원하지 않으면 다시 묻지 않는다. 묻지 않고 실행하지 않는다.',
    },
  }),
);
