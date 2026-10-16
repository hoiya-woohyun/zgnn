import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TPlaceRow } from '../lib/adminCandidates';
import type { TReportRow } from '../lib/adminReports';
import { AdminPagePlaceList } from './adminPagePlaceList';
import { AdminPagePlaceReports } from './adminPagePlaceReports';
import { AdminPagePlaceRow } from './adminPagePlaceRow';

const place = (patch: Partial<TPlaceRow> = {}): TPlaceRow => ({
  id: 'place-1',
  type: 'cafe',
  name: '두부식당',
  region_raw: '동쪽 (구좌읍)',
  features: '',
  pet_policy_text: '',
  pet_policy: null,
  review_url: null,
  naver_url: null,
  naver_place_id: null,
  lat: null,
  lng: null,
  address: null,
  category: null,
  stay_price_text: null,
  stay_amenities_text: null,
  sort: null,
  status: 'published',
  source: 'notion',
  archived_at: null,
  archive_note: null,
  ...patch,
});

const report = (patch: Partial<TReportRow> = {}): TReportRow => ({
  id: 'r1',
  place_id: 'place-1',
  kind: 'closed',
  note: '지난주에 가 보니 문을 닫았어요',
  app_build: 'abc1234',
  status: 'open',
  handled_note: null,
  handled_at: null,
  created_at: '2026-10-01T03:00:00.000Z',
  ...patch,
});

const noop = () => undefined;

function render(over: Partial<Parameters<typeof AdminPagePlaceList>[0]> = {}) {
  return renderToStaticMarkup(
    <AdminPagePlaceList
      mode="active"
      places={[place(), place({ id: 'place-2', name: '바당카페' })]}
      states={{}}
      patchState={noop}
      onChange={noop}
      onSetBlock={noop}
      reports={{ 'place-1': [report({ id: 'r2', kind: 'address', note: '주소가 바뀌었어요' }), report()] }}
      onHandleReports={noop}
      visited={{}}
      onApplyVisited={noop}
      onSavePlace={noop}
      onClearDone={noop}
      onPlanReread={() => Promise.reject(new Error('unused'))}
      onReread={() => Promise.reject(new Error('unused'))}
      {...over}
    />,
  );
}

describe('AdminPagePlaceList — 제보·제안을 한곳에(14 W261010.13)', () => {
  it('칩은 곳을 센다(제보 2건 · 1곳 → 1) — 제안이 있으면 같은 칩에 따로 적는다', () => {
    const html = render({ suggestionCount: 3 });
    expect(html).toContain('제보 있는 곳 1 · 제안 3');
  });

  it('제보도 제안도 없으면 칩이 없다 · 제안만 있어도 선다(켜야 제안이 보인다)', () => {
    expect(render({ reports: {} })).not.toContain('제보 있는 곳');
    expect(render({ reports: {}, suggestionCount: 2 })).toContain('제보 있는 곳 0 · 제안 2');
  });

  it('켜면 목록 위에 제안이 서고 제보 있는 곳만 남는다 — 끄면 제안은 안 그린다', () => {
    const on = render({ reportedOnly: true, reportedOnlyHeader: <p>제안 목록 자리</p> });
    expect(on).toContain('제안 목록 자리');
    expect(on).toContain('두부식당');
    expect(on).not.toContain('바당카페');
    const off = render({ reportedOnly: false, reportedOnlyHeader: <p>제안 목록 자리</p> });
    expect(off).not.toContain('제안 목록 자리');
    expect(off).toContain('바당카페');
  });

  it('켰는데 제보 있는 곳이 없으면 그렇게 말한다(제안만 있을 때)', () => {
    expect(render({ reports: {}, reportedOnly: true, suggestionCount: 1 })).toContain('열린 제보가 있는 곳은 없어요');
  });

  it('접힌 줄에 가장 최근 제보 한 줄 — 펼치지 않고 읽는다', () => {
    const html = render();
    // 최신순으로 받은 첫 줄(주소)이 미리보기다. 종류 짧은 이름 + 한 줄.
    expect(html).toContain('주소</span> · 주소가 바뀌었어요');
    expect(html).not.toContain('지난주에 가 보니');
  });
});

