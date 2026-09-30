/**
 * 후보 고치기의 순수 부분.
 *
 * 이 파일이 막는 것 중 제일 중요한 것은 **짝 재계산**이다. 이름·주소를 고쳐도 `match_place_id` 가 그대로면
 * 승인은 고치기 전의 짝으로 합쳐지는데(`decideTarget` 은 tier 가 new 가 아니면 재대조를 안 한다),
 * 그때 빌드도 테스트도 초록이고 화면도 멀쩡하다 — 엉뚱한 장소에 합쳐진 것은 사이트에서야 보인다.
 */

import { describe, expect, it } from 'vitest';
import { buildEdit, draftFromExtracted, editProblem, editSummary, identityChanged, type TCandidateEditDraft } from './adminEdit';
import type { TCandidateExtracted, TCandidateRow, TPlaceRow } from './adminCandidates';

const extracted = (over: Partial<TCandidateExtracted> = {}): TCandidateExtracted => ({
  name: '솔숲펜션',
  type: 'stay',
  regionRaw: '동쪽 (구좌읍)',
  address: '제주 제주시 구좌읍 세화리 1',
  petPolicyText: '리드줄 필수',
  petPolicy: null,
  features: '넓은 마당이 있어요.',
  geo: { lat: 33.52, lng: 126.85 },
  nameKey: '솔숲펜션',
  ...over,
});

const row = (over: Partial<TCandidateRow> = {}): TCandidateRow =>
  ({
    id: 'c1',
    post_url: 'https://blog/1',
    extracted: extracted(),
    match_place_id: null,
    match_confidence: null,
    status: 'pending',
    reviewer_note: null,
    reviewed_at: null,
    created_at: '2026-09-30',
    blog_posts: null,
    places: null,
    ...over,
  }) as TCandidateRow;

const place = (over: Partial<TPlaceRow> = {}): TPlaceRow =>
  ({
    id: 'p1',
    type: 'stay',
    name: '솔숲펜션',
    region_raw: '동쪽 (구좌읍)',
    features: '',
    pet_policy_text: '',
    pet_policy: null,
    review_url: null,
    naver_url: null,
    naver_place_id: null,
    lat: 33.52,
    lng: 126.85,
    address: '제주 제주시 구좌읍 세화리 1',
    category: null,
    stay_price_text: null,
    stay_amenities_text: null,
    sort: null,
    status: 'published',
    source: 'seed',
    archived_at: null,
    archive_note: null,
    ...over,
  }) as TPlaceRow;

const draft = (over: Partial<TCandidateEditDraft> = {}): TCandidateEditDraft => ({
  ...draftFromExtracted(extracted()),
  ...over,
});

describe('draftFromExtracted — 폼은 전부 문자열이다', () => {
  it('null 은 빈 문자열로, 좌표는 두 칸으로 편다', () => {
    expect(draftFromExtracted(extracted({ address: null, features: null, geo: null }))).toEqual({
      name: '솔숲펜션',
      type: 'stay',
      address: '',
      lat: '',
      lng: '',
      features: '',
    });
  });

  /** `other` 는 `toNewPlaceRow` 가 영구 오류로 막는다 — 폼에 그 선택지를 두지 않으므로 값도 안전한 쪽으로 눕힌다. */
  it("고를 수 없는 종류('other'·모르는 값)는 폼에서 'cafe' 로 눕는다", () => {
    expect(draftFromExtracted(extracted({ type: 'other' })).type).toBe('cafe');
  });
});

describe('editProblem — 반영 때 터지거나 조용히 틀릴 것만 막는다', () => {
  it('이름이 비면 막는다 — toNewPlaceRow 가 영구 오류로 되돌린다', () => {
    expect(editProblem(draft({ name: '   ' }))).toBe('이름을 적어 주세요.');
  });

  /**
   * 한 칸만 채운 좌표는 `validGeo` 가 통째로 버린다 — 저장은 되는데 좌표는 사라지는, 화면이 아무 말도
   * 하지 않는 갈래다. 그래서 반쯤 지운 상태 자체를 막는다.
   */
  it('위도·경도는 둘 다거나 둘 다 아니거나', () => {
    expect(editProblem(draft({ lat: '33.5', lng: '' }))).toMatch(/둘 다/);
    expect(editProblem(draft({ lat: '', lng: '126.5' }))).toMatch(/둘 다/);
    expect(editProblem(draft({ lat: '', lng: '' }))).toBeNull();
  });

  it('숫자가 아니면 막는다', () => {
    expect(editProblem(draft({ lat: '삼십삼', lng: '126.5' }))).toMatch(/숫자/);
  });

  /** 경계의 목적은 정확한 제주도가 아니라 **자리를 바꿔 넣은 실수**를 잡는 것이다. */
  it('위도·경도를 바꿔 넣으면 둘 다 범위 밖이라 잡힌다', () => {
    expect(editProblem(draft({ lat: '126.85', lng: '33.52' }))).toMatch(/제주 밖/);
  });

  it('제주 안 좌표는 통과한다', () => {
    expect(editProblem(draft({ lat: '33.2218', lng: '126.9614' }))).toBeNull();
  });
});

