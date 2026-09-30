import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilterChip } from './filterChip';

describe('FilterChip', () => {
  it('켜짐은 워시 + 브랜드 테두리, aria-pressed=true', () => {
    const html = renderToStaticMarkup(<FilterChip pressed>동쪽</FilterChip>);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('bg-brand-primary');
    expect(html).toContain('border-brand');
    expect(html).not.toContain('bg-brand-solid');
  });

  it('꺼짐도 같은 두께의 테두리를 둔다 — 켜질 때 폭이 흔들리지 않게', () => {
    const html = renderToStaticMarkup(<FilterChip pressed={false}>동쪽</FilterChip>);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('border-primary');
    expect(html).not.toContain('bg-brand-primary');
  });

  it('44px 터치 높이를 지킨다', () => {
    expect(renderToStaticMarkup(<FilterChip pressed={false}>a</FilterChip>)).toContain('h-11');
  });

  it('toggle={false} 는 켜진 모양만 빌리고 aria-pressed 를 달지 않는다', () => {
    const html = renderToStaticMarkup(
      <FilterChip pressed toggle={false} aria-label="애월읍 조건 끄기">
        애월읍
      </FilterChip>,
    );
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('bg-brand-primary');
    expect(html).toContain('aria-label="애월읍 조건 끄기"');
  });
});
