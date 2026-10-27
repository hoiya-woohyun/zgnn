import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilterChip } from './filterChip';

describe('FilterChip', () => {
  it('켜짐은 잉크 면 + 흰 글자 400, aria-pressed=true — 브랜드 틴트·600 은 쓰지 않는다', () => {
    const html = renderToStaticMarkup(<FilterChip pressed>동쪽</FilterChip>);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('bg-primary-solid');
    expect(html).toContain('text-primary_on-brand');
    expect(html).toContain('font-normal');
    expect(html).not.toContain('bg-brand');
    expect(html).not.toContain('font-semibold');
  });

  it('꺼짐은 면 없이 같은 두께의 테두리 + 400 — 켜질 때 폭이 흔들리지 않게', () => {
    const html = renderToStaticMarkup(<FilterChip pressed={false}>동쪽</FilterChip>);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('border-primary');
    expect(html).toContain('bg-transparent');
    expect(html).toContain('font-normal');
    expect(html).not.toContain('bg-primary-solid');
  });

  it('보이는 것은 36px, 누르는 것은 테두리 안쪽(34px)에서 위아래 5px 를 더한 44px — 4px 면 42px 였다(22 A·B review R-1)', () => {
    const html = renderToStaticMarkup(<FilterChip pressed={false}>a</FilterChip>);
    expect(html).toContain('h-9');
    expect(html).toContain('border ');
    expect(html).toContain('before:-inset-y-1.25');
    expect(html).toContain('rounded-full');
  });

  it('toggle={false} 는 켜진 모양만 빌리고 aria-pressed 를 달지 않는다', () => {
    const html = renderToStaticMarkup(
      <FilterChip pressed toggle={false} aria-label="애월읍 조건 끄기">
        애월읍
      </FilterChip>,
    );
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('bg-primary-solid');
    expect(html).toContain('aria-label="애월읍 조건 끄기"');
  });
});
