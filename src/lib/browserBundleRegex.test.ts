/**
 * 사이트 번들에 lookbehind(`(?<!…)`·`(?<=…)`)가 없다(08 T0.11). iOS 16.4 전 Safari 는 lookbehind 를 못 읽는다 —
 * 리터럴이면 그 청크 전체가 파싱 에러로 멎어 하이드레이션이 안 되고(빌드·테스트는 초록), `new RegExp` 면 그 줄을 그릴 때 SyntaxError 다.
 * 그래서 앞 글자를 캡처하는 어법을 쓴다(`scripts/lib/feeLine.mjs` 머리 주석).
 *
 * 대상은 `src/` 의 테스트가 아닌 파일 전부와, 거기서 상대 경로·`@/` 로 닿는 모든 모듈(`scripts/lib`·`scripts/analyze` 도 브라우저가 import 한다).
 * node 전용 스크립트는 import 를 따라 닿지 않는 한 대상이 아니다. 주석 줄(`//`·`*`)은 뺀다 — 이 규칙을 설명하는 주석이 있다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'src');
const CODE = /\.(?:ts|tsx|mjs|js)$/;
const IMPORT = /(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g;
const LOOKBEHIND = /\(\?<[!=]/;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const isTest = (file: string) => /\.test\.[a-z]+$/.test(file);

/** import 경로 → 레포 안의 파일. 패키지(bare)·JSON·CSS 는 null. */
const resolveImport = (from: string, spec: string): string | null => {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (CODE.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

/** `src/` 의 비테스트 파일에서 시작해 import 를 따라 닿는 모든 코드 파일. */
const browserReachable = (): string[] => {
  const seen = new Set<string>();
  const queue = walk(SRC).filter((file) => CODE.test(file) && !isTest(file));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file) || file.includes('node_modules')) continue;
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const next = resolveImport(file, match[1]);
      if (next && !isTest(next)) queue.push(next);
    }
  }
  return [...seen];
};

describe('사이트 번들의 정규식 — lookbehind 없음(08 T0.11)', () => {
  const files = browserReachable();

  it('src 밖의 모듈(scripts/lib)까지 따라간다 — 따라가지 못하면 이 검사는 빈 통과다', () => {
    const outside = files.map((file) => relative(ROOT, file)).filter((file) => file.startsWith('scripts/'));
    expect(outside).toEqual(expect.arrayContaining(['scripts/lib/feeLine.mjs', 'scripts/lib/petPolicyFacts.mjs', 'scripts/lib/stayEnvironment.mjs']));
  });

  it('주석이 아닌 줄에 (?<! · (?<= 가 없다', () => {
    const hits = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => {
          const code = line.trim();
          if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return [];
          return LOOKBEHIND.test(line) ? [`${relative(ROOT, file)}:${i + 1}`] : [];
        }),
    );
    expect(hits).toEqual([]);
  });
});
