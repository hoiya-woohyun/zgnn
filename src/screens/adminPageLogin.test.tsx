import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminPageLogin, WRITE_BLOCKED_BY_EXPIRY } from './adminPageLogin';

describe('AdminPageLogin — 만료로 돌아온 안내(14 W261010.28)', () => {
  it('쓰기 전에 막힌 만료는 방금 누른 것이 안 됐다고 말한다', () => {
    expect(WRITE_BLOCKED_BY_EXPIRY).toContain('처리하지 않았어요');
    expect(WRITE_BLOCKED_BY_EXPIRY).toContain('아무것도 바뀌지 않았어요');
  });

  it('안내가 있으면 경고 색 · status — 처음 여는 화면의 회색 설명과 다르다', () => {
    const html = renderToStaticMarkup(<AdminPageLogin onSignedIn={() => undefined} notice={WRITE_BLOCKED_BY_EXPIRY} />);
    expect(html).toMatch(/<p role="status" class="[^"]*text-warning-primary[^"]*">로그인이 만료돼/);
    expect(html).not.toContain('검수는 운영자 계정으로만');
    const first = renderToStaticMarkup(<AdminPageLogin onSignedIn={() => undefined} />);
    expect(first).toContain('검수는 운영자 계정으로만');
    expect(first).not.toContain('role="status"');
  });
});
