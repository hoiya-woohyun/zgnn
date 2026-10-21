#!/usr/bin/env node
// 레인 커밋 — 같은 작업 트리에서 레인 여럿·다른 세션이 동시에 커밋할 때, 내 것만 싣는다.
//
//   node lane-commit.mjs --msg <msg.txt> [--files a,b,...] [--edits edits.json] [--drop-now "<NOW 줄 제목 앞부분>"]
//
// --files : 내 레인만 고친 파일(코드·새 문서). 작업 트리 내용을 **통째로** 싣는다(지워졌으면 삭제).
// --edits : 공유 문서(docs/todo/*, 기존 docs/**) 편집 저널 — [{ "file": "...", "old": "...", "new": "..." }, ...]
//           HEAD 판에 저널만 다시 적용해 싣고, 작업 트리에도 적용한다(이미 적용됐으면 건너뜀).
//           new 가 old 를 품는 덧붙이기도 된다(new 가 이미 있으면 적용된 것으로 본다). new 가 "" 이면 지우기.
// --drop-now : NOW.md 「지금」 에서 그 제목으로 시작하는 `- [ ] ` 줄을 HEAD 판에서 지운다(claim.mjs done 이 작업 트리 쪽을 지운다).
// --park-now : claim.mjs park 가 작업 트리에서 한 옮김(「지금」 → 「기다림」 맨 위)을 HEAD 판에도 한다 — 옮겨진 줄은 작업 트리에서 그대로 가져온다.
//              안 그러면 park 가 작업 트리에만 남아, 남의 NOW.md 경로 커밋이 실어 갈 때까지 HEAD 는 그 줄을 「지금」 에 둔다.
//
// 커밋은 개인 인덱스(read-tree HEAD) → write-tree → commit-tree → `update-ref HEAD 새 옛`(비교 교체). HEAD 가 움직였으면 다시.
// 끝나면 공유 인덱스의 그 경로를 HEAD 로 맞춘다(git reset -q -- 경로) — 안 그러면 남의 맨 `git commit` 이 내 변경을 되돌린다.
// 레인끼리는 .git/lane-commit.lock(mkdir)으로 줄 세운다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const GITDIR = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
const LOCK = join(GITDIR, 'lane-commit.lock');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const msgFile = opt('--msg');
const files = (opt('--files') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const edits = opt('--edits') ? JSON.parse(readFileSync(opt('--edits'), 'utf8')) : [];
const dropNow = opt('--drop-now');
const parkNow = opt('--park-now');
if (!msgFile) {
  console.error('usage: lane-commit.mjs --msg <file> [--files a,b] [--edits edits.json] [--drop-now "<제목>" | --park-now "<제목>"]');
  process.exit(64);
}
for (const e of edits) {
  if (typeof e.file !== 'string' || typeof e.old !== 'string' || typeof e.new !== 'string' || !e.old) {
    console.error('edits 항목은 { file, old(비지 않음), new } 여야 한다:', JSON.stringify(e).slice(0, 200));
    process.exit(64);
  }
}

const git = (argv, { input, env } = {}) =>
  execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8', input, env: { ...process.env, ...env }, maxBuffer: 64 << 20 });

const count = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

/** 저널 한 칸 적용. 반환 [내용, 'applied'|'already']. 찾을 수 없으면 throw. */
const applyEdit = (content, e, where) => {
  if (e.new !== '' && content.includes(e.new)) return [content, 'already'];
  const n = count(content, e.old);
  if (n === 1) return [content.replace(e.old, () => e.new), 'applied'];
  if (n === 0 && e.new === '') return [content, 'already'];
  throw new Error(`${where} ${e.file}: old 가 ${n}번 나온다(1번이어야) — ${JSON.stringify(e.old.slice(0, 120))}`);
};

const NOW_PATH = 'docs/todo/NOW.md';
const dropNowLine = (content) => {
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('- [ ] ') && l.slice(6).replace(/^🔒\s*/, '').startsWith(dropNow));
  if (idx < 0) return [content, 'already'];
  lines.splice(idx, 1);
  return [lines.join('\n'), 'applied'];
};

