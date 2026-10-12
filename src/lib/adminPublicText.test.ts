/**
 * `/admin` 의 「사이트에 나갈 문장」 미리보기(21 S6). 요점은 **사이트와 같은 문장**이다 — 시드 전부에서 `policyEvidence(PLACES_BY_ID)` 와 같아야 하고,
 * 안 나가는 안내·notes 의 이유는 사이트가 안 그리는 이유와 같은 가드에서 나온다.
 */
import { describe, expect, it } from 'vitest';
import { policyFingerprint } from '../../scripts/lib/petPolicyGuide.mjs';
import placesJson from '../data/places.json';
import type { TPetPolicyFacts, TPlace } from '../types';
import type { TCandidateExtracted, TCandidateRow, TPlaceRow } from './adminCandidates';
import { newPlacePublicText, overwritePublicText, patchPublicText, publicTextPreview, rowPublicText, siteTextVoice } from './adminPublicText';
import { policyEvidence } from './petPolicyPublic';
import { PLACES_BY_ID } from './places';

const facts: TPetPolicyFacts = {
  indoor: 'unknown',
  leash: false,
  largeDogOk: null,
  smallDogOnly: false,
  callFirst: false,
  vaccineRequired: true,
  petDays: null,
  feeFree: null,
  fees: [],
  weightLimitKg: null,
  maxDogs: null,
  notes: null,
};

// 합성 — 일기초록 모양의 블로그 원문.
const RAW = '반려동물동반가능\n접종정보만 있으면 동반가능';
const GUIDE = '함께 방문하기 좋은 조용한 곳이에요';

/** 안내가 판단과 맞는(지문이 같은) 블로그 행 — 비공개. */
const blogRow = (over: Partial<TPlaceRow> = {}): TPlaceRow =>
  ({
    id: 'p1',
    type: 'cafe',
    name: '합성카페',
    region_raw: '동쪽 (구좌읍)',
    features: '',
    pet_policy_text: RAW,
    pet_policy: facts,
    pet_policy_text_public: false,
    pet_policy_guide: { text: GUIDE, basis: policyFingerprint(facts) },
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
    source: 'blog',
    ...over,
  }) as unknown as TPlaceRow;

describe('publicTextPreview — 사이트와 같은 문장', () => {
  it('시드 전부에서 evidence 가 사이트의 policyEvidence 와 같다', () => {
    for (const place of placesJson as unknown as TPlace[]) {
      expect(publicTextPreview(place).evidence).toEqual(policyEvidence(PLACES_BY_ID.get(place.id)!));
    }
  });
});

describe('hidden — 안 나가는 안내·notes 와 이유', () => {
  it('안내·notes 가 없으면 hidden 이 빈 배열', () => {
    const preview = rowPublicText(blogRow({ pet_policy_guide: null }));
    expect(preview.evidence.kind).toBe('derived');
    expect(preview.hidden).toEqual([]);
  });

  it('지문이 어긋난 안내 → 판단이 바뀌어 숨겼어요', () => {
    const preview = rowPublicText(blogRow({ pet_policy_guide: { text: GUIDE, basis: policyFingerprint({ ...facts, leash: true }) } }));
    expect(preview.hidden).toHaveLength(1);
    expect(preview.hidden[0]).toMatchObject({ key: 'guide', label: '이용 안내', text: GUIDE });
    expect(preview.hidden[0].reasons).toContain('판단이 바뀌어 숨겼어요');
    expect(preview.evidence).toMatchObject({ kind: 'derived', note: null });
  });

  it('지문이 맞는 안내가 나가면 notes 는 이용 안내가 대신 나가요', () => {
    const preview = rowPublicText(blogRow({ pet_policy: { ...facts, notes: '얌전한 강아지와 오세요' }, pet_policy_guide: { text: GUIDE, basis: policyFingerprint({ ...facts, notes: '얌전한 강아지와 오세요' }) } }));
    expect(preview.evidence).toMatchObject({ kind: 'derived', note: GUIDE });
    expect(preview.hidden).toEqual([{ key: 'notes', label: '그 밖의 조건', text: '얌전한 강아지와 오세요', reasons: ['이용 안내가 대신 나가요'] }]);
  });

  it('원문 15자 이상을 베낀 notes → 원문을 그대로 옮겼어요', () => {
    const preview = rowPublicText(blogRow({ pet_policy: { ...facts, notes: '반려동물동반가능 접종정보만 있으면 동반가능' }, pet_policy_guide: null }));
    expect(preview.hidden).toHaveLength(1);
    expect(preview.hidden[0].key).toBe('notes');
    expect(preview.hidden[0].reasons.join(' ')).toContain('원문을 그대로 옮겼어요');
  });

  it('가드를 지나는 notes 는 그대로 나가 hidden 이 아니다', () => {
    const preview = rowPublicText(blogRow({ pet_policy: { ...facts, notes: '얌전한 강아지와 오세요' }, pet_policy_guide: null }));
    expect(preview.evidence).toMatchObject({ kind: 'derived', note: '얌전한 강아지와 오세요' });
    expect(preview.hidden).toEqual([]);
  });

  it('원문 공개(raw) 행은 안내·notes 둘 다 raw 문구', () => {
    const preview = rowPublicText(blogRow({ pet_policy_text_public: true, pet_policy: { ...facts, notes: '얌전한 강아지와 오세요' } }));
    expect(preview.evidence).toEqual({ kind: 'raw', text: RAW });
    expect(preview.hidden.map((h) => [h.key, h.reasons])).toEqual([
      ['guide', ['원문을 그대로 내보내는 곳이라 안 나가요']],
      ['notes', ['원문을 그대로 내보내는 곳이라 안 나가요']],
    ]);
  });
});

