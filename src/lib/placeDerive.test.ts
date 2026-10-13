/**
 * 21 S8 — 판정 입력을 빌드(`toSnapshotRow`, 비공개 행)에서 만들어도 런타임에서 만든 것과 같은가, 그리고 빌드 결과에 원문이 없는가.
 *
 * 합성 행의 문장은 우리가 쓴 것이다(블로그 문장이 아니다 — PUBLIC 레포). 실데이터 비공개 행의 대조는 gitignored 원문 캐시
 * (`data/raw/places-source.json`, `pnpm data pull` 이 남긴다)가 있을 때만 돈다 — 새 worktree·CI 에서는 건너뛴다.
 */

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { fromPlaceRow } from '../../scripts/lib/placeFields.mjs';
import { policyFingerprint } from '../../scripts/lib/petPolicyGuide.mjs';
import placesJson from '../data/places.json';
import type { TFeeRule, TPetPolicyFacts, TPlace } from '../types';
import { publicTextPreview } from './adminPublicText';
import { cageGear, parsePetPolicy } from './petPolicy';
import { evidenceText, policyEvidence } from './petPolicyPublic';
import { toPlaceEntry, toSnapshotRow, type TPlaceSnapshotRow } from './placeDerive';
import { placesVerdictView } from './placesVerdictView';

const CACHE = new URL('../../data/raw/places-source.json', import.meta.url);
const SNAPSHOT = new URL('../data/places.json', import.meta.url);
const hasCache = existsSync(CACHE);

/** 빌드 길: 조립 → JSON 직렬화(places.json) → 읽기. */
const viaSnapshot = (place: TPlace): TPlaceSnapshotRow => JSON.parse(JSON.stringify(toSnapshotRow(place)));
const squash = (s: string) => s.replace(/\s+/g, '');
/** 원문의 공백 뺀 15자 이음이 `hay` 에 있으면 그 조각들. */
const copiedRuns = (raw: string, hay: string): string[] => {
  const source = squash(raw);
  const target = squash(hay);
  const runs: string[] = [];
  for (let i = 0; i + 15 <= source.length; i += 1) if (target.includes(source.slice(i, i + 15))) runs.push(source.slice(i, i + 15));
  return runs;
};

const empty: TPetPolicyFacts = {
  indoor: 'unknown',
  leash: false,
  largeDogOk: null,
  smallDogOnly: false,
  callFirst: false,
  vaccineRequired: false,
  petDays: null,
  feeFree: null,
  fees: [],
  weightLimitKg: null,
  maxDogs: null,
  notes: null,
};

const fee = (label: string, amountWon: number, perNight = false): TFeeRule => ({
  label,
  amountWon,
  basis: 'perDog',
  minKg: null,
  maxKg: null,
  fromDog: null,
  perNight,
});

const blog = (name: string, petPolicyText: string, facts: Partial<TPetPolicyFacts> | null, over: Partial<TPlace> = {}): TPlace => ({
  id: `derive-${name}`,
  type: 'cafe',
  name,
  region: { direction: 'east', town: '구좌읍', raw: '동쪽 (구좌읍)' },
  features: '',
  petPolicyText,
  images: [],
  ...(facts ? { petPolicy: { ...empty, ...facts } } : {}),
  ...over,
});

const NOTES_OK = '주말 오후에는 자리가 금방 차요';
const COPIED = '카페 앞마당 잔디밭에서 강아지가 한참 뛰어놀았어요';
const guided = { ...empty, indoor: 'free' as const };