/** claim.mjs park 와 같은 자리(「기다림」 머리 + 2)에 같은 줄을 — 그 줄은 park 가 이미 쓴 작업 트리에서 찾는다. */
const parkNowLine = (content) => {
  const parked = readFileSync(join(ROOT, NOW_PATH), 'utf8')
    .split('\n')
    .find((l) => /^- (🧑|🙋) /.test(l) && l.replace(/^- (🧑|🙋) (\[.\] )?/, '').replace(/^🔒\s*/, '').startsWith(parkNow));
  if (!parked) throw new Error(`작업 트리 「기다림」 에 "${parkNow}" 로 시작하는 park 줄이 없다 — claim.mjs park 를 먼저`);
  if (content.includes(parked)) return [content, 'already'];
  const lines = content.split('\n');
  const now = lines.findIndex((l) => l.startsWith('- [ ] ') && l.slice(6).replace(/^🔒\s*/, '').startsWith(parkNow));
  if (now >= 0) lines.splice(now, 1);
  const head = lines.findIndex((l) => /^## 기다림/.test(l));
  if (head < 0) throw new Error('HEAD 의 NOW.md 에 「기다림」 절이 없다');
  lines.splice(head + 2, 0, ...(lines[head + 2]?.startsWith('- ') ? [parked] : [parked, '']));
  return [lines.join('\n'), 'applied'];
};

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const lock = () => {
  for (let i = 0; i < 600; i++) {
    try {
      mkdirSync(LOCK);
      return;
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 120_000) rmdirSync(LOCK);
      } catch {}
      sleepMs(200);
    }
  }
  throw new Error('lane-commit 잠금을 2분 동안 못 얻었다');
};

lock();
let result;
try {
  const tmpIndex = join(GITDIR, `lane-index-${process.pid}`);
  const env = { GIT_INDEX_FILE: tmpIndex };
  for (let attempt = 1; attempt <= 8; attempt++) {
    const head = git(['rev-parse', 'HEAD']).trim();
    git(['read-tree', head], { env });
    for (const f of files) {
      const abs = join(ROOT, f);
      if (existsSync(abs)) {
        const sha = git(['hash-object', '-w', '--', f]).trim();
        const mode = statSync(abs).mode & 0o111 ? '100755' : '100644';
        git(['update-index', '--add', '--cacheinfo', `${mode},${sha},${f}`], { env });
      } else {
        git(['update-index', '--force-remove', '--', f], { env });
      }
    }
    const byFile = new Map();
    for (const e of edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
    if ((dropNow || parkNow) && !byFile.has(NOW_PATH)) byFile.set(NOW_PATH, []);
    for (const [file, list] of byFile) {
      let content;
      try {
        content = git(['show', `${head}:${file}`]);
      } catch {
        content = '';
      }
      for (const e of list) [content] = applyEdit(content, e, 'HEAD');
      if (file === NOW_PATH && dropNow) {
        let st;
        [content, st] = dropNowLine(content);
        if (st === 'already') console.error(`경고: HEAD 의 NOW.md 에 "${dropNow}" 줄이 없다(이미 지워짐?)`);
      }
      if (file === NOW_PATH && parkNow) [content] = parkNowLine(content);
      const sha = git(['hash-object', '-w', '--stdin'], { input: content }).trim();
      git(['update-index', '--add', '--cacheinfo', `100644,${sha},${file}`], { env });
    }
    const tree = git(['write-tree'], { env }).trim();
    if (tree === git(['rev-parse', `${head}^{tree}`]).trim()) {
      console.error('싣을 변경이 없다(HEAD 와 같은 트리)');
      result = { code: 2 };
      break;
    }
    const commit = git(['commit-tree', tree, '-p', head, '-F', msgFile]).trim();
    try {
      git(['update-ref', '-m', 'lane-commit', 'HEAD', commit, head]);
      result = { code: 0, commit, head };
      break;
    } catch {
      console.error(`HEAD 가 움직였다(${attempt}) — 다시`);
      sleepMs(300);
    }
  }
  try {
    execFileSync('rm', ['-f', tmpIndex]);
  } catch {}
  if (!result) throw new Error('8번 다시 해도 HEAD 비교 교체 실패');

  if (result.code === 0) {
    // 작업 트리에도 저널을 적용(이미 적용됐으면 건너뜀) — 빼먹으면 작업 트리가 HEAD 뒤에 남아 남의 경로 커밋이 내 줄을 되돌린다.
    const byFile = new Map();
    for (const e of edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
    for (const [file, list] of byFile) {
      const abs = join(ROOT, file);
      let content = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
      let changed = false;
      for (const e of list) {
        try {
          const [next, st] = applyEdit(content, e, '작업 트리');
          if (st === 'applied') {
            content = next;
            changed = true;
          }
        } catch (err) {
          console.error(`경고: ${err.message}`);
        }
      }
      if (changed) writeFileSync(abs, content);
    }
    const paths = [...new Set([...files, ...edits.map((e) => e.file), ...(dropNow || parkNow ? [NOW_PATH] : [])])];
    if (paths.length) git(['reset', '-q', '--', ...paths]);
    console.log(`COMMITTED ${result.commit.slice(0, 7)} (부모 ${result.head.slice(0, 7)})`);
    console.log(git(['show', '--stat', '--format=%s', result.commit]).split('\n').slice(0, 30).join('\n'));
  }
} finally {
  try {
    rmdirSync(LOCK);
  } catch {}
}
process.exit(result?.code ?? 1);
