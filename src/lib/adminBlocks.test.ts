import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  BLOCKS_UNAVAILABLE_TEXT,
  blockNoteLine,
  blockRowFor,
  blockUntil,
  defaultBlockFor,
  isBlocksUnavailable,
  rejectAndBlock,
  rejectOutcomeText,
} from './adminBlocks';
import type { TCandidateExtracted, TCandidateGroup, TCandidateRow } from './adminCandidates';

const extracted = (patch: Partial<TCandidateExtracted> = {}): TCandidateExtracted => ({
  name: '새로운 카페',
  type: 'cafe',
  regionRaw: '동쪽 (구좌읍)',
  address: null,
  petPolicyText: null,
  petPolicy: null,
  confidence: 0.8,
  ...patch,
});

const candidate = (patch: Partial<TCandidateRow> = {}): TCandidateRow => ({
  id: 'cand-1',
  post_url: 'https://blog.naver.com/x/1',
  extracted: extracted(),
  match_place_id: null,
  match_confidence: null,
  status: 'pending',
  reviewer_note: null,
  reviewed_at: null,
  created_at: '2026-09-28T00:00:00.000Z',
  blog_posts: null,
  places: null,
  ...patch,
});

const group = (rows: TCandidateRow[]): TCandidateGroup => ({
  key: `name:${rows[0].extracted.name}`,
  rows,
  lead: rows[0],
  tier: 'new',
  visited: true,
  hasPolicyText: false,
  confidence: 0.8,
  posts: [],
});

/** 쓰기를 순서대로 기록하는 가짜 클라이언트. `blocksError` 가 있으면 `place_blocks` insert 만 그 오류로 실패한다. */
function fakeClient(blocksError?: { code?: string; message: string }) {
  const calls: { table: string; op: string; payload: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          calls.push({ table, op: 'insert', payload });
          return Promise.resolve({ error: table === 'place_blocks' ? (blocksError ?? null) : null });
        },
        update(payload: Record<string, unknown>) {
          calls.push({ table, op: 'update', payload });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { calls, client };
}

describe('defaultBlockFor', () => {
  it('반려·등록 해제 사유의 기본 기간 표를 따른다', () => {
    expect(defaultBlockFor('동반 불가')).toBe('months3');
    expect(defaultBlockFor('제주 아님')).toBe('forever');
    expect(defaultBlockFor('폐업')).toBe('forever');
    expect(defaultBlockFor('업장 요청')).toBe('forever');
    expect(defaultBlockFor('동반 불가로 바뀜')).toBe('months3');
    for (const reason of ['목록글', '홍보·협찬', '중복', '정보 부족', '정보가 틀림', '기타']) {
      expect(defaultBlockFor(reason)).toBe('none');
    }
    expect(defaultBlockFor(null)).toBe('none');
  });
});

describe('blockUntil · blockRowFor', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');

  it('3개월은 3개월 뒤 시각, 영구는 null', () => {
    expect(blockUntil('months3', now)).toBe('2027-01-01T00:00:00.000Z');
    expect(blockUntil('forever', now)).toBeNull();
  });

  it('none 이면 행을 만들지 않는다 — place_blocks 에 아무것도 안 들어간다', () => {
    expect(blockRowFor(group([candidate()]), 'none', '목록글', undefined, now)).toBeNull();
  });

  it('이름 키·읍·면·후보 id 를 채운다(주소 토큰이 regionRaw 보다 먼저)', () => {
    const row = blockRowFor(
      group([candidate({ extracted: extracted({ nameKey: 'saeroun', address: '제주특별자치도 제주시 애월읍 어딘가 1' }) })]),
      'months3',
      '동반 불가',
      ' 메모 ',
      now,
    );
    expect(row).toMatchObject({
      name_key: 'saeroun',
      town: '애월읍',
      display_name: '새로운 카페',
      reason: '동반 불가',
      note: '메모',
      until: '2027-01-01T00:00:00.000Z',
      candidate_id: 'cand-1',
      place_id: null,
    });
  });

  it('주소가 없으면 regionRaw 의 읍·면, 둘 다 없으면 null', () => {
    expect(blockRowFor(group([candidate()]), 'forever', '폐업', undefined, now)?.town).toBe('구좌읍');
    const none = candidate({ extracted: extracted({ regionRaw: null }) });
    expect(blockRowFor(group([none]), 'forever', '폐업', undefined, now)?.town).toBeNull();
  });
});

describe('isBlocksUnavailable', () => {
  it('표가 없을 때의 오류만 미적용으로 읽는다', () => {
    expect(isBlocksUnavailable({ code: 'PGRST205', message: 'x' })).toBe(true);
    expect(isBlocksUnavailable({ message: "Could not find the table 'public.place_blocks' in the schema cache" })).toBe(true);
    expect(isBlocksUnavailable({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isBlocksUnavailable(null)).toBe(false);
  });
});

describe('rejectAndBlock', () => {
  it('반려가 먼저, 블랙리스트가 나중이고 기록 한 줄이 이어 붙는다', async () => {
    const { calls, client } = fakeClient();
    const outcome = await rejectAndBlock(client, group([candidate()]), '폐업', undefined, 'forever');
    expect(outcome).toEqual({ blocked: 'forever' });
    expect(calls.map((call) => `${call.table}:${call.op}`)).toEqual(['candidates:update', 'place_blocks:insert', 'candidates:update']);
    expect(calls[2].payload.reviewer_note).toBe(`[admin] 폐업\n${blockNoteLine('forever')}`);
  });

  it('none 이면 반려만 쓰고 place_blocks 는 건드리지 않는다', async () => {
    const { calls, client } = fakeClient();
    const outcome = await rejectAndBlock(client, group([candidate()]), '목록글', undefined, 'none');
    expect(outcome).toEqual({ blocked: 'none' });
    expect(calls.map((call) => call.table)).toEqual(['candidates']);
  });

  it('표가 없으면 던지지 않고 미적용으로 돌려준다 — 반려는 이미 됐다', async () => {
    const { calls, client } = fakeClient({ code: 'PGRST205', message: 'not found' });
    const outcome = await rejectAndBlock(client, group([candidate()]), '폐업', undefined, 'forever');
    expect(outcome).toEqual({ blocked: 'none', blockError: BLOCKS_UNAVAILABLE_TEXT });
    expect(calls.map((call) => `${call.table}:${call.op}`)).toEqual(['candidates:update', 'place_blocks:insert']);
    expect(rejectOutcomeText('폐업', outcome)).toContain('블랙리스트에는 안 들어갔어요');
  });
});
