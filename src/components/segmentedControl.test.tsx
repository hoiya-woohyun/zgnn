import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './segmentedControl';

const OPTIONS = [
  { value: 'all', label: '전부' },
  { value: 'noHard', label: '어려운 곳 빼고' },
  { value: 'reachable', label: '갈 수 있는 곳만' },
] as const;

const render = (value: (typeof OPTIONS)[number]['value']) =>
  renderToStaticMarkup(<SegmentedControl label="두부 기준" options={OPTIONS} value={value} onChange={() => undefined} />);

describe('SegmentedControl', () => {
  it('라디오 묶음이다 — 칸마다 라디오 하나, 고른 칸만 checked', () => {
    const html = render('noHard');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="두부 기준"');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toMatch(/value="noHard"[^>]*checked=""|checked=""[^>]*value="noHard"/);
  });

  it('손잡이는 칸 하나 폭이고 고른 칸 자리로 옮긴다(translateX(i×100%))', () => {
    expect(render('all')).toContain('translateX(0%)');
    expect(render('reachable')).toContain('translateX(200%)');
    expect(render('all')).toContain('calc((100% - var(--spacing) * 2) / 3)');
  });

  it('트랙 44px · 칸은 before 로 44px 를 누른다 · 고른 칸만 600', () => {
    const html = render('reachable');
    expect(html).toContain('h-11');
    expect(html).toContain('before:-inset-y-1');
    expect(html.match(/font-semibold/g)).toHaveLength(1);
  });
});
