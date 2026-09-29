import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { approveGroup, rejectGroup, setRegion } from './adminApply';
import type { TCandidateExtracted, TCandidateGroup, TCandidateRow, TPlaceRow } from './adminCandidates';

/*
 * 가짜 클라이언트 — supabase-js 의 체이너블 빌더 흉내만 낸다.
 *
 * 여기서 검사하고 싶은 것은 값이 아니라 **순서**다. PostgREST 에 트랜잭션이 없어서, 이 파일이 지키는 계약은
 * "무엇을 쓰는가" 보다 "어느 순서로 쓰는가" 에 있다 — 신규 장소를 넣은 뒤 후보에 짝을 **먼저** 적어야
 * 중간에 죽은 재시도가 장소를 두 개 만들지 않는다(apply-approved.mjs:5-8).
 * 그래서 모든 호출을 순서대로 기록하고, 테스트는 그 배열을 읽는다.
 */
type TFakeCall = {
  table: string;
  op: 'update' | 'insert' | 'upsert';
  payload: Record<string, unknown>;
  filter?: Record<string, unknown>;
  options?: unknown;
};

function createFakeClient() {
  const calls: TFakeCall[] = [];

  const chainFor = (call: TFakeCall) => {
    const chain = {
      eq(column: string, value: unknown) {
        call.filter = { ...(call.filter ?? {}), [column]: value };
        return chain;
      },
      then<TFulfilled, TRejected = never>(
        onFulfilled?: ((value: { data: null; error: null }) => TFulfilled | PromiseLike<TFulfilled>) | null,
        onRejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
      ) {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  const record = (call: TFakeCall) => {
    calls.push(call);
    return chainFor(call);
  };

  const client = {
    from(table: string) {
      return {
        update: (payload: Record<string, unknown>) => record({ table, op: 'update', payload }),
        insert: (payload: Record<string, unknown>) => record({ table, op: 'insert', payload }),
        upsert: (payload: Record<string, unknown>, options?: unknown) =>
          record({ table, op: 'upsert', payload, options }),
      };
    },
  };

  return { calls, client: client as unknown as SupabaseClient };
}

/** 한 줄 요약(`테이블.동작:상태`)으로 순서를 읽기 쉽게. */
const trace = (calls: TFakeCall[]) =>
  calls.map((call) => {
    const keys = Object.keys(call.payload);
    const label = typeof call.payload.status === 'string' ? String(call.payload.status) : keys.join('+');
    return `${call.table}.${call.op}:${label}`;
  });

const extracted = (patch: Partial<TCandidateExtracted> = {}): TCandidateExtracted => ({
  name: '새로운카페',
  type: 'cafe',
  regionRaw: '동쪽 (구좌읍)',
  address: null,
  petPolicyText: null,
  petPolicy: null,
  confidence: 0.8,
  match: { confidence: 0, reason: '이름이 맞는 기존 장소 없음', tier: 'new' },
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
  tier: rows[0].extracted.match?.tier ?? 'new',
  visited: true,
  hasPolicyText: rows.some((row) => Boolean(row.extracted.petPolicyText)),
  confidence: 0.8,
  posts: rows.map((row) => row.post_url).filter((url): url is string => Boolean(url)),
});

const placeRow = (patch: Partial<TPlaceRow> = {}): TPlaceRow => ({
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
  ...patch,
});

const OPTIONS = { nowIso: '2026-09-29T01:00:00.000Z', newId: () => 'new-place-id' };

describe('approveGroup — 신규 장소', () => {
  it('published 로 넣고, 짝을 먼저 적은 뒤 출처·merged 순서로 쓴다', async () => {
    const { calls, client } = createFakeClient();
    const places = [placeRow()];
    const lead = candidate();

    const outcome = await approveGroup(client, group([lead]), places, OPTIONS);

    expect(outcome).toEqual({
      kind: 'created',
      placeId: 'new-place-id',
      placeName: '새로운카페',
      patchKeys: [],
      rows: 1,
    });

    // 순서가 계약이다 — insert 다음이 곧바로 짝 적기여야 한다.
    expect(trace(calls)).toEqual([
      'candidates.update:approved',
      'places.insert:published',
      'candidates.update:match_place_id',
      'place_sources.upsert:place_id+post_url',
      'candidates.update:merged',
    ]);

    const inserted = calls[1].payload;
    expect(inserted.id).toBe('new-place-id');
    // 승인 즉시 사용자에게 보여야 하므로 draft 를 거치지 않는다(ADR-018). source 는 블로그 경로 표시.
    expect(inserted.status).toBe('published');
    expect(inserted.source).toBe('blog');
    expect(inserted.name).toBe('새로운카페');
    expect(inserted.region_raw).toBe('동쪽 (구좌읍)');

    expect(calls[2].payload).toEqual({ match_place_id: 'new-place-id' });
    expect(calls[2].filter).toEqual({ id: 'cand-1' });
    expect(calls[3].payload).toEqual({ place_id: 'new-place-id', post_url: 'https://blog.naver.com/x/1' });
    expect(calls[3].options).toEqual({ onConflict: 'place_id,post_url', ignoreDuplicates: true });

    const merged = calls[4].payload.extracted as TCandidateExtracted;
    expect(merged.applied).toEqual({
      placeId: 'new-place-id',
      kind: 'created',
      patchKeys: [],
      at: '2026-09-29T01:00:00.000Z',
    });

    // 호출자의 캐시에도 들어가야 다음 묶음의 재대조가 이 장소를 본다.
    expect(places.map((place) => place.id)).toEqual(['place-1', 'new-place-id']);
  });

  it('첫 승인 메모는 기존 메모를 덮지 않는다', async () => {
    const { calls, client } = createFakeClient();
    const lead = candidate({ reviewer_note: '[data:review] 확인 필요' });

    await approveGroup(client, group([lead]), [placeRow()], OPTIONS);

    expect(calls[0].payload.reviewer_note).toBe('[data:review] 확인 필요\n[admin] 승인');
  });
});

describe('approveGroup — 기존 장소에 보강', () => {
  it('짝이 있는 후보는 빈 칸만 채운다 — 사람이 쓴 칸은 건드리지 않는다', async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({
      id: 'place-9',
      name: '살레',
      pet_policy_text: '사람이 쓴 조건',
      review_url: 'https://old.example/1',
      status: 'published',
    });
    const lead = candidate({
      match_place_id: 'place-9',
      extracted: extracted({
        name: '살레',
        address: '제주시 애월읍 1',
        features: '뷰가 좋아요',
        petPolicyText: '블로그가 말한 조건',
        category: '카페',
        match: { confidence: 0.9, reason: '이름 일치', tier: 'auto' },
      }),
    });

    const outcome = await approveGroup(client, group([lead]), [target], OPTIONS);

    expect(outcome).toEqual({
      kind: 'merged',
      placeId: 'place-9',
      placeName: '살레',
      patchKeys: ['address', 'features', 'category'],
      rows: 1,
    });
    // pet_policy_text·review_url 은 이미 차 있어 패치에 없다. region_raw 도 차 있다.
    expect(calls[1].payload).toEqual({ address: '제주시 애월읍 1', features: '뷰가 좋아요', category: '카페' });
    expect(calls[1].filter).toEqual({ id: 'place-9' });
    expect(trace(calls)).toEqual([
      'candidates.update:approved',
      'places.update:address+features+category',
      'place_sources.upsert:place_id+post_url',
      'candidates.update:merged',
    ]);
  });

  it('CLI 가 만들어 둔 draft 대상은 같은 update 에서 published 로 올린다', async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-draft', name: '살레', status: 'draft' });
    const lead = candidate({ match_place_id: 'place-draft', extracted: extracted({ name: '살레' }) });

    const outcome = await approveGroup(client, group([lead]), [target], OPTIONS);

    expect(calls[1].payload.status).toBe('published');
    expect(outcome).toMatchObject({ kind: 'merged', patchKeys: expect.arrayContaining(['status']) });
  });

  /*
   * 실제로 이 화면에서 나는 갈래다 — `fetchActivePlaces` 가 archived 를 빼고 읽으므로, 문 닫은 곳에 짝이 붙은 후보는
   * "목록에 없는 짝" 으로 온다(아래 archived 테스트는 호출자가 archived 행을 넘긴 계약 검사다).
   * 그래서 문구가 "새로고침" 을 권하면 안 된다 — 다시 읽어도 같은 질의라 그 행은 또 없다.
   */
  it('짝이 목록에 없으면 새로고침을 권하지 않고 나갈 길을 말한다', async () => {
    const { calls, client } = createFakeClient();
    const lead = candidate({ match_place_id: 'place-gone', extracted: extracted({ name: '사라진카페' }) });

    const outcome = await approveGroup(client, group([lead]), [placeRow({ id: 'place-1' })], OPTIONS);

    expect(outcome.kind).toBe('blocked');
    expect(outcome).toMatchObject({ reason: expect.stringContaining('새 장소로 올리기') });
    expect(outcome).toMatchObject({ reason: expect.not.stringContaining('새로고침') });
    expect(calls).toHaveLength(0);
  });

  it('문 닫은 곳(archived)에는 합치지 않고, 아무것도 쓰지 않는다', async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-x', name: '옛가게', status: 'archived' });
    const lead = candidate({ match_place_id: 'place-x', extracted: extracted({ name: '옛가게' }) });

    const outcome = await approveGroup(client, group([lead]), [target], OPTIONS);

    expect(outcome).toEqual({ kind: 'blocked', reason: '옛가게 은 문 닫은 곳으로 표시돼 있어요 — 여기에는 합치지 않아요.' });
    expect(calls).toHaveLength(0);
  });
});

