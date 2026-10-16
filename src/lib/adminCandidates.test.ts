import { describe, expect, it } from 'vitest';
import {
  fetchPendingCandidates,
  groupApproveAction,
  groupQuickAction,
  REGION_OPTIONS,
  regionOptionsFor,
  updateGroupsByPlace,
} from './adminCandidates';

describe('regionOptionsFor — 주소의 읍·면을 맨 위로', () => {
  it('주소의 읍·면 선택지를 위로 올리고 나머지는 그대로 둔다', () => {
    const { town, suggested, rest } = regionOptionsFor('제주 서귀포시 안덕면 난드르로 41');
    expect(town).toBe('안덕면');
    expect(suggested).toEqual(['남쪽 (안덕면)']);
    expect([...suggested, ...rest].sort()).toEqual([...REGION_OPTIONS].sort());
  });

  it('읍·면이 없거나(시내) 주소가 없으면 목록 그대로다', () => {
    expect(regionOptionsFor('제주 제주시 노형2길 51-3')).toEqual({ town: null, suggested: [], rest: REGION_OPTIONS, preset: null });
    expect(regionOptionsFor(null)).toEqual({ town: null, suggested: [], rest: REGION_OPTIONS, preset: null });
  });

  it('이름의 지점 꼬리로 정한 지역을 미리 고른다 — "이춘옥고등어쌈밥 월정리점" 은 구좌읍(2026-10-04)', () => {
    const choices = regionOptionsFor(null, '이춘옥고등어쌈밥 월정리점');
    expect(choices.preset).toBe('동쪽 (구좌읍)');
    expect(choices.suggested).toEqual(['동쪽 (구좌읍)']);
    expect([...choices.suggested, ...choices.rest].sort()).toEqual([...REGION_OPTIONS].sort());
    // 주소의 읍·면과 갈리면 주소가 이긴다 — 미리 고르지 않는다
    expect(regionOptionsFor('제주 제주시 애월읍 애월해안로 1', '이춘옥고등어쌈밥 월정리점').preset).toBeNull();
    // 이름 앞의 지명은 안 본다
    expect(regionOptionsFor(null, '함덕해물라면').preset).toBeNull();
  });
});

describe('REGION_OPTIONS — 읍·면 하나당 정본 표기 한 줄(2026-10-04)', () => {
  it('안덕면은 남쪽 하나 · 서귀포는 서귀포시 하나 · 거리 이름이 붙은 표기는 없다', () => {
    expect(REGION_OPTIONS).toContain('남쪽 (안덕면)');
    expect(REGION_OPTIONS).not.toContain('서쪽 (안덕면)');
    expect(REGION_OPTIONS).toContain('남쪽 (서귀포시)');
    expect(REGION_OPTIONS).not.toContain('남쪽 (서귀포)');
    expect(REGION_OPTIONS.some((option) => /\(\S+ \S+\)/.test(option))).toBe(false);
  });
  it('같은 읍·면이 두 번 서지 않는다', () => {
    const towns = REGION_OPTIONS.map((option) => option.replace(/^.*\(|\)$/g, ''));
    expect(new Set(towns).size).toBe(towns.length);
  });
});

describe('updateGroupsByPlace — 등록 완료 줄의 검수 대기에 갱신 N(11 T3.2)', () => {
  it('갱신 묶음만 짝 장소로 센다', () => {
    const g = (kind: string, id: string | null) => ({ kind, lead: { match_place_id: id } }) as never;
    expect(updateGroupsByPlace([g('update', 'p1'), g('update', 'p1'), g('fill', 'p2'), g('update', null)])).toEqual({ p1: 2 });
  });
});

