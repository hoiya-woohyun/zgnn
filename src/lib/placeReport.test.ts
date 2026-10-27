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
  recentReportKinds,
  reportKey,
  reportPromiseText,
  REASON_NOTE_MAX,
  reportTraceText,
  suggestTraceText,
  unrecordReport,
  verdictReasonOfNote,
  VERDICT_REASON_LABEL,
  VERDICT_REASONS,
  visitedLateFailureText,
} from './placeReport';

describe('recentReportKinds · reportTraceText — 보낸 뒤 상세의 흔적', () => {
  const now = 1_000_000_000_000;
  const record = {
    [reportKey('p1', 'visited_ok')]: now - 60_000,
    [reportKey('p1', 'closed')]: now - REPORT_COOLDOWN_MS + 1,
    [reportKey('p1', 'policy')]: now - REPORT_COOLDOWN_MS,
    [reportKey('p2', 'address')]: now - 1,
  };

  it('이 장소의 하루 안 기록만, 종류 순서대로 — 하루가 찬 것과 다른 장소는 빠진다', () => {
    expect(recentReportKinds(record, 'p1', now)).toEqual(['closed', 'visited_ok']);
  });

  it('고를 때 본 말로 한 줄, 없으면 null', () => {
    expect(reportTraceText(['closed'])).toBe('알려 주셨어요 — ‘문을 닫았어요(폐업·휴업)’. 운영자가 확인할게요.');
    expect(reportTraceText([])).toBeNull();
  });

  it("'판정이 틀렸어요' 로 보낸 policy 는 고른 이유와 함께 그 창구의 말로 — 다른 종류는 그대로", () => {
    expect(reportTraceText(['policy'], 'denied')).toBe('알려 주셨어요 — ‘판정이 틀렸어요’(못 들어갔어요). 운영자가 확인할게요.');
    expect(reportTraceText(['closed', 'policy'], 'fee')).toContain('‘문을 닫았어요(폐업·휴업)’ · ‘판정이 틀렸어요’(요금이 달랐어요)');
    expect(reportTraceText(['policy'], null)).toBe('알려 주셨어요 — ‘반려동물 조건이 달라요’. 운영자가 확인할게요.');
    expect(reportTraceText(['closed'], 'denied')).not.toContain('판정이 틀렸어요');
  });

  it('보낸 행의 앞머리에서 이유를 되읽는다 — buildReport 의 거울', () => {
    for (const reason of VERDICT_REASONS) {
      const built = buildReport({ placeId: 'p1', kind: 'policy', note: reason === 'other' ? '메모' : '', reason });
      expect(built.ok && verdictReasonOfNote(built.row.note)).toBe(reason);
    }
    expect(verdictReasonOfNote('못 들어갔어요 · 10kg')).toBe('denied');
    expect(verdictReasonOfNote('9월에 닫음')).toBeNull();
    expect(verdictReasonOfNote(null)).toBeNull();
  });
});

describe('reportPromiseText', () => {
  it('장소 제안만 받는 시트는 "고친 내용" 이 아니라 "올라가요"', () => {
    expect(reportPromiseText(['suggest'])).toContain('확인되면 다음 업데이트에 올라가요');
    expect(reportPromiseText(['suggest'])).not.toContain('고친 내용');
  });

  it('고칠 것을 받는 시트는 그대로 "고친 내용"', () => {
    expect(reportPromiseText(['closed', 'policy'])).toContain('고친 내용은 다음 업데이트에 반영돼요');
  });
});

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