describe('approveGroup — 신규 후보 재대조', () => {
  const jejuGeo = { lat: 33.5, lng: 126.7 };

  it("'신규' 인데 이미 있는 가게와 이름·좌표가 맞으면 자동으로 합친다", async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-near', name: '두부식당', type: 'restaurant', lat: 33.50045, lng: 126.7 });
    const lead = candidate({
      extracted: extracted({ name: '두부식당', type: 'restaurant', geo: jejuGeo, address: '제주시 구좌읍 2' }),
    });

    const outcome = await approveGroup(client, group([lead]), [target], OPTIONS);

    expect(outcome).toMatchObject({ kind: 'merged', placeId: 'place-near' });
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
  });

  it('0.4~0.85 구간은 사람에게 묻는다 — 이때 DB 에는 아무것도 쓰지 않는다', async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-annex', name: '평대반점 별관', type: 'restaurant' });
    const lead = candidate({ extracted: extracted({ name: '평대반점', type: 'restaurant' }) });

    const outcome = await approveGroup(client, group([lead]), [target], OPTIONS);

    expect(outcome.kind).toBe('needsDecision');
    if (outcome.kind !== 'needsDecision') throw new Error('needsDecision 이 아니다');
    expect(outcome.similar.id).toBe('place-annex');
    expect(outcome.similar.name).toBe('평대반점 별관');
    expect(outcome.similar.confidence).toBeGreaterThanOrEqual(0.4);
    expect(outcome.similar.confidence).toBeLessThan(0.85);
    expect(calls).toHaveLength(0);
  });

  it("사람이 '새 장소로' 를 골랐으면 재대조를 건너뛴다", async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-near', name: '두부식당', type: 'restaurant', lat: 33.50045, lng: 126.7 });
    const lead = candidate({
      extracted: extracted({ name: '두부식당', type: 'restaurant', geo: jejuGeo }),
    });

    const outcome = await approveGroup(client, group([lead]), [target], { ...OPTIONS, asNew: true });

    expect(outcome).toMatchObject({ kind: 'created', placeId: 'new-place-id' });
    expect(calls[1].op).toBe('insert');
  });

  it("'여기에 합치기' 로 고른 장소는 짝이 없어도 그대로 쓴다", async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-chosen', name: '두부식당', type: 'restaurant' });
    const lead = candidate({ extracted: extracted({ name: '전혀다른이름', type: 'restaurant', address: '제주시 1' }) });

    const outcome = await approveGroup(client, group([lead]), [target], { ...OPTIONS, mergeInto: 'place-chosen' });

    expect(outcome).toMatchObject({ kind: 'merged', placeId: 'place-chosen' });
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
  });
});

