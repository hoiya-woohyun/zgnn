import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TPlaceRow } from './adminCandidates';
import {
  placeCurrentText,
  placeEditChanges,
  placeEditDraft,
  placeEditPatch,
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
