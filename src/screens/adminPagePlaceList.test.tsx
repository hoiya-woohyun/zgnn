import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TPlaceRow } from '../lib/adminCandidates';
import type { TReportRow } from '../lib/adminReports';
import { AdminPagePlaceList } from './adminPagePlaceList';

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
