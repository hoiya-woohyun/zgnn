import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TCandidateGroup, TCandidateRow } from '../lib/adminCandidates';
import { AdminPageGroupActions } from './adminPageGroupActions';
import { AdminPageGroupCardActionBar } from './adminPageGroupCardActionBar';

const noop = () => {};
const row = (over: Partial<TCandidateRow> = {}): TCandidateRow => ({
  id: 'a',
  post_url: 'https://blog/a',
  extracted: { name: '바당카페', type: 'cafe', regionRaw: '서쪽 (애월읍)', address: '제주 제주시 애월읍 1' },
  match_place_id: null,
  match_confidence: null,
  status: 'pending',
  reviewer_note: null,
  reviewed_at: null,
  created_at: '',
  blog_posts: null,
  places: null,
  ...over,
}) as TCandidateRow;
const group = (r: TCandidateRow, tier: TCandidateGroup['tier'] = 'new') =>
  ({ key: 'g', kind: 'new', tier, lead: r, rows: [r], posts: [r.post_url] }) as unknown as TCandidateGroup;

/** 버튼마다 글자와 주 버튼(핑크 `bg-brand-solid`)인지. 문서 순서 그대로다. */
const buttons = (html: string) =>
  [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)].map(([, cls, inner]) => ({
    text: inner.replace(/<[^>]+>/g, '').trim(),
    primary: cls.includes('bg-brand-solid'),
  }));

const render = (needsLook: boolean, r = row()) =>
  renderToStaticMarkup(
    <AdminPageGroupActions
      group={group(r, r.match_place_id ? 'ask' : 'new')}
      state={{}}
      regionOk
      addressPick={null}
      needsLook={needsLook}
      latest={null}
      latestAvailable={false}
      overwritePick={[]}
      proposal={null}
      onToggleOverwrite={noop}
      onApprove={noop}
      onStartReject={noop}
      onCancelReject={noop}
      onReject={noop}
      onConfirmSite={noop}
      onPickRegion={noop}
      onSaveRegion={noop}
      onChooseAddress={noop}
      onStartReanalyze={noop}
      onCancelReanalyze={noop}
      onReanalyze={noop}
    />,
  );

describe('AdminPageGroupActions — 첫 칸은 어느 갈래에서나 올리기다(14 W261010.28 · manager-18)', () => {
  it('평범한 후보: 첫 버튼이 핑크 등록하기, 제외는 아랫줄 회색', () => {
    const list = buttons(render(false));
    expect(list[0]).toEqual({ text: '등록하기', primary: true });
    expect(list.find((button) => button.text === '제외')?.primary).toBe(false);
  });

  it('근거 없음: 첫 칸은 그대로 등록하기(흰 버튼) — 핑크는 아랫줄의 제외로 간다', () => {
    const list = buttons(render(true));
    expect(list[0]).toEqual({ text: '등록하기', primary: false });
    expect(list.filter((button) => button.primary).map((button) => button.text)).toEqual(['제외']);
    // 제외는 한 번만 선다 — 예전에는 첫 칸으로 끌어올리고 아랫줄에서 뺐다
    expect(list.filter((button) => button.text === '제외')).toHaveLength(1);
  });

  it("근거 없음 + '확인' 짝도 같은 자리 — 첫 칸은 같은 곳이에요(흰 버튼)", () => {
    const list = buttons(render(true, row({ match_place_id: 'p1' })));
    expect(list[0]).toEqual({ text: '같은 곳이에요 — 빈 칸만 채우기', primary: false });
    expect(list.filter((button) => button.primary).map((button) => button.text)).toEqual(['제외']);
  });
});

describe('AdminPageGroupCardActionBar — 바닥에 붙는 줄', () => {
  it('`fixed` 가 아니라 `sticky bottom-0` 이다(CLAUDE.md — `<main>` 안의 fixed 는 스와이프 중에 어긋난다)', () => {
    const html = renderToStaticMarkup(
      <AdminPageGroupCardActionBar
        name="바당카페"
        quick={{ kind: 'approve', approve: { label: '등록하기', unsure: false } }}
        state={{}}
        rejectPrimary={false}
        decisionRef={{ current: null }}
        onApprove={noop}
        onReject={noop}
        onJump={noop}
        onCollapse={noop}
      />,
    );
    expect(html).toContain('sticky');
    expect(html).toContain('bottom-0');
    expect(html).not.toMatch(/\bfixed\b/);
    // 결정 줄을 아직 못 쟀으면(서버·첫 그림) 접기만 — 결정 줄과 같은 올리기를 두 번 그리지 않는다
    expect(buttons(html).map((button) => button.text)).toEqual(['여기까지 · 접기']);
  });
});
