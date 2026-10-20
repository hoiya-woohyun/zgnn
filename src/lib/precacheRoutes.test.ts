import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 오프라인 프리캐시의 화면 주소는 `next.config.mjs` 의 `routes` 에 **손으로** 적는다 — 정적 내보내기 HTML 은 webpack 자산이 아니라
 * Serwist 매니페스트에 안 들어온다(pwa-offline.md). 새 화면을 만들고 그 줄을 빠뜨려도 빌드·테스트는 초록이고, 그 화면을 온라인에서 한 번도 안 연
 * 사람이 오프라인에서 누르면 `/404.html` 이 뜬다(`/saved/plan/` 이 그렇게 빠질 뻔했다, ADR-030 리뷰). 그래서 `src/app` 의 정적 화면을 목록과 대 본다.
 */
const ROOT = path.resolve(__dirname, '../..');
const APP = path.join(ROOT, 'src/app');

/** 프리캐시하지 않는 것이 결정인 화면 — 운영자 화면(ADR-018)과 `/places` 의 첫 탭 넘기기(받자마자 `/places/stay` 로 간다). */
const NOT_PRECACHED = new Set(['/admin/', '/admin/ops/', '/places/']);

function staticPages(dir: string, prefix = '/'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') found.push(prefix);
    // `[id]`·`[type]` 같은 동적 경로는 목록이 데이터에서 만들어진다 — 여기선 정적 화면만.
    if (entry.isDirectory() && !entry.name.startsWith('[') && !entry.name.startsWith('(') && !entry.name.startsWith('_')) {
      found.push(...staticPages(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    }
  }
  return found;
}

describe('프리캐시 화면 목록(next.config.mjs routes)', () => {
  it('src/app 의 정적 화면이 전부 들어 있다 — 일부러 뺀 것만 빼고', () => {
    const config = readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
    const missing = staticPages(APP).filter((route) => !NOT_PRECACHED.has(route) && !config.includes(`'${route}'`));
    expect(missing).toEqual([]);
  });
});