describe('approveGroup — 막히는 후보', () => {
  it('지역이 "동쪽 (구좌읍)" 형식이 아니면 반영하지 않는다', async () => {
    const { calls, client } = createFakeClient();
    const lead = candidate({ extracted: extracted({ regionRaw: '제주 어딘가' }) });

    const outcome = await approveGroup(client, group([lead]), [placeRow()], OPTIONS);

    expect(outcome.kind).toBe('blocked');
    if (outcome.kind !== 'blocked') throw new Error('blocked 이 아니다');
    expect(outcome.reason).toContain('지역을 골라 주세요');
    expect(calls).toHaveLength(0);
  });

  it("종류가 '기타' 거나 이름이 비면 반영하지 않는다", async () => {
    const { calls, client } = createFakeClient();

    const other = await approveGroup(client, group([candidate({ extracted: extracted({ type: 'other' }) })]), [], OPTIONS);
    expect(other).toMatchObject({ kind: 'blocked' });

    const noName = await approveGroup(client, group([candidate({ extracted: extracted({ name: '  ' }) })]), [], OPTIONS);
    expect(noName).toMatchObject({ kind: 'blocked' });

    expect(calls).toHaveLength(0);
  });
});

describe('approveGroup — 묶음의 나머지 글', () => {
  it('두 번째 후보는 새 장소를 만들지 않고 첫 장소로 merged 된다', async () => {
    const { calls, client } = createFakeClient();
    const lead = candidate({ id: 'cand-1', post_url: 'https://blog/1' });
    const second = candidate({
      id: 'cand-2',
      post_url: 'https://blog/2',
      extracted: extracted({ address: '제주시 구좌읍 3', confidence: 0.5 }),
    });

    const outcome = await approveGroup(client, group([lead, second]), [], OPTIONS);

    expect(outcome).toMatchObject({ kind: 'created', placeId: 'new-place-id', rows: 2 });
    expect(trace(calls)).toEqual([
      'candidates.update:approved',
      'places.insert:published',
      'candidates.update:match_place_id',
      'place_sources.upsert:place_id+post_url',
      'candidates.update:merged',
      'candidates.update:approved',
      // 두 번째 글이 채운 주소 — 첫 후보엔 없던 빈 칸이다.
      'places.update:address',
      'place_sources.upsert:place_id+post_url',
      'candidates.update:merged',
    ]);
    expect(calls[6].filter).toEqual({ id: 'new-place-id' });
    expect(calls[7].payload).toEqual({ place_id: 'new-place-id', post_url: 'https://blog/2' });
    expect((calls[8].payload.extracted as TCandidateExtracted).applied).toMatchObject({
      placeId: 'new-place-id',
      kind: 'merged',
      patchKeys: ['address'],
    });
  });
});