describe('fetchPendingCandidates — 검수 대기를 끝까지 읽는다(06 #16)', () => {
  /** PostgREST 처럼 한 번에 1,000행까지만 주는 가짜 — `.limit(1000)` 이던 때는 첫 페이지에서 멈췄다. */
  const fakeClient = (total: number) => {
    const calls: { order: string; from: number; to: number }[] = [];
    const rows = Array.from({ length: total }, (_, i) => ({ id: String(i).padStart(5, '0') }));
    const ordered = (order: string) => ({
      range: (from: number, to: number) => {
        calls.push({ order, from, to });
        return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
      },
    });
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: ordered }) }) }) };
    return { client: client as unknown as Parameters<typeof fetchPendingCandidates>[0], calls };
  };

  it('1,000행을 넘어도 다 받고, 페이지는 id 순서로 넘긴다', async () => {
    const { client, calls } = fakeClient(3013);
    const rows = await fetchPendingCandidates(client);
    expect(rows).toHaveLength(3013);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3013);
    expect(calls.map((call) => call.from)).toEqual([0, 1000, 2000, 3000, 3013]);
    expect(calls.every((call) => call.order === 'id')).toBe(true);
  });
});

describe('groupQuickAction — 펼친 줄에 붙는 동작 줄의 주 칸(14 W261010.11)', () => {
  /** 평범한 신규 후보 — 결정 줄에서도 버튼 하나로 끝난다. */
  const base = {
    archived: false,
    similar: false,
    addressPick: false,
    regionOk: true,
    needsLook: false,
    hasTable: false,
    tier: 'new' as const,
    pairId: null,
    matchedArchived: false,
  };

  it('버튼 하나로 끝나는 갈래만 바로 올린다 — 이름·짝은 결정 줄과 같은 함수에서', () => {
    expect(groupQuickAction(base)).toEqual({ kind: 'approve', approve: { label: '등록하기', unsure: false } });
    expect(groupQuickAction({ ...base, tier: 'auto', pairId: 'p1' })).toEqual({
      kind: 'approve',
      approve: { label: '빈 칸만 채우기', unsure: false },
    });
    // '확인' 짝은 짝 id 를 싣는다 — 안 실으면 다른 줄의 승인이 바꾼 캐시로 다른 곳에 합쳐진다
    const unsure = { kind: 'approve', approve: { label: '같은 곳이에요 — 빈 칸만 채우기', unsure: true, mergeInto: 'p1' } };
    expect(groupQuickAction({ ...base, tier: 'ask', pairId: 'p1' })).toEqual(unsure);
    // 표가 서도 '확인' 짝의 승인은 남는다(결정 줄의 `unsure`)
    expect(groupQuickAction({ ...base, tier: 'ask', pairId: 'p1', hasTable: true })).toEqual(unsure);
  });

  it('결정 줄이 먼저 말하는 갈래는 내려가기다', () => {
    const jump = (patch: Partial<Parameters<typeof groupQuickAction>[0]>) => groupQuickAction({ ...base, ...patch }).kind;
    expect(jump({ archived: true })).toBe('jump');
    expect(jump({ similar: true })).toBe('jump');
    expect(jump({ addressPick: true })).toBe('jump');
    expect(jump({ regionOk: false })).toBe('jump');
    expect(jump({ tier: 'auto', pairId: 'p1', hasTable: true })).toBe('jump');
    expect(jump({ rejecting: true })).toBe('jump');
    expect(jump({ reanalyzing: true })).toBe('jump');
  });

  it('근거 없음은 바로 올리지 않는다 — 결정 줄의 확인을 비켜 가는 문이 되지 않게(W261010.28)', () => {
    expect(groupQuickAction({ ...base, needsLook: true })).toEqual({ kind: 'jump', label: '근거 없음 — 결정 보기' });
    expect(groupQuickAction({ ...base, needsLook: true, tier: 'ask', pairId: 'p1' }).kind).toBe('jump');
  });

  it('짝이 내린 곳이면 \'확인\' 이 아니다 — 누르면 되살릴지 묻는 갈래로 간다', () => {
    expect(groupApproveAction({ tier: 'ask', pairId: 'p1', matchedArchived: true })).toEqual({ label: '빈 칸만 채우기', unsure: false });
  });
});
