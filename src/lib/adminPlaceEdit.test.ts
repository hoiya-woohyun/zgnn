import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TPlaceRow } from './adminCandidates';
import {
  placeCurrentText,
  placeEditChanges,
  placeEditDraft,
  placeEditPatch,
  placeEditBadgeShift,
  placeEditIneffective,
  placeEditPreview,
  placeEditProblem,
  patchVerifies,
  renameRisksTwin,
  updatePlace,
} from './adminPlaceEdit';

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

describe('placeEditPatch — 안 고치면 쓰지 않는다', () => {
  /* 빈 update 도 재빌드 훅을 부른다 — 폼을 열고 닫기만 한 행이 쓰기를 만들면 안 된다. */
  it.each([
    ['옛 판단(feeText 있음, vaccineRequired 없음)', place({
      pet_policy_text: '1마리당 3만원. (2마리 또는 10kg 이상 4만원)',
      pet_policy: { indoor: 'free', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: false, feeText: '1마리당 3만원', weightLimitKg: null, maxDogs: null, notes: null },
    })],
    ['id 없이 naver.me 링크만', place({ naver_url: 'https://naver.me/abc' })],
    ['숙소', place({ type: 'stay', stay_price_text: '1박 10만원', stay_amenities_text: '마당' })],
    ['홈페이지·확인 날짜 칸이 없는 원격', place({ address: '제주시 1', lat: 33.4, lng: 126.5 })],
    ['선택지 밖의 지역 표기', place({ region_raw: '남쪽 (서귀포시 월평로)' })],
    ['홈페이지 칸이 있는 원격', place({ homepage_url: 'https://a.kr', homepage_name: '에이', homepage_image: null, verified_at: null })],
    ['원문 공개 칸이 있는 원격(시드)', place({ pet_policy_text: '대형견 가능', pet_policy_text_public: true, pet_policy_guide: null })],
  ])('%s', (_label, row) => {
    expect(placeEditPatch(row, placeEditDraft(row))).toBeNull();
    expect(placeEditChanges(row, placeEditDraft(row))).toEqual([]);
  });
});

describe('placeEditPatch — 주소·좌표(옛 주소 폼의 규칙)', () => {
  it('빈 주소를 채우면 그 칸만 쓴다', () => {
    const row = place({ address: null });
    expect(placeEditPatch(row, { ...placeEditDraft(row), address: ' 제주 서귀포시 안덕면 1 ' })).toEqual({
      address: '제주 서귀포시 안덕면 1',
    });
  });

  it('좌표는 두 칸을 함께 쓴다', () => {
    const row = place({ lat: 33.4, lng: 126.5 });
    expect(placeEditPatch(row, { ...placeEditDraft(row), lat: '33.3' })).toEqual({ lat: 33.3, lng: 126.5 });
  });

  it('주소를 비우면 null 로 지운다', () => {
    const row = place({ address: '제주시 1' });
    expect(placeEditPatch(row, { ...placeEditDraft(row), address: '  ' })).toEqual({ address: null });
  });
});