/** 갈래마다 하나 — 판정·배지·근거 칸·요금 단위·환경이 빌드 길과 런타임 길에서 같아야 한다. */
const SYNTHETIC: TPlace[] = [
  blog('가방-다음문장', '실내에도 같이 들어갈 수 있었어요.\n강아지는 이동가방에 넣어 무릎에 두었어요.', { indoor: 'cage' }),
  blog('개모차', '개모차 지참하면 실내 출입 가능해요', { indoor: 'cage' }),
  blog('notes-통과', '실내 동반 가능해요', { indoor: 'free', notes: NOTES_OK }),
  blog('notes-베낌', `실내 동반 가능해요\n${COPIED}`, { indoor: 'free', notes: COPIED }),
  blog('안내-맞음', '실내 동반 가능해요', guided, { petPolicyGuide: { text: '창가 자리가 넓어서 쉬기 좋아요', basis: policyFingerprint(guided) } }),
  blog('안내-낡음', '실내 동반 가능해요', { ...guided, notes: NOTES_OK }, { petPolicyGuide: { text: '창가 자리가 넓어서 쉬기 좋아요', basis: 'old' } }),
  blog('숙소-1박당', '반려견 1박당 2만원이에요. 독채라 마당에서 놀기 좋아요', { fees: [fee('1마리당 2만원', 20000)] }, {
    type: 'stay',
    features: '독채 · 마당',
    stay: { price: { text: '' }, amenitiesText: '배변패드' },
  }),
  blog('숙소-단위없음', '강아지 한 마리에 3만원 받아요', { fees: [fee('1마리당 3만원', 30000)] }, {
    type: 'stay',
    stay: { price: { text: '' }, amenitiesText: '' },
  }),
  blog('무게-미만', '10kg 미만 강아지만 들어갈 수 있어요', { weightLimitKg: 10 }),
  blog('못읽음', '사장님 말로는 그날그날 다르대요', { notes: '날마다 달라요' }),
  blog('일반허용', '애견동반 가능해요!', {}),
  blog('요금있음', '강아지는 요금이 따로 있어요', { feeFree: false }),
  blog('요일', '수요일에만 반려견 동반이 돼요', { petDays: ['수'] }),
  blog('확인함-식당', '애견동반 가능해요!', {}, { type: 'restaurant', verifiedAt: '2026-10-01' }),
  // 판단 없는 비공개 행(정규식 길)은 요금 줄이 원문 **문장**이다(`feeLines`) — 판정·배지가 쓰므로 지우지 못한다. 지금 비공개 행은 전부 AI 판단이
  // 있어(요금 줄 = 20자 이내 label) 실데이터엔 없는 모양이고, 요금이 따로 선 줄로 둔다.
  blog('판단없음', '실내 가능\n리드줄 필수\n1마리당 1만원', null),
];

describe('toSnapshotRow — 공개 행은 그대로', () => {
  it('places.json 의 원문 공개 행은 바이트가 같다', () => {
    const rows = (placesJson as unknown as TPlaceSnapshotRow[]).filter((row) => 'petPolicyText' in row && row.petPolicyTextPublic === true);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(JSON.stringify(toSnapshotRow(row as TPlace), null, 1)).toBe(JSON.stringify(row, null, 1));
  });
});

describe('빌드 길 ≡ 런타임 길', () => {
  it.each(SYNTHETIC.map((place) => [place.name, place] as const))('합성 %s', (_name, place) => {
    expect(placesVerdictView(toPlaceEntry(viaSnapshot(place)))).toBe(placesVerdictView(toPlaceEntry(place)));
  });

  // 공개 행(시드)을 비공개로 바꿔 같은 비교 — 정규식 길 전부를 덮고, 캐시 없이 늘 돈다.
  it('시드를 비공개로 돌려도 판정·근거 칸이 같다', () => {
    const seeds = (placesJson as unknown as TPlace[]).filter((row) => row.petPolicyTextPublic === true);
    for (const seed of seeds) {
      const place = { ...seed, petPolicyTextPublic: undefined };
      expect(placesVerdictView(toPlaceEntry(viaSnapshot(place))), seed.name).toBe(placesVerdictView(toPlaceEntry(place)));
    }
  });

  it('가방·유모차 판독은 근거 문장이 지워져도 남는다', () => {
    const [bag, stroller] = SYNTHETIC;
    expect(cageGear(toPlaceEntry(viaSnapshot(bag)).policy)).toEqual({ bag: true, stroller: false });
    expect(cageGear(toPlaceEntry(viaSnapshot(stroller)).policy)).toEqual({ bag: false, stroller: true });
    // 판독 칸이 있으면 글을 다시 읽지 않는다.
    expect(cageGear({ ...parsePetPolicy('케이지 필수'), indoorGear: { bag: true, stroller: false } })).toEqual({ bag: true, stroller: false });
  });

  it('근거 칸 밑 한 줄 — 가드를 지난 notes · 맞는 안내만 실린다', () => {
    const note = (name: string) => toPlaceEntry(viaSnapshot(SYNTHETIC.find((p) => p.name === name)!)).policyNote;
    expect(note('notes-통과')).toBe(NOTES_OK);
    expect(note('notes-베낌')).toBeNull();
    expect(note('안내-맞음')).toBe('창가 자리가 넓어서 쉬기 좋아요');
    expect(note('안내-낡음')).toBe(NOTES_OK);
  });

  it('요금 단위 — 원문이 말하면 끈다, 아니면 붙인다', () => {
    const unit = (name: string) => toPlaceEntry(viaSnapshot(SYNTHETIC.find((p) => p.name === name)!)).feeUnitStated;
    expect(unit('숙소-1박당')).toBe(true);
    expect(unit('숙소-단위없음')).toBe(false);
  });
});