describe('buildReport · 판정 제보의 이유(14 W261019.16)', () => {
  it('고른 이유가 한 줄 앞머리로 붙는다 — 한 줄이 없으면 이유만', () => {
    expect(buildReport({ placeId: 'p1', kind: 'policy', reason: 'denied', note: ' 10kg 넘으면 안 된대요 ' })).toMatchObject({
      ok: true,
      row: { kind: 'policy', note: '못 들어갔어요 · 10kg 넘으면 안 된대요' },
    });
    expect(buildReport({ placeId: 'p1', kind: 'policy', reason: 'fee', note: '  ' })).toMatchObject({
      ok: true,
      row: { note: '요금이 달랐어요' },
    });
  });

  it("'그 밖에' 는 한 줄이 있어야 한다 — 없으면 빈 제보와 같다", () => {
    expect(buildReport({ placeId: 'p1', kind: 'policy', reason: 'other', note: ' ' }).ok).toBe(false);
    expect(buildReport({ placeId: 'p1', kind: 'policy', reason: 'other', note: '주차장만 돼요' })).toMatchObject({
      ok: true,
      row: { note: '그 밖에 달랐어요 · 주차장만 돼요' },
    });
  });

  it('한 줄 한도는 이유를 붙이기 전 글로 세고, 가장 긴 앞머리를 붙여도 표의 200자 안이다', () => {
    const longest = Math.max(...VERDICT_REASONS.map((reason) => [...`${VERDICT_REASON_LABEL[reason]} · `].length));
    expect(REASON_NOTE_MAX + longest).toBeLessThanOrEqual(200);
    for (const reason of VERDICT_REASONS) {
      const full = buildReport({ placeId: 'p1', kind: 'policy', reason, note: '가'.repeat(REASON_NOTE_MAX) });
      expect(full.ok && [...(full.row.note ?? '')].length).toBeLessThanOrEqual(200);
      expect(buildReport({ placeId: 'p1', kind: 'policy', reason, note: '가'.repeat(REASON_NOTE_MAX + 1) })).toEqual({
        ok: false,
        problem: `${REASON_NOTE_MAX}자까지 적을 수 있어요.`,
      });
    }
  });

  it('이유를 고르지 않는 시트는 그대로 200자', () => {
    expect(buildReport({ placeId: 'p1', kind: 'policy', note: '가'.repeat(200) })).toMatchObject({ ok: true, row: { note: '가'.repeat(200) } });
  });
});

describe('suggestTraceText — 장소 제안을 보낸 뒤 입구의 한 줄(14 W261019.16)', () => {
  it('보낸 이름을 옮긴다', () => {
    expect(suggestTraceText(' 카페 바당, 애월읍 ')).toBe('알려 주셨어요 — ‘카페 바당, 애월읍’. 확인되면 올라가요.');
  });

  it('긴 글은 앞 30자만', () => {
    expect(suggestTraceText('가'.repeat(31))).toBe(`알려 주셨어요 — ‘${'가'.repeat(30)}…’. 확인되면 올라가요.`);
    expect(suggestTraceText('가'.repeat(30))).toBe(`알려 주셨어요 — ‘${'가'.repeat(30)}’. 확인되면 올라가요.`);
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

describe('unrecordReport · visitedLateFailureText — 미뤄 보내는 그대로였어요(14 W261010.7g)', () => {
  const now = 1_000_000_000_000;

  it('되돌리면 그 장소·그 종류만 빠져 다시 보낼 수 있고 흔적도 사라진다', () => {
    const record = recordReport(recordReport({}, 'p1', 'closed', now), 'p1', 'visited_ok', now);
    const undone = unrecordReport(record, 'p1', 'visited_ok');
    expect(canReportNow(undone, 'p1', 'visited_ok', now + 1)).toBe(true);
    expect(recentReportKinds(undone, 'p1', now + 1)).toEqual(['closed']);
    expect(record[reportKey('p1', 'visited_ok')]).toBe(now);
  });

  it('없는 기록을 되돌려도 그대로', () => {
    const record = recordReport({}, 'p1', 'closed', now);
    expect(unrecordReport(record, 'p2', 'visited_ok')).toEqual(record);
  });

  it('늦은 실패는 무엇을 못 보냈는지부터 말한다 — 그때 다른 화면에 있을 수 있다', () => {
    expect(visitedLateFailureText('network')).toContain('그대로였어요');
    expect(visitedLateFailureText('offline')).toContain('그대로였어요');
    expect(visitedLateFailureText('unavailable')).toContain('그대로였어요');
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