describe('identityChanged — 짝을 다시 계산할지 가른다', () => {
  it.each([
    ['이름', { name: '솔숲펜션2' }],
    ['종류', { type: 'cafe' as const }],
    ['주소', { address: '제주 서귀포시 어딘가 2' }],
    ['좌표', { lat: '33.3' }],
  ])('%s 가 바뀌면 true', (_label, over) => {
    expect(identityChanged(draft(over), extracted())).toBe(true);
  });

  it('AI 요약만 바뀌면 false — 소개 문장은 대조에 쓰이지 않는다', () => {
    expect(identityChanged(draft({ features: '아주 다른 소개예요.' }), extracted())).toBe(false);
  });

  it('앞뒤 공백만 다른 것은 바뀐 것이 아니다', () => {
    expect(identityChanged(draft({ name: '  솔숲펜션  ' }), extracted())).toBe(false);
  });
});

describe('buildEdit', () => {
  it('AI 요약만 고치면 짝을 손대지 않는다', () => {
    const before = row({ match_place_id: 'p9', match_confidence: 0.9 });
    const out = buildEdit(before, draft({ features: '새 소개예요.' }), [place()]);
    expect(out.extracted.features).toBe('새 소개예요.');
    expect(out.match_place_id).toBe('p9');
    expect(out.match_confidence).toBe(0.9);
  });

  it('빈 칸은 null 로 — 빈 문자열이 DB 로 새지 않는다', () => {
    const out = buildEdit(row(), draft({ address: '  ', features: '  ', lat: '', lng: '' }), [place()]);
    expect(out.extracted.address).toBeNull();
    expect(out.extracted.features).toBeNull();
    expect(out.extracted.geo).toBeNull();
  });

  /**
   * 이 테스트가 이 파일의 이유다. 네이버가 동명의 다른 가게를 집어 `p1` 에 붙은 후보의 이름을 고쳤을 때,
   * 짝이 그대로 남으면 승인은 **여전히 `p1` 로 합쳐진다** — 사람이 고친 의미가 통째로 사라진다.
   */
  it('이름을 전혀 다른 가게로 고치면 짝이 풀리고 tier 가 new 가 된다', () => {
    const before = row({ match_place_id: 'p1', match_confidence: 0.95 });
    const out = buildEdit(before, draft({ name: '전혀다른카페', type: 'cafe', address: '', lat: '', lng: '' }), [place()]);
    expect(out.match_place_id).toBeNull();
    expect(out.extracted.match?.tier).toBe('new');
    // `nameKey` 는 `normalizeName` 이 정한다 — 종류 접미사('카페')를 떼는 것이 그 함수의 일이다.
    expect(out.extracted.nameKey).toBe('전혀다른');
  });

  it('엉뚱하게 붙은 이름을 바로잡으면 짝이 다시 붙는다', () => {
    const before = row({ extracted: extracted({ name: '엉뚱한이름', nameKey: '엉뚱한이름' }), match_place_id: null, match_confidence: null });
    const out = buildEdit(before, draft({ name: '솔숲펜션' }), [place()]);
    expect(out.match_place_id).toBe('p1');
    expect(out.extracted.match?.tier).toBe('auto');
  });

  /** `meta` 를 지우거나 덮지 않는다 — 지우면 재분석 대상을 고르는 키가 사라진다. */
  it('사람이 고친 표식을 남기되 meta·verify 는 그대로 둔다', () => {
    const meta = { model: 'm', promptVersion: 'v' };
    const verify = { petAllowedHere: 'yes' as const, dogWasThere: true, quote: 'q', why: null };
    const out = buildEdit(row({ extracted: extracted({ meta, verify }) }), draft({ features: 'x' }), [place()], new Date('2026-09-30T12:00:00Z'));
    expect(out.extracted.editedAt).toBe('2026-09-30T12:00:00.000Z');
    expect(out.extracted.meta).toEqual(meta);
    expect(out.extracted.verify).toEqual(verify);
  });

  /** 대조 corpus 는 `approveGroup` 과 같아야 한다 — status 가 실려야 동점에서 살아 있는 곳이 이긴다. */
  it('점수가 같으면 내린 곳보다 살아 있는 곳을 고른다', () => {
    const archived = place({ id: 'p-old', status: 'archived' });
    const live = place({ id: 'p-live', status: 'published' });
    const before = row({ extracted: extracted({ name: '엉뚱한이름', nameKey: '엉뚱한이름' }) });
    expect(buildEdit(before, draft({ name: '솔숲펜션' }), [archived, live]).match_place_id).toBe('p-live');
    // 순서를 뒤집어도 같다 — 이기는 이유가 배열 순서가 아니라 `status` 여야 한다.
    expect(buildEdit(before, draft({ name: '솔숲펜션' }), [live, archived]).match_place_id).toBe('p-live');
  });
});

describe('editSummary', () => {
  it('바뀐 것만 한국어로 — 종류는 무엇에서 무엇으로인지까지', () => {
    const before = draft();
    expect(editSummary(draft({ name: '새이름', type: 'cafe', features: 'x' }), before)).toEqual([
      '이름',
      '종류(숙소→카페)',
      'AI 요약',
    ]);
    expect(editSummary(before, before)).toEqual([]);
  });
});
