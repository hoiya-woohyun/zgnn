import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { collectRequestKey, type TCollectRequest, type TCollectRequestsLoad } from '../lib/adminCollectRequest';
import type { TReportRow } from '../lib/adminReports';
import { AdminPageSuggestions } from './adminPageSuggestions';

const suggestion = (patch: Partial<TReportRow> = {}): TReportRow => ({
  id: 's1',
  place_id: null,
  kind: 'suggest',
  note: '카페 바당, 애월읍 — 테라스에 강아지 돼요',
  app_build: 'abc1234',
  status: 'open',
  handled_note: null,
  handled_at: null,
  created_at: '2026-10-01T03:00:00.000Z',
  ...patch,
});

const request = (patch: Partial<TCollectRequest> = {}): TCollectRequest => ({
  id: 'c1',
  query: '제주 카페 바당',
  name_key: collectRequestKey('카페 바당'),
  status: 'queued',
  requested_at: '2026-10-02T00:00:00.000Z',
  done_at: null,
  found: null,
  to_read: null,
  post_urls: [],
  ...patch,
});

const noop = () => undefined;
/** 버튼 글자 — 설명 문장에도 같은 말이 있어 버튼 칸으로 찾는다. */
const COLLECT_BUTTON = '>이 이름으로 수집</span>';
const render = (collect: TCollectRequestsLoad | undefined) =>
  renderToStaticMarkup(<AdminPageSuggestions suggestions={[suggestion()]} collect={collect} onCollect={noop} onClose={noop} />);

describe('AdminPageSuggestions — 이름으로 수집에 실행 수단(14 W261010.13)', () => {
  it('요청이 없으면 `이 이름으로 수집` — 검색어는 한 줄의 첫 구분자 앞 이름', () => {
    const html = render({ kind: 'ok', byName: {} });
    expect(html).toContain(COLLECT_BUTTON);
    // 네이버 버튼과 같은 이름(첫 구분자 앞)으로 찾는다.
    expect(html).toContain(encodeURIComponent('카페 바당'));
    expect(html).not.toContain(encodeURIComponent('애월읍'));
    expect(html).not.toContain('pnpm data collect');
  });

  it('대기 중이면 버튼 대신 요청 줄 — 검수 대기 카드와 같은 문장', () => {
    const html = render({ kind: 'ok', byName: { [collectRequestKey('카페 바당')]: request() } });
    expect(html).not.toContain(COLLECT_BUTTON);
    expect(html).toContain('&#x27;제주 카페 바당&#x27; 로 찾을 차례예요');
  });

  it('끝난 요청은 결과 줄과 함께 다시 누를 수 있다', () => {
    const done = request({ status: 'done', done_at: '2026-10-03T00:00:00.000Z', found: 0, to_read: 0 });
    const html = render({ kind: 'ok', byName: { [done.name_key]: done } });
    expect(html).toContain('추가 수집 · 찾은 글이 없어요');
    expect(html).toContain(COLLECT_BUTTON);
  });

  it('요청 목록을 못 읽었으면 버튼이 없다 · 표가 없으면 꺼진 버튼', () => {
    expect(render(undefined)).not.toContain(COLLECT_BUTTON);
    const off = render({ kind: 'unavailable' });
    expect(off).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*이 이름으로 수집/);
    expect(off).toContain('추가 수집 표가 아직 적용되지 않았어요');
  });
});