describe('placeEditPatch — 칸 규칙', () => {
  it('NOT NULL 칸을 비우면 빈 문자열이다(소개)', () => {
    const row = place({ features: '마당 넓은 카페' });
    expect(placeEditPatch(row, { ...placeEditDraft(row), features: '  ' })).toEqual({ features: '' });
  });

  it('이름·종류·지역·카테고리를 고친다', () => {
    const row = place();
    const draft = { ...placeEditDraft(row), name: ' 두부집 ', type: 'restaurant' as const, regionRaw: '서쪽 (애월읍)', category: '한식' };
    expect(placeEditPatch(row, draft)).toEqual({ name: '두부집', type: 'restaurant', region_raw: '서쪽 (애월읍)', category: '한식' });
  });

  it('플레이스 id 를 넣으면 링크도 그 id 의 플레이스 홈이 된다 — 붙여 넣은 꼴만 바뀐 것은 바뀐 게 아니다', () => {
    const row = place({ naver_url: 'https://naver.me/abc' });
    expect(placeEditPatch(row, { ...placeEditDraft(row), naverPlace: 'https://m.place.naver.com/restaurant/1234567/home' })).toEqual({
      naver_place_id: '1234567',
      naver_url: 'https://m.place.naver.com/place/1234567/home',
    });
    const withId = place({ naver_place_id: '1234567', naver_url: 'https://m.place.naver.com/place/1234567/home' });
    expect(placeEditPatch(withId, { ...placeEditDraft(withId), naverPlace: 'https://map.naver.com/p/entry/place/1234567' })).toBeNull();
  });

  it('플레이스 id 를 지우면 링크도 지운다(짝)', () => {
    const row = place({ naver_place_id: '1234567', naver_url: 'https://m.place.naver.com/place/1234567/home' });
    expect(placeEditPatch(row, { ...placeEditDraft(row), naverPlace: '' })).toEqual({ naver_place_id: null, naver_url: null });
  });

  it('홈페이지는 세 칸을 한 벌로 — 주소를 비우면 이름·사진도 빈다', () => {
    const row = place({ homepage_url: 'https://a.kr', homepage_name: '에이', homepage_image: 'https://a.kr/og.jpg' });
    expect(placeEditPatch(row, { ...placeEditDraft(row), homepageName: '에이 카페' })).toEqual({
      homepage_url: 'https://a.kr',
      homepage_name: '에이 카페',
      homepage_image: 'https://a.kr/og.jpg',
    });
    expect(placeEditPatch(row, { ...placeEditDraft(row), homepageUrl: '' })).toEqual({
      homepage_url: null,
      homepage_name: null,
      homepage_image: null,
    });
  });

  it('홈페이지 칸이 없는 원격에는 그 칸을 싣지 않는다', () => {
    const row = place();
    expect(placeEditPatch(row, { ...placeEditDraft(row), homepageUrl: 'https://a.kr' })).toBeNull();
  });

  it('숙소 칸은 고친 종류가 숙소일 때만 싣는다', () => {
    const row = place({ type: 'stay', stay_price_text: '1박 10만원' });
    expect(placeEditPatch(row, { ...placeEditDraft(row), stayPriceText: '1박 12만원' })).toEqual({ stay_price_text: '1박 12만원' });
    // 종류를 카페로 바꾸면 숙소 칸은 쓰지 않는다(옛 값을 지우지도 않는다).
    expect(placeEditPatch(row, { ...placeEditDraft(row), type: 'cafe', stayPriceText: '' })).toEqual({ type: 'cafe' });
  });
});

describe('placeEditPatch — 조건 원문과 판단은 짝', () => {
  const facts = {
    indoor: 'free' as const,
    leash: false,
    largeDogOk: null,
    smallDogOnly: false,
    callFirst: false,
    feeFree: false,
    feeText: '1마리당 3만원',
    weightLimitKg: null,
    maxDogs: null,
    notes: null,
  };

  it('원문만 고치면 판단은 원래 객체 그대로 함께 간다 — 폼 모양을 지나며 feeText 를 잃지 않는다', () => {
    const row = place({ pet_policy_text: '실내 가능. 1마리당 3만원', pet_policy: facts });
    const patch = placeEditPatch(row, { ...placeEditDraft(row), petPolicyText: '실내 가능. 1마리당 3만원 (현장 결제)' });
    expect(patch).toEqual({ pet_policy_text: '실내 가능. 1마리당 3만원 (현장 결제)', pet_policy: facts });
  });

  it('구조값만 고쳐도 원문까지 짝으로 싣는다', () => {
    const row = place({ pet_policy_text: '실내 가능. 리드줄 필수', pet_policy: facts });
    const draft = placeEditDraft(row);
    const patch = placeEditPatch(row, { ...draft, policy: { ...draft.policy, leash: true } });
    expect(patch?.pet_policy_text).toBe('실내 가능. 리드줄 필수');
    expect(patch?.pet_policy?.leash).toBe(true);
  });

  it('원문을 비우면 판단도 비운다(원문 칸은 빈 문자열)', () => {
    const row = place({ pet_policy_text: '실내 가능', pet_policy: facts });
    expect(placeEditPatch(row, { ...placeEditDraft(row), petPolicyText: '' })).toEqual({ pet_policy_text: '', pet_policy: null });
  });

  it('원문이 빈 채로 구조값만 만지면 바뀌는 것이 없다', () => {
    const row = place();
    const draft = placeEditDraft(row);
    expect(placeEditPatch(row, { ...draft, policy: { ...draft.policy, leash: true } })).toBeNull();
  });
});

