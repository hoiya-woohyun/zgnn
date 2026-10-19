import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilterChip } from './filterChip';

describe('FilterChip', () => {
  it('켜짐은 옅은 브랜드 면 + 브랜드 테두리 + 600, aria-pressed=true — 단색 채움은 쓰지 않는다', () => {
    const html = renderToStaticMarkup(<FilterChip pressed>동쪽</FilterChip>);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('bg-brand-primary');
    expect(html).toContain('border-brand');
    expect(html).toContain('text-brand-secondary');
    expect(html).not.toContain('bg-brand-solid');
  });

  it('꺼짐은 면 없이 같은 두께의 테두리 + 400 — 켜질 때 폭이 흔들리지 않게', () => {
    const html = renderToStaticMarkup(<FilterChip pressed={false}>동쪽</FilterChip>);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('border-primary');
    expect(html).toContain('bg-transparent');
    expect(html).toContain('font-normal');
    expect(html).not.toContain('bg-brand-primary');
  });

  it('보이는 것은 36px, 누르는 것은 위아래 4px 를 더한 44px', () => {
    const html = renderToStaticMarkup(<FilterChip pressed={false}>a</FilterChip>);
    expect(html).toContain('h-9');
    expect(html).toContain('before:-inset-y-1');
    expect(html).toContain('rounded-full');
  });

  it('굵은 글자 폭을 보이지 않는 사본으로 미리 잡는다 — 읽는 이름은 한 번', () => {
    const html = renderToStaticMarkup(<FilterChip pressed={false}>동쪽</FilterChip>);
    expect(html).toMatch(/aria-hidden="true" class="invisible[^"]*font-semibold">동쪽</);
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
