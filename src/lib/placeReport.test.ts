import { describe, expect, it } from 'vitest';
import {
  buildReport,
  canReportNow,
  parseReportRecord,
  PICKABLE_REPORT_KINDS,
  recordReport,
  REPORT_COOLDOWN_MS,
  REPORT_KIND_LABEL,
  REPORT_KINDS,
  reportKey,
} from './placeReport';

describe('buildReport', () => {
  it('장소·종류·한 줄·배포를 싣는다 — 한 줄은 공백을 걷고 비면 null', () => {
    expect(buildReport({ placeId: 'p1', kind: 'closed', note: '  9월에 닫음 ', build: 'abc1234' })).toEqual({
      ok: true,
      row: { place_id: 'p1', kind: 'closed', note: '9월에 닫음', app_build: 'abc1234' },
    });
    expect(buildReport({ placeId: 'p1', kind: 'visited_ok', note: '   ' })).toEqual({
      ok: true,
      row: { place_id: 'p1', kind: 'visited_ok', note: null, app_build: 'dev' },
    });
  });

  it('200자를 넘으면 자르지 않고 막는다(글자 단위)', () => {
    expect(buildReport({ placeId: 'p1', kind: 'other', note: '가'.repeat(200) }).ok).toBe(true);
    expect(buildReport({ placeId: 'p1', kind: 'other', note: '가'.repeat(201) }).ok).toBe(false);
  });

  it('제안은 장소 없이, 이름이 있어야 한다', () => {
    expect(buildReport({ placeId: 'p1', kind: 'suggest', note: '카페 바당' })).toMatchObject({
      ok: true,
      row: { place_id: null, note: '카페 바당' },
    });
    expect(buildReport({ placeId: null, kind: 'suggest', note: ' ' }).ok).toBe(false);
  });

  it('제안이 아니면 장소가 있어야 한다', () => {
    expect(buildReport({ placeId: null, kind: 'address' }).ok).toBe(false);
  });

  it('모르는 종류는 막는다', () => {
    expect(buildReport({ placeId: 'p1', kind: 'nope' as never }).ok).toBe(false);
  });

  it('배포 식별자는 40자까지', () => {
    const result = buildReport({ placeId: 'p1', kind: 'other', build: 'x'.repeat(60) });
    expect(result.ok && result.row.app_build.length).toBe(40);
  });
});

describe('canReportNow · recordReport', () => {
  const now = 1_000_000_000_000;

  it('같은 장소·같은 종류는 하루 한 번', () => {
    const record = recordReport({}, 'p1', 'closed', now);
    expect(canReportNow(record, 'p1', 'closed', now + 1000)).toBe(false);
    expect(canReportNow(record, 'p1', 'address', now + 1000)).toBe(true);
    expect(canReportNow(record, 'p2', 'closed', now + 1000)).toBe(true);
    expect(canReportNow(record, 'p1', 'closed', now + REPORT_COOLDOWN_MS)).toBe(true);
  });

  it('제안은 한도가 없다', () => {
    const record = recordReport({}, null, 'suggest', now);
    expect(canReportNow(record, null, 'suggest', now + 1)).toBe(true);
  });

  it('하루 지난 기록은 버린다', () => {
    const old = { [reportKey('p0', 'closed')]: now - REPORT_COOLDOWN_MS - 1 };
    expect(Object.keys(recordReport(old, 'p1', 'closed', now))).toEqual([reportKey('p1', 'closed')]);
  });
});

describe('parseReportRecord', () => {
  it('깨진 값·모양이 틀린 값은 빈 기록', () => {
    expect(parseReportRecord(null)).toEqual({});
    expect(parseReportRecord('{')).toEqual({});
    expect(parseReportRecord('[1]')).toEqual({});
    expect(parseReportRecord('{"a":"x","b":3}')).toEqual({ b: 3 });
  });
});

describe('목록', () => {
  it('고를 수 있는 종류는 전부 표의 종류이고, 전화는 번호가 생기기 전까지 빠진다', () => {
    for (const kind of PICKABLE_REPORT_KINDS) expect(REPORT_KINDS).toContain(kind);
    expect(PICKABLE_REPORT_KINDS).not.toContain('phone');
    for (const kind of REPORT_KINDS) expect(REPORT_KIND_LABEL[kind]).toBeTruthy();
  });

  it('표의 CHECK 와 같은 목록이다', async () => {
    const { readFile } = await import('node:fs/promises');
    const sql = await readFile(new URL('../../supabase/migrations/20261001130000_place_reports.sql', import.meta.url), 'utf8');
    const listed = /kind in \(([^)]+)\)/.exec(sql)?.[1].match(/'([a-z_]+)'/g)?.map((v) => v.slice(1, -1));
    expect(listed).toEqual([...REPORT_KINDS]);
  });
});