describe('비공개 출력에 원문이 없다', () => {
  const privates = [...SYNTHETIC, ...(placesJson as unknown as TPlace[]).filter((row) => row.petPolicyTextPublic === true).map((row) => ({ ...row, petPolicyTextPublic: undefined }))];

  it('원문·판단·안내 키가 없고 정책에 근거 문장 칸이 없다', () => {
    for (const place of privates) {
      const row = toSnapshotRow(place) as Record<string, unknown>;
      for (const key of ['petPolicyText', 'petPolicy', 'petPolicyGuide', 'petPolicyTextPublic']) expect(row, `${place.name} ${key}`).not.toHaveProperty(key);
      const { policy } = (row as { derived: { policy: Record<string, unknown> & { tiers: Record<string, unknown>[] } } }).derived;
      expect(policy.sources).toEqual({});
      expect(policy).not.toHaveProperty('indoorGearText');
      expect(policy).not.toHaveProperty('feeText');
      expect(policy.tiers.filter((tier) => 'source' in tier)).toEqual([]);
    }
  });

  // 합성 행만 — 시드를 비공개로 돌린 행은 판단이 없어 요금 줄이 원문 문장이다(`판단없음` 주석). 실데이터는 캐시 블록이 본다.
  it('직렬화한 행에 원문 15자 이음이 없다', () => {
    for (const place of SYNTHETIC) {
      expect(copiedRuns(place.petPolicyText, JSON.stringify(toSnapshotRow(place))), place.name).toEqual([]);
    }
  });
});

describe('/admin 미리보기 ≡ 빌드 → 사이트(S6 메모의 결합)', () => {
  const dbRow = (place: TPlace) => ({
    id: place.id,
    type: place.type,
    name: place.name,
    region_raw: place.region.raw,
    features: place.features,
    pet_policy_text: place.petPolicyText,
    pet_policy: place.petPolicy ?? null,
    pet_policy_text_public: false,
    pet_policy_guide: place.petPolicyGuide ?? null,
    review_url: null,
    naver_url: null,
    naver_place_id: null,
    lat: null,
    lng: null,
    address: null,
    category: null,
    stay_price_text: place.stay?.price.text ?? null,
    stay_amenities_text: place.stay?.amenitiesText ?? null,
    sort: null,
    status: 'published',
    source: 'blog',
  });

  it.each(SYNTHETIC.map((place) => [place.name, place] as const))('합성 %s', (_name, place) => {
    const fromDb = fromPlaceRow(dbRow(place)) as TPlace;
    expect(publicTextPreview(fromDb).evidence).toEqual(policyEvidence(toPlaceEntry(viaSnapshot(fromDb))));
  });
});

describe.skipIf(!hasCache)('원문 캐시가 있을 때 — 실데이터 비공개 행', () => {
  const cache = (hasCache ? JSON.parse(readFileSync(CACHE, 'utf8')) : []) as TPlace[];
  const privates = cache.filter((place) => place.petPolicyTextPublic !== true);

  it('커밋된 places.json 이 캐시를 다시 계산한 값과 같다(다르면 `pnpm data pull --offline`)', () => {
    const committed = readFileSync(SNAPSHOT, 'utf8');
    expect(JSON.stringify(cache.map(toSnapshotRow), null, 1) === committed, 'places.json 이 낡았다 — `pnpm data pull --offline` 으로 다시 계산').toBe(true);
  });

  it('빌드 길 ≡ 런타임 길 · /admin ≡ 사이트', () => {
    for (const place of privates) {
      expect(placesVerdictView(toPlaceEntry(viaSnapshot(place))), place.name).toBe(placesVerdictView(toPlaceEntry(place)));
      expect(publicTextPreview(place).evidence, place.name).toEqual(policyEvidence(toPlaceEntry(viaSnapshot(place))));
    }
  });

  // S5 수용의 기계판 — 비공개 행의 화면 글(근거 칸)에 원문 15자 이음이 없다. 깨지면 먼저 볼 것: 블로거가 우리 템플릿 문장과 글자가 같은
  // 문장을 썼는가("예방접종을 마친 강아지만 들어갈 수 있어요") — 그건 베낌이 아니다.
  it('비공개 행의 화면 글·스냅샷 행에 원문 문장이 없다', () => {
    for (const place of privates) {
      const entry = toPlaceEntry(viaSnapshot(place));
      expect(copiedRuns(place.petPolicyText, evidenceText(policyEvidence(entry))), place.name).toEqual([]);
      expect(copiedRuns(place.petPolicyText, JSON.stringify(toSnapshotRow(place))), place.name).toEqual([]);
    }
  });
});
