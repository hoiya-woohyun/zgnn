import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GroupList } from './groupList';
import { GroupListRow } from './groupListRow';

describe('GroupList', () => {
  it('면은 한 장 — 행 사이는 구분선이고 행마다 카드 테두리를 두르지 않는다', () => {
    const html = renderToStaticMarkup(
      <GroupList>
        <GroupListRow title="가" />
        <GroupListRow title="나" />
      </GroupList>,
    );
    expect(html.match(/border-secondary/g)).toHaveLength(1);
    expect(html).toContain('divide-y');
  });
});

describe('GroupListRow', () => {
  it('부제가 있으면 두 줄 행(64), 없으면 한 줄 행(48)', () => {
    expect(renderToStaticMarkup(<GroupListRow title="가" subtitle="설명" />)).toContain('min-h-16');
    expect(renderToStaticMarkup(<GroupListRow title="가" />)).toContain('min-h-12');
  });

  it('href 는 링크 + ›, externalHref 는 새 탭 + ↗', () => {
    const inner = renderToStaticMarkup(<GroupListRow title="가" href="/saved" />);
    expect(inner).toContain('href="/saved"');
    expect(inner).not.toContain('target=');
    const outer = renderToStaticMarkup(<GroupListRow title="나" externalHref="https://example.com" />);
    expect(outer).toContain('target="_blank"');
    expect(outer).toContain('rel="noreferrer"');
  });

  it('inactive 버튼은 aria-disabled + 회색 글자, danger 는 경고색', () => {
    const off = renderToStaticMarkup(<GroupListRow title="비우기" tone="danger" inactive onPress={() => undefined} />);
    expect(off).toContain('aria-disabled="true"');
    expect(off).toContain('text-quaternary');
    expect(off).not.toContain('text-error-primary');
    const on = renderToStaticMarkup(<GroupListRow title="비우기" tone="danger" onPress={() => undefined} />);
    expect(on).toContain('text-error-primary');
    expect(on).not.toContain('aria-disabled');
  });
});