describe('AdminPagePlaceList — 결과·폼이 제자리에(14 W261010.28)', () => {
  it('내린 줄은 등록 완료 칸의 원래 자리에 결과 한 줄을 남긴다 — 줄 수에는 넣지 않는다', () => {
    const before = place({ id: 'place-0', name: '나무펜션' });
    const html = render({
      reports: {},
      places: [place({ name: '가람카페' }), { ...before, status: 'archived', archived_at: '2026-10-16T00:00:00.000Z' }, place({ id: 'place-2', name: '바당카페' })],
      states: { 'place-0': { done: '내렸어요 · 다음 빌드부터 사이트에서 사라져요', movedFrom: before } },
      onGoToOther: noop,
    });
    const at = (text: string) => html.indexOf(text);
    expect(at('나무펜션')).toBeGreaterThan(at('가람카페'));
    expect(at('나무펜션')).toBeLessThan(at('바당카페'));
    expect(html).toContain('내렸어요 · 다음 빌드부터 사이트에서 사라져요 · 등록 해제 칸으로 옮겼어요');
    expect(html).toContain('등록 해제 칸에서 보기');
    expect(html).toContain('2곳을 모두 봤어요');
    expect(html).toContain('전체 2');
  });

  it('옮긴 칸(등록 해제)에는 결과 한 줄이 아니라 줄 그대로 선다', () => {
    const before = place({ id: 'place-0', name: '나무펜션' });
    const html = render({
      mode: 'archived',
      reports: {},
      places: [{ ...before, status: 'archived', archived_at: '2026-10-16T00:00:00.000Z' }],
      states: { 'place-0': { done: '내렸어요', movedFrom: before } },
      onGoToOther: noop,
    });
    expect(html).not.toContain('칸으로 옮겼어요');
    expect(html).toContain('되살리기(게시중으로)');
  });

  it('펼친 줄에서 등록 해제를 누르면 사유 폼이 펼친 판보다 앞(줄 머리 바로 밑)에 선다', () => {
    const html = renderToStaticMarkup(
      <AdminPagePlaceRow
        place={place({ address: '제주시 구좌읍 어딘가 1' })}
        state={{ archiving: true }}
        expanded
        onToggle={noop}
        onStartArchive={noop}
        onCancelArchive={noop}
        onArchive={noop}
        onStartBlock={noop}
        onCancelBlock={noop}
        onSetBlock={noop}
        reports={[report()]}
        onHandleReports={noop}
        onArchiveFromReport={noop}
        onApplyVisited={noop}
        onRestore={noop}
        onStartEdit={noop}
        onCancelEdit={noop}
        onSave={noop}
        onPlanReread={() => Promise.reject(new Error('unused'))}
        onReread={() => Promise.reject(new Error('unused'))}
      />,
    );
    const form = html.indexOf('왜 등록 해제하나요?');
    expect(form).toBeGreaterThan(0);
    expect(form).toBeLessThan(html.indexOf('제주시 구좌읍 어딘가 1'));
    expect(form).toBeLessThan(html.indexOf('사용자 제보 1건'));
  });

  it('해제가 실패하면 오류는 폼 바로 밑 — 펼친 판 뒤가 아니다', () => {
    const html = renderToStaticMarkup(
      <AdminPagePlaceRow
        place={place({ address: '제주시 구좌읍 어딘가 1' })}
        state={{ archiving: true, error: '등록 해제하지 못했어요 — 테스트' }}
        expanded
        onToggle={noop}
        onStartArchive={noop}
        onCancelArchive={noop}
        onArchive={noop}
        onStartBlock={noop}
        onCancelBlock={noop}
        onSetBlock={noop}
        reports={[]}
        onHandleReports={noop}
        onArchiveFromReport={noop}
        onApplyVisited={noop}
        onRestore={noop}
        onStartEdit={noop}
        onCancelEdit={noop}
        onSave={noop}
        onPlanReread={() => Promise.reject(new Error('unused'))}
        onReread={() => Promise.reject(new Error('unused'))}
      />,
    );
    expect(html.split('등록 해제하지 못했어요 — 테스트').length - 1).toBe(1);
    expect(html.indexOf('등록 해제하지 못했어요 — 테스트')).toBeLessThan(html.indexOf('제주시 구좌읍 어딘가 1'));
  });
});

describe('AdminPagePlaceReports — 운영자 말(14 W261010.14)', () => {
  it('제보 줄에 커밋 해시를 글자로 내지 않는다 — 해시는 title 에만', () => {
    const html = renderToStaticMarkup(
      <AdminPagePlaceReports reports={[report({ app_build: 'dda522e' }), report({ id: 'r9', app_build: null })]} busy={false} canArchive onHandle={noop} onArchive={noop} />,
    );
    expect(html).not.toContain('배포 dda522e');
    expect(html).not.toContain('배포 ?');
    expect(html).toContain('title="앱 버전 dda522e"');
    expect(html).toMatch(/>[^<]*예전 사이트를 보고 보냄/);
  });
});