describe('placeEditPatch — 원문 공개 체크(21 S4)', () => {
  const seed = place({ pet_policy_text: '대형견 가능', pet_policy_text_public: false, pet_policy_guide: null });

  it('켜면 patch 에 true · 안 바꾸면 키 없음 · 칸 없는 행은 켜도 키 없음', () => {
    expect(placeEditPatch(seed, { ...placeEditDraft(seed), petPolicyTextPublic: true })).toEqual({ pet_policy_text_public: true });
    expect(placeEditPatch(seed, { ...placeEditDraft(seed), features: '소개' })).not.toHaveProperty('pet_policy_text_public');
    const plain = place({ pet_policy_text: '대형견 가능' });
    expect(placeEditDraft(plain).petPolicyTextPublic).toBe(false);
    expect(placeEditPatch(plain, { ...placeEditDraft(plain), petPolicyTextPublic: true })).toBeNull();
  });

  it('원문을 고쳐도 플래그는 저절로 바뀌지 않는다 · 판단을 고쳐도 안내 칸은 건드리지 않는다', () => {
    const open = place({ pet_policy_text: '대형견 가능', pet_policy_text_public: true, pet_policy_guide: { text: '안내', basis: 'x' } });
    const draft = placeEditDraft(open);
    const patch = placeEditPatch(open, { ...draft, petPolicyText: '대형견 가능. 리드줄 필수', policy: { ...draft.policy, leash: true } });
    expect(patch).not.toHaveProperty('pet_policy_text_public');
    expect(patch).not.toHaveProperty('pet_policy_guide');
  });

  it('전·후 목록에 사람 말로 — 칸 없는 행에는 줄이 없다', () => {
    const [change] = placeEditChanges(seed, { ...placeEditDraft(seed), petPolicyTextPublic: true });
    expect(change).toMatchObject({ key: 'petPolicyTextPublic', label: '원문 공개', before: '숨김', after: '그대로 내보냄' });
    const plain = place();
    expect(placeEditChanges(plain, { ...placeEditDraft(plain), petPolicyTextPublic: true })).toEqual([]);
  });

  it('공개만 바꾼 저장은 확인 날짜를 찍지 않는다 — 사실 칸이 아니다', () => {
    expect(patchVerifies({ pet_policy_text_public: true })).toBe(false);
  });
});

describe('placeEditProblem', () => {
  it('후보 고치기와 같은 검사 — 좌표 한 칸·뒤바뀐 좌표·빈 이름', () => {
    const draft = placeEditDraft(place());
    expect(placeEditProblem({ ...draft, lat: '33.3' })).toMatch('둘 다');
    expect(placeEditProblem({ ...draft, lat: '126.5', lng: '33.3' })).toMatch('제주 밖');
    expect(placeEditProblem({ ...draft, name: ' ' })).toMatch('이름');
  });

  it('지역은 형식을 본다', () => {
    const draft = placeEditDraft(place());
    expect(placeEditProblem({ ...draft, regionRaw: '' })).toMatch('지역');
    expect(placeEditProblem({ ...draft, regionRaw: '남쪽 (서귀포시 월평로)' })).toBeNull();
  });

  it('홈페이지 주소 없이 이름만은 막는다', () => {
    expect(placeEditProblem({ ...placeEditDraft(place()), homepageName: '에이' })).toMatch('이름만');
  });
});

describe('placeEditChanges · placeCurrentText', () => {
  it('지금 값 → 고칠 값을 폼의 칸 순서로, 장소 칸의 이름으로', () => {
    const row = place({ features: '옛 소개', region_raw: '동쪽 (구좌읍)' });
    const changes = placeEditChanges(row, { ...placeEditDraft(row), features: '새 소개', regionRaw: '서쪽 (애월읍)', name: '두부집' });
    expect(changes.map((change) => [change.label, change.before, change.after])).toEqual([
      ['이름', '두부식당', '두부집'],
      ['지역', '동쪽 (구좌읍)', '서쪽 (애월읍)'],
      ['소개', '옛 소개', '새 소개'],
    ]);
  });

  it('id 없이 링크만 있는 시드는 비어 있다고 말하지 않는다', () => {
    const row = place({ naver_url: 'https://naver.me/abc' });
    expect(placeCurrentText(row, 'naverPlace')).toContain('naver.me/abc');
    const [change] = placeEditChanges(row, { ...placeEditDraft(row), naverPlace: '1234567' });
    expect(change.before).toContain('naver.me/abc');
    expect(change.after).toBe('1234567');
  });
});

