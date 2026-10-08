/**
 * 후보 고치기의 순수 부분.
 *
 * 이 파일이 막는 것 중 제일 중요한 것은 **짝 재계산**이다. 이름·주소를 고쳐도 `match_place_id` 가 그대로면
 * 승인은 고치기 전의 짝으로 합쳐지는데(`decideTarget` 은 tier 가 new 가 아니면 재대조를 안 한다),
 * 그때 빌드도 테스트도 초록이고 화면도 멀쩡하다 — 엉뚱한 장소에 합쳐진 것은 사이트에서야 보인다.
 */

import { describe, expect, it } from 'vitest';
import {
  buildEdit,
  chooseAddress,
  draftFromExtracted,
  editPreview,
  editProblem,
  aiEdits,
  editChanges,
  EMPTY_VALUE,
  identityChanged,
  policyDraftFrom,
  policyFactsFrom,
  type TCandidateEditDraft,
} from './adminEdit';
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
    expect(draftFromExtracted(extracted({ address: null, features: null, geo: null, petPolicyText: null, petPolicy: null }))).toEqual({
      name: '솔숲펜션',
      type: 'stay',
      address: '',
      lat: '',
      lng: '',
      naverPlace: '',
      homepageUrl: '',
      homepageImage: '',
      features: '',
      petPolicyText: '',
      policy: {
        indoor: 'unknown',
        leash: false,
        largeDogOk: 'unknown',
        smallDogOnly: false,
        callFirst: false,
        vaccineRequired: false,
        feeFree: 'unknown',
        feeLines: '',
        weightLimitKg: '',
        maxDogs: '',
        notes: '',
      },
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

  /** 이름을 고치면 `nameKey` 는 새 이름으로 바뀐다 — 원래 키는 `editedFrom` 에 처음 한 번만 남는다(재분석이 복제본을 안 만들게). */
  it('처음 고칠 때만 고치기 전 nameKey 를 editedFrom 에 남긴다', () => {
    const first = buildEdit(row({ extracted: extracted({ name: '엉뚱한이름', nameKey: '엉뚱한이름' }) }), draft({ name: '솔숲펜션' }), [place()]);
    expect(first.extracted.nameKey).toBe('솔숲펜션');
    expect(first.extracted.editedFrom).toEqual({ nameKey: '엉뚱한이름' });
    const second = buildEdit(row({ extracted: first.extracted }), draft({ name: '다른이름' }), [place()]);
    expect(second.extracted.editedFrom).toEqual({ nameKey: '엉뚱한이름' });
    const legacy = buildEdit(row({ extracted: extracted({ editedAt: '2026-09-30T00:00:00.000Z' }) }), draft({ name: '다른이름' }), [place()]);
    expect(legacy.extracted.editedFrom).toBeUndefined();
  });

  /**
   * 주소 표식은 `editedAt` 과 **따로** 서야 한다 — `geoSource` 는 좌표의 출처라 주소를 고쳐도 남고,
   * 검수 화면은 그 칸으로 '상호 검색으로 확인된 주소' 를 그린다(`adminAddress.ts`).
   */
  it('주소를 고치면 addressEdited 가 서고, 소개만 고치면 안 선다', () => {
    expect(buildEdit(row(), draft({ features: 'x' }), [place()]).extracted.addressEdited).toBe(false);
    const moved = buildEdit(row(), draft({ address: '제주 서귀포시 대포로 93' }), [place()]);
    expect(moved.extracted.addressEdited).toBe(true);
  });

  /** 한 번 참이면 되돌리지 않는다 — 네이버가 줬던 값은 이미 덮여서 다시 확인할 길이 없다. */
  it('이미 고친 후보는 다음 저장에서도 표식을 지키지 않고 유지한다', () => {
    const before = row({ extracted: extracted({ addressEdited: true }) });
    expect(buildEdit(before, draft({ features: 'x' }), [place()]).extracted.addressEdited).toBe(true);
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

describe('editChanges — 무엇이었는데 무엇으로', () => {
  it('바뀐 칸만, 사람이 읽는 값으로 전·후를 준다', () => {
    const before = draft();
    expect(editChanges(draft({ name: '새이름', type: 'cafe', features: '' }), before)).toEqual([
      { key: 'name', label: '이름', before: '솔숲펜션', after: '새이름' },
      { key: 'type', label: '종류', before: '숙소', after: '카페' },
      { key: 'features', label: 'AI 요약', before: '넓은 마당이 있어요.', after: EMPTY_VALUE },
    ]);
    expect(editChanges(before, before)).toEqual([]);
  });

  /** '동반 정보' 한 단어로 뭉개던 자리 — 실내를 바꿨는지 무게를 바꿨는지가 화면에 없었다. */
  it('동반 정보는 칸마다 가르고 policy 표시를 단다', () => {
    const before = draft();
    const after = { ...before, policy: { ...before.policy, indoor: 'outdoorOnly' as const, weightLimitKg: '10' } };
    expect(editChanges(after, before)).toEqual([
      { key: 'indoor', label: '실내', before: '언급 없음', after: '야외만', policy: true },
      { key: 'weightLimitKg', label: '무게 상한', before: EMPTY_VALUE, after: '10kg', policy: true },
    ]);
  });

  it('공백만 바뀐 것은 바뀐 것이 아니다 — 저장해도 같은 값이 된다', () => {
    expect(editChanges(draft({ name: ' 솔숲펜션 ' }), draft())).toEqual([]);
  });
});

describe('aiOriginal — AI 가 처음 뽑은 값', () => {
  it('처음 고칠 때 떠 두고, 두 번째 저장은 옛 스냅샷을 지킨다', () => {
    const first = buildEdit(row(), draft({ name: '솔숲펜션2' }), [place()]).extracted;
    expect(first.aiOriginal).toMatchObject({ name: '솔숲펜션', features: '넓은 마당이 있어요.' });
    const second = buildEdit(row({ extracted: first }), draft({ name: '솔숲펜션3' }), [place()]).extracted;
    expect((second.aiOriginal as { name: string }).name).toBe('솔숲펜션');
  });

  it('aiEdits 는 AI 값 → 지금 값, 고친 적 없으면 빈 배열', () => {
    expect(aiEdits(extracted())).toEqual([]);
    const edited = buildEdit(row(), draft({ features: '고친 소개예요.' }), [place()]).extracted;
    expect(aiEdits(edited)).toEqual([{ key: 'features', label: 'AI 요약', before: '넓은 마당이 있어요.', after: '고친 소개예요.' }]);
  });
});

describe('policyFactsFrom — 빈 판단은 객체가 아니라 null 이다', () => {
  const empty = draftFromExtracted(extracted({ petPolicy: null })).policy;

  /**
   * 빈 객체를 돌려주면 `aiAnalyzed` 가 '판단 있음' 으로 세어 초록 `분석 완료` 가 붙는데, 같은 카드의
   * 펼친 상세는 `AI 가 읽은 동반 조건이 없어요` 라고 한다 — 한 카드가 자기를 반박한다.
   */
  it('아무것도 안 적으면 null', () => {
    expect(policyFactsFrom(empty)).toBeNull();
  });

  it('하나라도 적으면 객체 — 삼항은 세 갈래를 지킨다', () => {
    expect(policyFactsFrom({ ...empty, largeDogOk: 'no' })?.largeDogOk).toBe(false);
    expect(policyFactsFrom({ ...empty, largeDogOk: 'yes' })?.largeDogOk).toBe(true);
    // '언급 없음' 하나만으로는 판단이 생기지 않는다 — false 와 null 을 가르는 것이 이 폼의 요점이다.
    expect(policyFactsFrom({ ...empty, largeDogOk: 'unknown' })).toBeNull();
  });

  it('숫자 칸은 빈 문자열이면 null', () => {
    expect(policyFactsFrom({ ...empty, weightLimitKg: '' })).toBeNull();
    expect(policyFactsFrom({ ...empty, weightLimitKg: '10' })?.weightLimitKg).toBe(10);
  });
});

describe('editProblem — 숫자 칸', () => {
  it.each([['0'], ['-3'], ['열']])('무게 상한이 %s 면 막는다 — 못 읽으면 조용히 제한 없음이 된다', (raw) => {
    const d = draft();
    expect(editProblem({ ...d, policy: { ...d.policy, weightLimitKg: raw } })).toMatch(/무게 상한/);
  });

  it('비워 두는 것은 괜찮다', () => {
    const d = draft();
    expect(editProblem({ ...d, policy: { ...d.policy, weightLimitKg: '', maxDogs: '' } })).toBeNull();
  });
});

/**
 * 이 폼의 요점 — **보정을 미리 돌려 보여 준다.** 사람이 넣은 값도 원문에 근거가 없으면 지워지는데
 * (ADR-017 v2, 사이트가 그릴 때마다 다시 돈다), 미리 안 보여 주면 "고쳤는데 안 나간다" 가 조용히 일어난다.
 */
describe('editPreview — 고친 값이 실제로 사이트에 어떻게 나가나', () => {
  const withPolicy = (over: Partial<TCandidateEditDraft['policy']>, petPolicyText: string): TCandidateEditDraft => {
    const d = draft();
    return { ...d, petPolicyText, policy: { ...d.policy, ...over } };
  };

  it('원문에 근거가 있으면 칩이 된다', () => {
    const { cell, corrections } = editPreview(withPolicy({ weightLimitKg: '10' }, '10kg 이하만 가능해요'));
    expect(cell.items.map((i) => i.label)).toContain('10kg 이하');
    expect(corrections).toEqual([]);
  });

  /** 같은 값인데 원문만 다르다 — 그 차이가 그대로 화면에 보여야 한다. */
  it('원문에 없으면 빠지고, 뺀 이유가 함께 온다', () => {
    const { cell, corrections } = editPreview(withPolicy({ weightLimitKg: '10' }, '리드줄 착용 부탁드려요'));
    expect(cell.items.map((i) => i.label)).not.toContain('10kg 이하');
    expect(corrections.length).toBeGreaterThan(0);
  });

  it('원문이 비면 조건이 아니라 문장으로 말한다 — 반영기가 pet_policy 를 안 쓰는 상태다', () => {
    const { cell } = editPreview(withPolicy({ leash: true }, '   '));
    expect(cell.items).toEqual([]);
    expect(cell.message).toBe('동반 조건 문장이 없어요');
  });
});

describe('buildEdit — 동반 정보', () => {
  it('원문이 비면 구조값도 비운다 — 화면만 "판단 있음" 으로 읽는 상태를 만들지 않는다', () => {
    const d = draft();
    const out = buildEdit(row(), { ...d, petPolicyText: '  ', policy: { ...d.policy, leash: true } }, [place()]);
    expect(out.extracted.petPolicyText).toBeNull();
    expect(out.extracted.petPolicy).toBeNull();
  });

  it('원문이 있으면 구조값이 함께 저장된다', () => {
    const d = draft();
    const out = buildEdit(row(), { ...d, petPolicyText: '대형견은 어려워요', policy: { ...d.policy, largeDogOk: 'no' } }, [place()]);
    expect(out.extracted.petPolicyText).toBe('대형견은 어려워요');
    expect(out.extracted.petPolicy?.largeDogOk).toBe(false);
  });

  it('동반 정보만 고치면 짝은 그대로 — 대조에 쓰이지 않는다', () => {
    const d = draft();
    const before = row({ match_place_id: 'p9', match_confidence: 0.9 });
    const out = buildEdit(before, { ...d, petPolicyText: '리드줄 필수예요' }, [place()]);
    expect(out.match_place_id).toBe('p9');
  });
});

describe('네이버 플레이스 칸 (ADR-002 v2)', () => {
  it('주소를 붙여 넣으면 id 로 저장하고, 그 id 의 기존 장소로 짝이 붙는다', () => {
    const before = row({ extracted: extracted({ name: '다른이름', nameKey: '다른이름' }) });
    const out = buildEdit(
      before,
      draft({ name: '다른이름', naverPlace: 'https://m.place.naver.com/accommodation/1118214877/home' }),
      [place({ naver_place_id: '1118214877' })],
    );
    expect(out.extracted.naverPlaceId).toBe('1118214877');
    expect(out.match_place_id).toBe('p1');
    expect(out.extracted.match?.reason).toBe('naverPlaceId 일치');
  });

  it('단축 링크는 저장을 막고 이유를 말한다', () => {
    expect(editProblem(draft({ naverPlace: 'https://naver.me/xIgKjUqT' }))).toMatch('naver.me');
    expect(editProblem(draft({ naverPlace: '1118214877' }))).toBeNull();
  });

  it('꼴만 바뀐 것(주소 ↔ 숫자)은 바뀐 게 아니다', () => {
    const ex = extracted({ naverPlaceId: '1118214877' });
    expect(identityChanged({ ...draftFromExtracted(ex), naverPlace: 'https://map.naver.com/p/entry/place/1118214877' }, ex)).toBe(false);
    expect(identityChanged({ ...draftFromExtracted(ex), naverPlace: '' }, ex)).toBe(true);
    expect(editChanges(draft({ naverPlace: '1118214877' }), draft()).map((c) => c.label)).toContain('네이버 플레이스');
    // 꼴만 다른 두 값은 '바뀐 것' 목록에도 안 뜬다
    expect(editChanges({ ...draftFromExtracted(ex), naverPlace: 'https://map.naver.com/p/entry/place/1118214877' }, draftFromExtracted(ex))).toEqual([]);
  });
});

describe('홈페이지 칸 (ADR-002 v2)', () => {
  const card = { url: 'https://www.solsup.com/', siteName: '솔숲펜션', image: 'https://www.solsup.com/a.jpg' };
  const withCard = () => row({ extracted: extracted({ homepage: card }) });

  it('사진만 비우면 사진만 빠지고 이름은 남는다', () => {
    const d = { ...draftFromExtracted(extracted({ homepage: card })), homepageImage: '' };
    expect(buildEdit(withCard(), d, [place()]).extracted.homepage).toEqual({ ...card, image: null });
    expect(editChanges(d, draftFromExtracted(extracted({ homepage: card })))).toEqual([
      { key: 'homepageImage', label: '홈페이지 사진', before: card.image, after: EMPTY_VALUE },
    ]);
  });

  it('주소를 비우면 카드째 빠진다 · 주소를 바꾸면 옛 이름을 버린다', () => {
    const base = draftFromExtracted(extracted({ homepage: card }));
    expect(buildEdit(withCard(), { ...base, homepageUrl: '', homepageImage: '' }, [place()]).extracted.homepage).toBeNull();
    expect(buildEdit(withCard(), { ...base, homepageUrl: 'https://other.kr/' }, [place()]).extracted.homepage?.siteName).toBeNull();
  });

  it('반영기가 버릴 값은 저장 전에 막는다', () => {
    expect(editProblem(draft({ homepageUrl: 'www.solsup.com' }))).toMatch('http');
    expect(editProblem(draft({ homepageUrl: 'https://a.kr/', homepageImage: 'http://a.kr/a.jpg' }))).toMatch('https');
    expect(editProblem(draft({ homepageImage: 'https://a.kr/a.jpg' }))).toMatch('사진만');
    expect(editProblem(draft({ homepageUrl: 'https://a.kr/', homepageImage: 'https://a.kr/a.jpg' }))).toBeNull();
  });
});

/**
 * `주소 다름` 의 [원글 주소로] [검색 주소로]. 원글 쪽을 고르면 **검색이 준 좌표를 버리고 지역도 다시 뽑는다** —
 * 남기면 주소는 애월인데 마커는 서귀포에 서고, 지역은 '남쪽 (서귀포시)' 로 남는다(엔젤하우스 실측).
 */
describe('chooseAddress', () => {
  const conflict = row({
    extracted: extracted({
      name: '엔젤하우스',
      address: '제주특별자치도 서귀포시 대포로 93',
      addressAi: '제주특별자치도 제주시 애월읍 신엄안3길 95',
      regionRaw: '남쪽 (서귀포시)',
      regionRawAi: '서쪽 (애월읍)',
      geoSource: 'local',
      geo: { lat: 33.24, lng: 126.43 },
    }),
  });

  it('검색 주소로 — 값은 그대로, 고른 표식만 남는다', () => {
    const edit = chooseAddress(conflict, 'search', []);
    expect(edit.extracted.address).toBe('제주특별자치도 서귀포시 대포로 93');
    expect(edit.extracted.geo).toEqual({ lat: 33.24, lng: 126.43 });
    expect(edit.extracted.addressChosen).toBe('search');
    expect(edit.match_place_id).toBe(conflict.match_place_id);
  });

  it('원글 주소로 — 주소를 바꾸고 좌표를 버리고 지역을 원글 주소에서 다시 뽑는다', () => {
    const edit = chooseAddress(conflict, 'blog', []);
    expect(edit.extracted.address).toBe('제주특별자치도 제주시 애월읍 신엄안3길 95');
    expect(edit.extracted.geo).toBeNull();
    expect(edit.extracted.addressEdited).toBe(true);
    expect(edit.extracted.addressChosen).toBe('blog');
    expect(edit.extracted.regionRaw).toContain('애월읍');
  });
});

describe('policyFactsFrom — 요금 구조(fees)는 줄을 안 고쳤을 때만 되돌려 싣는다(ADR-017 v5)', () => {
  const fees = [
    { label: '19kg 이하 1마리당 2만원', amountWon: 20000, basis: 'perDog' as const, minKg: null, maxKg: 19, fromDog: null, perNight: false },
    { label: '20kg 이상 1마리당 3만원', amountWon: 30000, basis: 'perDog' as const, minKg: 20, maxKg: null, fromDog: null, perNight: false },
  ];
  const facts = { indoor: 'unknown' as const, leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: false, weightLimitKg: null, maxDogs: null, notes: null, fees };

  it('요금 줄을 그대로 두면 구조가 남는다', () => {
    const draft = policyDraftFrom(facts);
    expect(draft.feeLines).toBe('19kg 이하 1마리당 2만원\n20kg 이상 1마리당 3만원');
    expect(policyFactsFrom(draft)).toMatchObject({ fees, feeLines: [] });
  });

  /** 저장은 필드 하나만 고쳐도 이 함수를 거친다 — 옛 판단에 빈 `fees` 가 붙으면 앱이 잔여 병합을 끄고 캄이 "6만원" 이 된다. */
  it('옛 판단(구조 없음)에는 fees 칸을 만들지 않는다', () => {
    const legacy = { ...facts, fees: undefined, feeText: '1마리당 3만원' };
    expect(policyFactsFrom(policyDraftFrom(legacy))).not.toHaveProperty('fees');
  });

  it('요금 줄을 고치면 구조는 버리고 줄이 정본이 된다 — 구조가 새 줄을 모른다', () => {
    const draft = { ...policyDraftFrom(facts), feeLines: '19kg 이하 1마리당 2만원\n20kg 이상 1마리당 4만원' };
    expect(policyFactsFrom(draft)).toMatchObject({ fees: [], feeLines: ['19kg 이하 1마리당 2만원', '20kg 이상 1마리당 4만원'] });
  });
});