describe('rejectGroup', () => {
  it('묶음의 모든 행을 rejected 로 바꾸고 사유를 덧붙인다', async () => {
    const { calls, client } = createFakeClient();
    const rows = [candidate({ id: 'cand-1' }), candidate({ id: 'cand-2', reviewer_note: '앞선 메모' })];

    await rejectGroup(client, group(rows), '목록글', '여러 가게를 나열한 글이에요');

    expect(calls).toHaveLength(2);
    expect(calls[0].payload).toEqual({
      status: 'rejected',
      reviewer_note: '[admin] 목록글 — 여러 가게를 나열한 글이에요',
    });
    expect(calls[1].payload.reviewer_note).toBe('앞선 메모\n[admin] 목록글 — 여러 가게를 나열한 글이에요');
    expect(calls[1].filter).toEqual({ id: 'cand-2' });
  });

  it('메모 없이 사유만이면 사유 한 줄만 남는다', async () => {
    const { calls, client } = createFakeClient();

    await rejectGroup(client, group([candidate()]), '폐업');

    expect(calls[0].payload.reviewer_note).toBe('[admin] 폐업');
  });
});

describe('setRegion', () => {
  it('extracted 의 regionRaw 만 덮고 갱신된 행을 돌려준다', async () => {
    const { calls, client } = createFakeClient();
    const row = candidate({ extracted: extracted({ regionRaw: null, address: '제주시 1' }) });

    const next = await setRegion(client, row, '서쪽 (애월읍)');

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('candidates');
    expect((calls[0].payload.extracted as TCandidateExtracted).regionRaw).toBe('서쪽 (애월읍)');
    expect((calls[0].payload.extracted as TCandidateExtracted).address).toBe('제주시 1');
    expect(next.extracted.regionRaw).toBe('서쪽 (애월읍)');
    // 원본은 그대로 — 화면이 목록의 행을 갈아 끼울 때 예전 값을 잃지 않게.
    expect(row.extracted.regionRaw).toBeNull();
  });
});