describe('placeEditPreview', () => {
  it('사이트와 같은 길로 지금 · 저장하면 배지를 낸다', () => {
    const row = place();
    const { before, after } = placeEditPreview(row, { ...placeEditDraft(row), petPolicyText: '대형견 불가' });
    expect(before).not.toEqual(after);
  });

  it('보정이 뺀 줄에 대 본 단서와 보정이 읽은 원문을 같이 낸다 — 폼이 그 원문에 칠한다', () => {
    const row = place();
    const draft = placeEditDraft(row);
    const preview = placeEditPreview(row, {
      ...draft,
      petPolicyText: '  리드줄 착용 부탁드려요, 1층만 가능  ',
      policy: { ...draft.policy, weightLimitKg: '10' },
    });
    expect(preview.policyText).toBe('리드줄 착용 부탁드려요, 1층만 가능');
    expect(preview.dropped.map((d) => d.cue)).toContain('kg');
    expect(preview.corrections).toEqual(preview.dropped.map((d) => d.note));
  });
});

describe('placeEditIneffective — 고쳐도 사이트에 안 나가는 동반 칸(todo/14 W261010.25)', () => {
  const facts = { indoor: 'unknown', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: null, weightLimitKg: null, maxDogs: null, notes: null } as const;

  it('원문에 근거 없는 값을 적은 칸을 이름으로 낸다 — 근거가 있으면 없다', () => {
    const row = place({ pet_policy_text: '리드줄 착용 부탁드려요', pet_policy: { ...facts, leash: true } });
    const draft = placeEditDraft(row);
    expect(placeEditIneffective(row, { ...draft, policy: { ...draft.policy, weightLimitKg: '10' } })).toEqual(['무게 상한']);
    expect(placeEditIneffective(row, { ...draft, petPolicyText: '리드줄 착용, 10kg 미만', policy: { ...draft.policy, weightLimitKg: '10' } })).toEqual([]);
  });

  it('손대지 않은 칸이 원래 빠져 있던 것은 세지 않는다 · 아무것도 안 만지면 빈 목록', () => {
    // 옛 판단의 무게 상한 7 은 원문에 근거가 없다 — 사이트가 이미 빼고 보던 값이라 이 저장의 일이 아니다.
    const row = place({ pet_policy_text: '리드줄 착용', pet_policy: { ...facts, leash: true, weightLimitKg: 7 } });
    const draft = placeEditDraft(row);
    expect(placeEditIneffective(row, draft)).toEqual([]);
    expect(placeEditIneffective(row, { ...draft, policy: { ...draft.policy, callFirst: true } })).toEqual(['전화 확인']);
  });

  it('단서와 칸이 1:1 이 아니어도 잡는다 — 소형견만 + 대형견 가능의 모순은 대형견 칸이 빠진다', () => {
    const row = place({ pet_policy_text: '소형견만 가능해요. 대형견 문의는 전화로', pet_policy: { ...facts, smallDogOnly: true } });
    const draft = placeEditDraft(row);
    expect(placeEditIneffective(row, { ...draft, policy: { ...draft.policy, largeDogOk: 'yes' } })).toEqual(['대형견']);
  });

  it('원문을 비우면 만진 동반 칸이 전부 안 나간다 · 칸을 다 비운 것은 효과다', () => {
    const row = place({ pet_policy_text: '리드줄 착용', pet_policy: { ...facts, leash: true } });
    const draft = placeEditDraft(row);
    expect(placeEditIneffective(row, { ...draft, petPolicyText: '', policy: { ...draft.policy, maxDogs: '2' } })).toEqual(['마릿수 상한']);
    expect(placeEditIneffective(row, { ...draft, policy: { ...draft.policy, leash: false } })).toEqual([]);
  });
});