describe('newPlacePublicText — 신규 묶음', () => {
  const candidate = (over: Partial<TCandidateExtracted> = {}): TCandidateRow =>
    ({
      id: 'c1',
      post_url: 'https://blog.example/1',
      extracted: {
        name: '합성카페',
        type: 'cafe',
        regionRaw: null,
        address: null,
        petPolicyText: RAW,
        petPolicy: facts,
        petPolicyGuide: { text: GUIDE, basis: policyFingerprint(facts) },
        ...over,
      },
      match_place_id: null,
    }) as unknown as TCandidateRow;

  it('지역 없음·종류 other 후보도 던지지 않고 derived · 안내(basis 맞음)가 실린다', () => {
    const preview = newPlacePublicText(candidate({ type: 'other', regionRaw: null, name: '' }));
    expect(preview.evidence).toMatchObject({ kind: 'derived', note: GUIDE });
    expect(preview.hidden).toEqual([]);
  });

  it('원문 없는 후보는 판단·안내가 빠진다(toNewPlaceRow 규칙 그대로)', () => {
    const preview = newPlacePublicText(candidate({ petPolicyText: null }));
    expect(preview.evidence).toMatchObject({ kind: 'derived', note: null });
    expect(preview.hidden).toEqual([]);
  });
});

describe('patchPublicText', () => {
  const seedRow = blogRow({ pet_policy_text_public: true, pet_policy_guide: null });

  it('공개 시드 행 + 원문 공개 끄기 → raw → derived, changed', () => {
    const change = patchPublicText(seedRow, { pet_policy_text_public: false });
    expect(change.before.evidence.kind).toBe('raw');
    expect(change.after.evidence.kind).toBe('derived');
    expect(change.changed).toBe(true);
  });

  it('patch 가 null 이면 changed false · after = before', () => {
    const change = patchPublicText(seedRow, null);
    expect(change.changed).toBe(false);
    expect(change.after).toBe(change.before);
  });

  it('판단만 바꾼 patch 면 안내가 hidden 으로 옮겨 간다(판단이 바뀌어 숨김)', () => {
    const change = patchPublicText(blogRow(), { pet_policy: { ...facts, leash: true } });
    expect(change.before.evidence).toMatchObject({ note: GUIDE });
    expect(change.before.hidden).toEqual([]);
    expect(change.after.hidden[0].reasons).toContain('판단이 바뀌어 숨겼어요');
    expect(change.changed).toBe(true);
  });
});

describe('overwritePublicText', () => {
  it('picked 에 조건 칸이 없으면 after = before', () => {
    const extracted = { name: '합성카페', type: 'cafe', regionRaw: '동쪽 (구좌읍)', address: null, petPolicyText: '새 원문이에요', petPolicy: { ...facts, leash: true }, features: '새 소개' } as unknown as TCandidateExtracted;
    const change = overwritePublicText(blogRow(), extracted, ['features']);
    expect(change.changed).toBe(false);
    expect(change.after.evidence).toEqual(change.before.evidence);
  });
});

describe('siteTextVoice', () => {
  it('원문 공개 칸이 true 일 때만 family', () => {
    expect(siteTextVoice({ pet_policy_text_public: true })).toBe('family');
    expect(siteTextVoice({ pet_policy_text_public: false })).toBe('blog');
    expect(siteTextVoice({})).toBe('blog');
  });
});
