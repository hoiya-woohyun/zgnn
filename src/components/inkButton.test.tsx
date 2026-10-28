import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { INK_ACTION, InkButton } from './inkButton';

describe('InkButton', () => {
  it('잉크 면 + 흰 글자 — base primary 의 핑크(hover·data-loading 변형까지)를 tailwind-merge 가 지운다', () => {
    const html = renderToStaticMarkup(<InkButton size="lg">자세히 보기</InkButton>);
    expect(html).toContain('bg-primary-solid');
    expect(html).toContain('text-white');
    expect(html).toContain('hover:opacity-90');
    expect(html).not.toContain('brand-solid');
  });

  it('링크 갈래(href)도 같은 면이고, 부르는 쪽 className 은 덧붙는다', () => {
    const html = renderToStaticMarkup(
      <InkButton size="lg" href="/place/a/" className="flex-1">
        자세히 보기
      </InkButton>,
    );
    expect(html).toContain('href="/place/a/"');
    expect(html).toContain('flex-1');
    expect(html).toContain('bg-primary-solid');
    expect(html).not.toContain('brand-solid');
  });

  it('raw 요소용 상수는 핑크를 갖지 않는다', () => {
    expect(INK_ACTION).toContain('bg-primary-solid');
    expect(INK_ACTION).not.toContain('brand');
  });
});

/**
 * 사용자 화면에 핑크 주 버튼이 돌아오지 않게 — base `Button` 의 기본 색이 `primary`(핑크)라 `color` 를 빼먹어도 핑크다.
 * 주 행동은 `InkButton`, 나머지는 색을 적는다. `/admin` 은 범위 밖(운영자 화면, 핑크 그대로).
 */
describe('사용자 화면의 base Button', () => {
  const files = execSync('git ls-files src/screens src/components', { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !f.includes('components/base/') && !/admin/i.test(f));

  it('color="primary" 를 쓰지 않고, 색 없는 <Button> 도 없다', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<Button\b([^>]*?)>/gs)) {
        const color = /\bcolor="([^"]+)"/.exec(match[1])?.[1];
        if (!color || color === 'primary') offenders.push(`${file}: ${color ?? '(기본 primary)'}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