describe('placeEditBadgeShift — 저장하면 사라지고 생기는 배지(todo/14 W261010.25)', () => {
  it('원문을 고치면 손대지 않은 배지가 함께 빠진다 — 미리보기와 같은 길(`placeEditPreview`)', () => {
    const row = place({
      type: 'stay',
      pet_policy_text: '추가요금 없음, 최대 2마리, 대형견 가능',
      pet_policy: { indoor: 'unknown', leash: false, largeDogOk: true, smallDogOnly: false, callFirst: false, feeFree: true, weightLimitKg: null, maxDogs: 2, notes: null },
    });
    const { before, after } = placeEditPreview(row, { ...placeEditDraft(row), petPolicyText: '반려견 동반 가능' });
    const shift = placeEditBadgeShift(before, after);
    expect(shift.gone).toEqual(expect.arrayContaining(['추가요금 없음', '대형견 OK']));
    expect(shift.gone.some((label) => label.includes('2마리'))).toBe(true);
    expect(shift.added).toEqual([]);
  });

  it('바뀐 배지는 사라진 쪽과 생긴 쪽 둘로 · 같으면 둘 다 비어 있다', () => {
    const badge = (label: string) => ({ label, tone: 'ok' as const, axis: 'size' as const });
    expect(placeEditBadgeShift([badge('실내 OK'), badge('대형견 OK')], [badge('실내 OK'), badge('중형견 OK')])).toEqual({ gone: ['대형견 OK'], added: ['중형견 OK'] });
    expect(placeEditBadgeShift([badge('실내 OK')], [badge('실내 OK')])).toEqual({ gone: [], added: [] });
  });
});

describe('updatePlace', () => {
  const fake = () => {
    const writes: Record<string, unknown>[] = [];
    const client = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          writes.push(payload);
          return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'place-1', ...payload }, error: null }) }) }) };
        },
      }),
    } as unknown as SupabaseClient;
    return { writes, client };
  };

  it('확인 날짜는 칸이 있을 때만 같은 쓰기에 싣는다', async () => {
    const { writes, client } = fake();
    await updatePlace(client, place(), { address: '제주시 1' }, '2026-10-04T00:00:00.000Z');
    await updatePlace(client, place({ verified_at: null }), { address: '제주시 1' }, '2026-10-04T00:00:00.000Z');
    expect(writes).toEqual([{ address: '제주시 1' }, { address: '제주시 1', verified_at: '2026-10-04T00:00:00.000Z' }]);
  });

  it('사실 칸을 안 고친 저장은 확인 날짜를 찍지 않는다 — 소개 오타가 "오늘 확인" 이 되면 안 된다', async () => {
    const { writes, client } = fake();
    await updatePlace(client, place({ verified_at: null }), { name: '두부집', features: '고친 소개', category: '카페' }, '2026-10-04T00:00:00.000Z');
    expect(writes).toEqual([{ name: '두부집', features: '고친 소개', category: '카페' }]);
    expect(patchVerifies({ pet_policy_text: '10kg 이하', pet_policy: null })).toBe(true);
    expect(patchVerifies({ lat: 33.4, lng: 126.5 })).toBe(true);
    expect(patchVerifies({ stay_price_text: '1박 1만원' })).toBe(true);
    expect(patchVerifies({ homepage_url: 'https://a.kr', naver_place_id: '1' })).toBe(false);
  });
});

describe('renameRisksTwin', () => {
  it('좌표도 플레이스 id 도 없는 곳의 이름을 바꿀 때만 참이다', () => {
    const bare = place({ lat: null, lng: null, naver_place_id: null });
    expect(renameRisksTwin(bare, { ...placeEditDraft(bare), name: '새 이름' })).toBe(true);
    expect(renameRisksTwin(bare, placeEditDraft(bare))).toBe(false);
    expect(renameRisksTwin(bare, { ...placeEditDraft(bare), name: '새 이름', naverPlace: '1234567' })).toBe(false);
    const located = place({ lat: 33.4, lng: 126.5, naver_place_id: null });
    expect(renameRisksTwin(located, { ...placeEditDraft(located), name: '새 이름' })).toBe(false);
  });
});

