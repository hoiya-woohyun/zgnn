import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { approveGroup, confirmSite, EDITED_NOTE, rejectGroup, saveEdit, setRegion, SITE_CONFIRMED_NOTE } from './adminApply';
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

/**
 * @param failOn 이 순서(0-based)의 쓰기에서 오류를 준다. 부분 실패 뒤의 **문구**를 검사하려고 둔다 —
 *   PostgREST 에 트랜잭션이 없어 "앞은 커밋됐고 뒤가 죽었다" 가 실제 상태이고, 그때 화면이 무엇을 말하는지가 계약이다.
 */
function createFakeClient(failOn?: number) {
  const calls: TFakeCall[] = [];

  const chainFor = (call: TFakeCall) => {
    const chain = {
      eq(column: string, value: unknown) {
        call.filter = { ...(call.filter ?? {}), [column]: value };
        return chain;
      },
      /*
       * `.select().single()` — `adminPlaces.setPlaceStatus` 가 쓴 행을 되읽는다(트리거가 찍은 `archived_at` 을
       * 가져오고, 0행을 성공으로 읽지 않으려고). 가짜 클라이언트는 **보낸 payload 를 그대로 돌려준다**:
       * 여기서 검사하는 것은 순서이고, 되읽기가 값을 만들어 내지 않는다는 것만 지키면 된다.
       */
      select() {
        return chain;
      },
      single() {
        return Promise.resolve({ data: { id: call.filter?.id, ...call.payload }, error: null });
      },
      then<TFulfilled, TRejected = never>(
        onFulfilled?: ((value: { data: null; error: { message: string } | null }) => TFulfilled | PromiseLike<TFulfilled>) | null,
        onRejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
      ) {
        const error = calls.indexOf(call) === failOn ? { message: '네트워크가 끊겼어요' } : null;
        return Promise.resolve({ data: null, error }).then(onFulfilled, onRejected);
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
  kind: rows[0].extracted.match?.tier === 'auto' ? 'fill' : (rows[0].extracted.match?.tier ?? 'new'),
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
  archived_at: null,
  archive_note: null,
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
   * `fetchMatchablePlaces` 가 2026-09-29 부터 archived 까지 읽으므로, 여기 오는 것은 **id 가 아예 없는** 경우다
   * (Studio 에서 지웠거나 다른 프로젝트의 id). 내린 곳은 아래 archivedTarget 테스트가 받는다.
   * 그래서 문구가 "새로고침" 을 권하면 안 된다 — 다시 읽어도 그 행은 또 없다.
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

  /*
   * 내린 곳(archived)에 짝이 붙은 후보. **쓰기 전에** 멈추고 사람에게 묻는 것이 계약이다 —
   * `blocked` 로 끝내지 않는 이유는 나갈 길이 "고치기" 가 아니라 "고르기" 이기 때문이다(`TApplyOutcome` 주석).
   */
  it('내린 곳(archived)에는 합치지 않고, 사유를 실어 사람에게 묻는다', async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({
      id: 'place-x',
      name: '옛가게',
      status: 'archived',
      archived_at: '2026-09-20T00:00:00.000Z',
      archive_note: '[admin 2026-09-20] 내림 · 폐업',
    });
    const lead = candidate({ match_place_id: 'place-x', extracted: extracted({ name: '옛가게' }) });

    const outcome = await approveGroup(client, group([lead]), [target], OPTIONS);

    expect(outcome).toEqual({
      kind: 'archivedTarget',
      placeId: 'place-x',
      placeName: '옛가게',
      archivedAt: '2026-09-20T00:00:00.000Z',
      note: '[admin 2026-09-20] 내림 · 폐업',
    });
    expect(calls).toHaveLength(0);
  });

  /*
   * '되살려서 합치기'. **되살리기가 첫 쓰기여야 한다** — 뒤가 죽어도 장소는 published 로 남아 다음 빌드에 사이트로
   * 돌아오고, 남은 일은 후보가 approved 로 남아 `pnpm data:apply` 가 이어받는다. 반대 순서면 "승인은 됐는데
   * 장소는 여전히 내려 있는" 상태로 끊기고 그것은 어느 화면에도 안 보인다.
   */
  it("'되살려서 합치기' 는 장소를 먼저 published 로 돌린 뒤 후보를 승인한다", async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-x', name: '옛가게', status: 'archived', archive_note: '[admin] 내림 · 폐업' });
    const lead = candidate({ match_place_id: 'place-x', extracted: extracted({ name: '옛가게' }) });

    const outcome = await approveGroup(client, group([lead]), [target], { ...OPTIONS, restoreArchived: true });

    expect(calls[0]).toMatchObject({ table: 'places' });
    expect(calls[0].payload.status).toBe('published');
    expect(calls[0].payload.archive_note).toContain('되살림');
    expect(calls[1]).toMatchObject({ table: 'candidates' });
    expect(calls[1].payload.status).toBe('approved');
    expect(outcome).toMatchObject({ kind: 'merged', placeId: 'place-x' });
  });

  /*
   * `asNew` 가 내린 곳을 **조용히 지나가면** 같은 가게가 새 id 로 게시된다 — 소프트 삭제가 무효가 되는 경로다.
   * 확인 표식(`confirmedDifferent`) 없이는 멈춰야 한다.
   */
  it("'새 장소로' 가 내린 곳을 버리려 하면 확인 없이는 멈춘다", async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-x', name: '옛가게', status: 'archived' });
    const lead = candidate({ match_place_id: 'place-x', extracted: extracted({ name: '옛가게' }) });

    const outcome = await approveGroup(client, group([lead]), [target], { ...OPTIONS, asNew: true });

    expect(outcome).toMatchObject({ kind: 'archivedTarget', placeId: 'place-x' });
    expect(calls).toHaveLength(0);
  });

  /*
   * 되살리기가 **커밋된 뒤에** 뒷단계가 죽는 경우. 장소는 이미 게시중이라, 그 사실을 문구에 실어야 한다 —
   * 안 실으면 사람이 그 자리에서 '아니에요' 를 누르고(그건 candidates 만 건드린다) 내렸던 곳이 사이트로 돌아간다.
   */
  it('되살린 뒤 실패하면 장소가 이미 게시중이라고 말한다', async () => {
    // 0번째 쓰기(되살리기)는 통과시키고 1번째(후보 승인 표시)에서 죽인다.
    const { calls, client } = createFakeClient(1);
    const target = placeRow({ id: 'place-x', name: '옛가게', status: 'archived' });
    const lead = candidate({ match_place_id: 'place-x', extracted: extracted({ name: '옛가게' }) });

    await expect(
      approveGroup(client, group([lead]), [target], { ...OPTIONS, restoreArchived: true }),
    ).rejects.toThrow(/옛가게 은 이미 게시중으로 돌아갔어요/);

    expect(calls[0].payload.status).toBe('published');
  });

  it("'정말 다른 가게예요' 를 확인하면 새 장소로 올린다", async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({ id: 'place-x', name: '옛가게', status: 'archived' });
    const lead = candidate({ match_place_id: 'place-x', extracted: extracted({ name: '옛가게' }) });

    const outcome = await approveGroup(client, group([lead]), [target], {
      ...OPTIONS,
      asNew: true,
      confirmedDifferent: true,
    });

    expect(outcome).toMatchObject({ kind: 'created', placeId: 'new-place-id' });
    expect(calls.some((call) => call.table === 'places' && call.op === 'insert')).toBe(true);
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

/**
 * `주소 다름` — 상호 검색이 동명의 다른 가게를 집었을 수 있다(실측: 엔젤하우스 `대포로 93` ↔ `신엄안3길 95`).
 * 뱃지만 띄우고 버튼을 그대로 두던 동안 한 번의 클릭·일괄 올리기가 틀린 주소를 게시할 수 있었다.
 */
describe('approveGroup — 원글과 주소가 다른 후보', () => {
  const conflicted = () =>
    candidate({
      extracted: extracted({
        name: '엔젤하우스',
        type: 'stay',
        regionRaw: '남쪽 (서귀포시)',
        address: '제주 서귀포시 대포로 93',
        addressAi: '제주특별자치도 제주시 애월읍 신엄안3길 95',
        geoSource: 'local',
      }),
    });

  it('확인 없이 오면 쓰기 전에 멈추고 두 주소를 돌려준다', async () => {
    const { calls, client } = createFakeClient();

    const outcome = await approveGroup(client, group([conflicted()]), [], OPTIONS);

    expect(outcome).toEqual({
      kind: 'addressConflict',
      address: '제주 서귀포시 대포로 93',
      sourceAddress: '제주특별자치도 제주시 애월읍 신엄안3길 95',
      edited: false,
    });
    expect(calls).toHaveLength(0);
  });

  /** 결정 줄의 [검색 주소로] 는 저장되는 선택이다 — 한 번 고르면 일괄 올리기도 다시 묻지 않는다. */
  it('검색 주소를 골라 저장한 후보(addressChosen)는 멈추지 않는다', async () => {
    const { client } = createFakeClient();
    const lead = conflicted();
    lead.extracted = { ...lead.extracted, addressChosen: 'search' };

    const outcome = await approveGroup(client, group([lead]), [], OPTIONS);

    expect(outcome.kind).toBe('created');
  });

  it('사람이 네이버 주소가 맞다고 확인하면 올린다', async () => {
    const { client } = createFakeClient();

    const outcome = await approveGroup(client, group([conflicted()]), [], { ...OPTIONS, addressConfirmed: true });

    expect(outcome.kind).toBe('created');
  });

  it('표기만 다른 주소(제주특별자치도 ↔ 제주)는 멈추지 않는다', async () => {
    const { client } = createFakeClient();
    const lead = candidate({
      extracted: extracted({
        address: '제주 제주시 구좌읍 충렬로 141-15',
        addressAi: '제주특별자치도 제주시 구좌읍 충렬로 141-15',
        geoSource: 'local',
      }),
    });

    const outcome = await approveGroup(client, group([lead]), [], OPTIONS);

    expect(outcome.kind).toBe('created');
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

describe('confirmSite — 사이트가 맞아요(11 U8)', () => {
  it('확인 날짜를 먼저 찍고, 후보를 사이트 확인으로 눕히고, 블랙리스트(place_blocks)는 건드리지 않는다', async () => {
    const { calls, client } = createFakeClient();
    const rows = [candidate({ id: 'cand-1' }), candidate({ id: 'cand-2', reviewer_note: '앞선 메모' })];
    const out = await confirmSite(client, group(rows), { id: 'p1', verified_at: null }, '2026-10-02T00:00:00.000Z');
    expect(out.verifiedAt).toBe('2026-10-02T00:00:00.000Z');
    expect(trace(calls)).toEqual(['places.update:verified_at', 'candidates.update:rejected', 'candidates.update:rejected']);
    expect(calls[0].filter).toEqual({ id: 'p1' });
    expect(calls[1].payload.reviewer_note).toBe(SITE_CONFIRMED_NOTE);
    expect(calls[2].payload.reviewer_note).toBe(`앞선 메모\n${SITE_CONFIRMED_NOTE}`);
    expect(calls.some((call) => call.table === 'place_blocks')).toBe(false);
  });

  it('칸이 없는 원격이면 날짜 없이 후보만 눕힌다', async () => {
    const { calls, client } = createFakeClient();
    const out = await confirmSite(client, group([candidate()]), { id: 'p1' }, '2026-10-02T00:00:00.000Z');
    expect(out.verifiedAt).toBeNull();
    expect(trace(calls)).toEqual(['candidates.update:rejected']);
  });

  it('머리표는 반려 사유가 아니다 — 반려 집계(`[admin] 사유`)와 섞이지 않게', () => {
    expect(SITE_CONFIRMED_NOTE).toBe('[admin] 사이트 확인');
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

/**
 * 고친 후보에 표시가 남는가. 이 표시가 없으면 사람이 손으로 고친 후보와 AI 그대로인 후보가 DB 에서 구별되지 않고,
 * 프롬프트를 고쳐 재분석할 때(data-pipeline.md 「재분석」) 그 손질이 같이 묻힌다.
 */
describe('saveEdit — 사람이 고쳤다는 표시', () => {
  const edit = {
    extracted: extracted({ name: '고친이름' }),
    match_place_id: null,
    match_confidence: null,
  };

  it('reviewer_note 에 한 줄을 남긴다', async () => {
    const { calls, client } = createFakeClient();
    const saved = await saveEdit(client, candidate(), edit);
    expect(calls[0].payload.reviewer_note).toBe(EDITED_NOTE);
    expect(saved.reviewer_note).toBe(EDITED_NOTE);
  });

  it('앞선 메모는 지우지 않고 뒤에 붙인다 — 두 도구가 같은 칸에 쓴다', async () => {
    const { calls, client } = createFakeClient();
    await saveEdit(client, candidate({ reviewer_note: '[data:review] 확인 필요' }), edit);
    expect(calls[0].payload.reviewer_note).toBe(`[data:review] 확인 필요\n${EDITED_NOTE}`);
  });

  /** `saveEdit` 은 묶음의 행마다 불리고 저장도 여러 번 할 수 있다 — 조건 없이 붙이면 같은 줄이 쌓인다. */
  it('두 번 고쳐도 표시는 한 줄이다', async () => {
    const { calls, client } = createFakeClient();
    await saveEdit(client, candidate({ reviewer_note: EDITED_NOTE }), edit);
    expect(calls[0].payload.reviewer_note).toBe(EDITED_NOTE);
  });
});

describe("approveGroup — '최신본으로 저장하기'(overwrite)", () => {
  /*
   * 덮기는 **승인 표시보다 먼저** 간다. 뒤에서 끊기면 후보가 approved 로 남고 CLI(`data:apply`)가 이어받는데,
   * CLI 는 빈 칸 채우기뿐이라 새 값을 조용히 버린다. 먼저 덮으면 끊겨도 후보는 pending 이다.
   */
  it('되살린 뒤 칸을 덮고, 그다음 승인·출처·merged — 덮기 전 값을 applied.overwritten 에 남긴다', async () => {
    const { calls, client } = createFakeClient();
    const target = placeRow({
      id: 'place-x',
      name: '옛가게',
      status: 'archived',
      features: '옛 소개',
      pet_policy_text: '옛 조건',
      review_url: 'https://old.example/1',
    });
    const lead = candidate({
      match_place_id: 'place-x',
      extracted: extracted({ name: '옛가게', features: '새 소개', petPolicyText: '새 조건', match: { confidence: 0.9, reason: '이름 일치', tier: 'auto' } }),
    });

    const outcome = await approveGroup(client, group([lead]), [target], { ...OPTIONS, restoreArchived: true, overwrite: true });

    expect(trace(calls)).toEqual([
      'places.update:published',
      'places.update:features+pet_policy_text+pet_policy',
      'candidates.update:approved',
      'place_sources.upsert:place_id+post_url',
      'candidates.update:merged',
    ]);
    expect(outcome).toMatchObject({ kind: 'merged', overwrittenKeys: ['features', 'pet_policy_text', 'pet_policy'] });
    const applied = (calls[4].payload.extracted as TCandidateExtracted).applied as { overwritten: Record<string, unknown> };
    expect(applied.overwritten).toEqual({ features: '옛 소개', pet_policy_text: '옛 조건', pet_policy: null });
    // review_url 은 덮지 않는다 — 합치기의 빈 칸 채우기에도 차 있어 안 들어간다.
    expect(target.review_url).toBe('https://old.example/1');
  });

  it('덮기가 실패하면 후보는 승인 표시 전이다(pending 그대로)', async () => {
    const { calls, client } = createFakeClient(0);
    const target = placeRow({ id: 'place-9', name: '살레', features: '옛 소개' });
    const lead = candidate({ match_place_id: 'place-9', extracted: extracted({ name: '살레', features: '새 소개', match: { confidence: 0.9, reason: '', tier: 'auto' } }) });

    await expect(approveGroup(client, group([lead]), [target], { ...OPTIONS, overwrite: true })).rejects.toThrow(/최신본으로 덮기/);
    expect(calls.map((call) => call.table)).toEqual(['places']);
  });
});

describe("isGenericOnlyCandidate — '조건 미기재' 인 새 장소에는 확인 날짜를 찍지 않는다 (todo/13 A2)", () => {
  it('일반 허용 문장뿐이면 참, 구체 조건이 하나라도 있으면 거짓', async () => {
    const { isGenericOnlyCandidate } = await import('./adminApply');
    const row = (petPolicyText: string) => ({ extracted: { petPolicyText, petPolicy: null } }) as never;
    expect(isGenericOnlyCandidate(row('애견동반 가능해요'))).toBe(true);
    expect(isGenericOnlyCandidate(row('케이지가 있어야 실내에 들어갈 수 있어요'))).toBe(false);
  });
});