describe('플레이스 id 를 지울 때의 링크', () => {
  it('사람이 넣은 단축 링크는 남긴다 — id 로 만든 링크만 함께 지운다', () => {
    const row = place({ naver_place_id: '1234567', naver_url: 'https://naver.me/abc' });
    expect(placeEditPatch(row, { ...placeEditDraft(row), naverPlace: '' })).toEqual({ naver_place_id: null });
  });
});

describe('전화번호 칸(07 P0)', () => {
  const withPhone = (phone: string | null = null) => place({ phone, verified_at: null });
  const typed = (row: TPlaceRow, phone: string) => ({ ...placeEditDraft(row), phone });

  it('칸이 없는 원격(마이그레이션 전)에서는 쓰기에도 목록에도 번호가 없다', () => {
    const row = place();
    expect(placeEditPatch(row, typed(row, '064-123-4567'))).toBeNull();
    expect(placeEditChanges(row, typed(row, '064-123-4567'))).toEqual([]);
  });

  it('손으로 적은 번호는 저장 때 접혀서 실린다 — 확인 날짜는 찍지 않는다', () => {
    const row = withPhone();
    const patch = placeEditPatch(row, typed(row, '064 123 4567'));
    expect(patch).toEqual({ phone: '064-123-4567' });
    expect(patchVerifies(patch!)).toBe(false);
    expect(placeEditChanges(row, typed(row, '064 123 4567'))).toEqual([
      { key: 'phone', label: '전화번호', before: '(비어 있음)', after: '064-123-4567' },
    ]);
  });

  it('이미 같은 번호면 쓰지 않는다 — 띄어쓰기만 다른 것도', () => {
    const row = withPhone('064-123-4567');
    expect(placeEditPatch(row, placeEditDraft(row))).toBeNull();
    expect(placeEditPatch(row, typed(row, '0641234567'))).toBeNull();
  });

  it('비우면 번호를 지운다(null)', () => {
    const row = withPhone('064-123-4567');
    expect(placeEditPatch(row, typed(row, ''))).toEqual({ phone: null });
  });

  it('읽을 수 없는 번호는 저장을 막는다', () => {
    const row = withPhone();
    expect(placeEditProblem(typed(row, '723-4567'))).toMatch(/전화번호/);
    expect(placeEditProblem(typed(row, '010-1234-5678'))).toBeNull();
  });
});

describe('placeEditPatch — 확인 방법(14 W261007.17)', () => {
  const withMethod = (over: Partial<TPlaceRow> = {}) => place({ verified_at: null, verified_method: null, ...over });

  it('확인 날짜가 찍히는 저장이면 고른 방법을 같은 쓰기에 싣는다', () => {
    const row = withMethod();
    const patch = placeEditPatch(row, { ...placeEditDraft(row), address: '제주 1', verifiedMethod: 'phone' });
    expect(patch).toEqual({ address: '제주 1', verified_method: 'phone' });
    expect(patchVerifies(patch!)).toBe(true);
  });

  it('고르지 않았으면 null 로 지운다 — 옛 날짜의 방법이 새 날짜에 남지 않는다', () => {
    const row = withMethod({ verified_method: 'visit' });
    expect(placeEditPatch(row, { ...placeEditDraft(row), address: '제주 1' })).toEqual({ address: '제주 1', verified_method: null });
  });

  it('초안은 저장된 방법을 물려받지 않는다', () => {
    expect(placeEditDraft(withMethod({ verified_method: 'visit' })).verifiedMethod).toBe('');
  });

  it('날짜를 안 찍는 저장(번호·소개)이나 칸이 없는 원격에는 싣지 않는다', () => {
    const row = withMethod({ phone: null });
    expect(placeEditPatch(row, { ...placeEditDraft(row), phone: '064-123-4567', verifiedMethod: 'phone' })).toEqual({ phone: '064-123-4567' });
    const noMethod = place({ verified_at: null });
    expect(placeEditPatch(noMethod, { ...placeEditDraft(noMethod), address: '제주 1', verifiedMethod: 'phone' })).toEqual({ address: '제주 1' });
  });
});
