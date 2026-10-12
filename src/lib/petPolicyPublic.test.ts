import { describe, expect, it } from 'vitest';
import { POLICY_TOPICS, policyFingerprint } from '../../scripts/lib/petPolicyGuide.mjs';
import type { TPetPolicyFacts } from '../types';
import { parsePetPolicy, toPetBadges, withPolicyFacts } from './petPolicy';
import { PLACES } from './places';
import { evidenceText, policyEvidence, publicGuide, publicNotes, publicPolicyLines } from './petPolicyPublic';

/** 모델이 아무것도 안 읽은 판단(추출 스키마 모양). 각 테스트가 필요한 칸만 덮어쓴다. */
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

/** 장소를 싣는 곳(`places.ts`)과 같은 길 — 정규식 판독 위에 원문 대조를 거친 AI 판단을 얹는다. */
const policyOf = (raw: string, over: Partial<TPetPolicyFacts>) => withPolicyFacts(parsePetPolicy(raw), { ...empty, ...over }, raw);
const textsOf = (raw: string, over: Partial<TPetPolicyFacts>) => publicPolicyLines(policyOf(raw, over)).map((line) => line.text);

describe('publicPolicyLines — 판단에서 만든 조건 문장', () => {
  // 일기초록(블로그) — 사이트에 "접종정보만 있으면 동반가능"(ysj-1017 글 그대로)이 나가던 곳.
  const ilgi = '반려동물동반가능\n접종정보만 있으면 동반가능';

  it('일기초록 판단 → "예방접종을 마친 강아지만 들어갈 수 있어요" · 원문 문장이 그대로 든 줄이 없다', () => {
    const lines = textsOf(ilgi, { vaccineRequired: true });
    expect(lines).toContain('예방접종을 마친 강아지만 들어갈 수 있어요');
    for (const line of lines) for (const sentence of ilgi.split('\n')) expect(line).not.toContain(sentence);
  });

  // 원문에 "10kg" 이 없는데 모델이 상한을 냈다(BUG-009 의 모양) — 대조가 뺀 숫자는 문장으로도 안 나온다.
  it('템플릿은 원문 대조를 거친 판단에서만 나온다 — 근거 없는 무게 상한은 줄이 없다', () => {
    const lines = textsOf('강아지 동반 가능해요. 소형견만 받아요', { weightLimitKg: 10, smallDogOnly: true });
    expect(lines).toEqual(['소형견만 같이 갈 수 있어요']);
  });

  it('줄마다 판단 칸 키가 붙고, 순서는 배지와 같다', () => {
    const raw = '야외 테라스만 가능, 리드줄 착용, 1마리당 1만원';
    const fee = { label: '1마리당 1만원', amountWon: 10000, basis: 'perDog' as const, minKg: null, maxKg: null, fromDog: null, perNight: false };
    const lines = publicPolicyLines(policyOf(raw, { indoor: 'outdoorOnly', leash: true, fees: [fee] }));
    expect(lines.map((line) => line.key)).toEqual(['indoor', 'fees', 'leash']);
  });

  /*
   * 칩과 문장이 같은 판단을 다르게 말하면 안 된다 — 경계(이하/미만)와 챙길 물건(케이지/가방/유모차)은 원문에서 읽는 값이라
   * 판단(facts)만 보고 문장을 만들면 칩과 갈린다.
   */
  it('무게 경계 · 챙길 물건이 배지와 같은 말이다', () => {
    const under = policyOf('10kg 미만 강아지만 가능해요', { weightLimitKg: 10 });
    expect(toPetBadges(under).map((b) => b.label)).toContain('10kg 미만');
    expect(publicPolicyLines(under).map((l) => l.text)).toContain('10kg 미만인 강아지만 같이 갈 수 있어요');

    const gear = policyOf('실내에서는 유모차/이동 가방 필요', { indoor: 'cage' });
    expect(toPetBadges(gear).map((b) => b.label)).toContain('가방·유모차 필요');
    expect(publicPolicyLines(gear).map((l) => l.text)).toContain('실내에서는 이동가방이나 유모차가 있어야 해요');

    // 쇠소깍한끼(블로그) — '개모차' 도 유모차다. 원문이 화면에서 빠진 뒤로 이 줄이 유일한 문장이다(21 S5.1).
    const gaemocha = policyOf('강아지는 개모차, 가방 출입 가능\n개모차, 혹은 가방 지참시 출입가능!', { indoor: 'cage' });
    expect(toPetBadges(gaemocha).map((b) => b.label)).toContain('가방·유모차 필요');
    expect(publicPolicyLines(gaemocha).map((l) => l.text)).toContain('실내에서는 이동가방이나 유모차가 있어야 해요');
  });

  it('크기는 배지처럼 한 줄 — 대형견 불가가 소형견만보다 먼저', () => {
    expect(textsOf('소형견만, 대형견은 불가해요', { smallDogOnly: true, largeDogOk: false })).toEqual(['대형견은 같이 갈 수 없어요']);
  });

  /*
   * 칸 짝: `POLICY_TOPICS` 의 키마다 그 칸이 서면 줄이 나와야 한다. 칸을 더하고 템플릿을 빠뜨리면(늘 null) 여기서 빠진 키가 보인다
   * (타입은 `satisfies` 가 막고, 이 테스트는 "줄을 안 만드는 템플릿" 을 막는다).
   */
  it('모든 판단 칸이 줄을 만들 수 있다', () => {
    const big = policyOf('실내 가능, 리드줄, 대형견 가능, 10kg 이하 2마리까지, 전화 문의, 접종 필수, 수요일만, 1마리당 1만원', {
      indoor: 'free',
      leash: true,
      largeDogOk: true,
      callFirst: true,
      vaccineRequired: true,
      petDays: ['수'],
      fees: [{ label: '1마리당 1만원', amountWon: 10000, basis: 'perDog', minKg: null, maxKg: null, fromDog: null, perNight: false }],
      weightLimitKg: 10,
      maxDogs: 2,
    });
    const small = policyOf('소형견만, 추가 요금 없어요', { smallDogOnly: true, feeFree: true });
    const keys = new Set([...publicPolicyLines(big), ...publicPolicyLines(small)].map((line) => line.key));
    expect([...keys].sort()).toEqual(Object.keys(POLICY_TOPICS).sort());
  });
});

describe('publicNotes — 가드를 지난 notes 한 줄', () => {
  it('원문 밖으로 나가지 않은 notes 는 그대로', () => {
    expect(publicNotes('입장할 때 접종 증명서를 보여 줘야 해요', '접종 증명서 지참하셔야 입장 가능해요')).toEqual({
      text: '입장할 때 접종 증명서를 보여 줘야 해요',
      reasons: [],
    });
  });

  it('원문을 베낀 notes 는 숨기고 이유를 낸다', () => {
    const raw = '애견 동반 시 반드시 배변봉투를 지참해 주시고 매너벨트 착용 부탁드려요';
    const r = publicNotes('반드시 배변봉투를 지참해 주시고 매너벨트 착용 부탁드려요', raw);
    expect(r.text).toBeNull();
    expect(r.reasons[0]).toMatch(/^원문을 그대로 옮겼어요/);
  });

  it('비었으면 숨기되 이유는 없다', () => {
    expect(publicNotes(null, '원문')).toEqual({ text: null, reasons: [] });
    expect(publicNotes('  ', '원문')).toEqual({ text: null, reasons: [] });
  });
});

describe('publicGuide — 쓴 시점의 판단과 지금 판단이 같을 때만', () => {
  const raw = '반려동물 동반 ( 야외 )\n카페 뒤 정원에 산책로가 있어서 강아지랑 한 바퀴 돌았어요';
  const facts: TPetPolicyFacts = { ...empty, indoor: 'outdoorOnly' };
  const guide = { text: '정원 산책로까지 같이 걸을 수 있어요', basis: policyFingerprint(facts) };

  it('지문이 맞고 가드를 지나면 문장', () => {
    expect(publicGuide(guide, facts, raw)).toEqual({ text: '정원 산책로까지 같이 걸을 수 있어요', reasons: [] });
  });

  // 운영자가 `/admin` 에서 판단을 고쳤다 — 안내는 지우지 않아도 지문이 어긋나 저절로 숨는다(S4).
  it('판단이 바뀌면 숨는다', () => {
    expect(publicGuide(guide, { ...facts, indoor: 'free' }, raw)).toEqual({ text: null, reasons: ['판단이 바뀌어 숨겼어요'] });
  });

  it('판단 주제를 말하는 안내는 지문이 맞아도 숨는다', () => {
    const r = publicGuide({ text: '주문할 때 예방접종 날짜를 물어봐요', basis: policyFingerprint(facts) }, facts, raw);
    expect(r.text).toBeNull();
    expect(r.reasons).toContain('판단 칸이 말하는 주제예요(접종)');
  });

  it('안내가 없으면 숨기되 이유는 없다', () => {
    expect(publicGuide(null, facts, raw)).toEqual({ text: null, reasons: [] });
    expect(publicGuide({ text: ' ', basis: policyFingerprint(facts) }, facts, raw)).toEqual({ text: null, reasons: [] });
  });
});

describe('policyEvidence — 상세 근거 칸에 원문을 그리나, 판단에서 만든 문장을 그리나(21 S5)', () => {
  const raw = '반려동물 동반 ( 야외 )\n카페 뒤 정원에 산책로가 있어서 강아지랑 한 바퀴 돌았어요';
  const facts: TPetPolicyFacts = { ...empty, indoor: 'outdoorOnly', notes: '정원 산책로는 강아지랑 같이 돌 수 있어요' };
  const placeOf = (over: Partial<Parameters<typeof policyEvidence>[0]> = {}) => ({
    petPolicyText: raw,
    petPolicy: facts,
    policy: policyOf(raw, facts),
    ...over,
  });

  it('원문 공개(시드)면 원문 그대로', () => {
    expect(policyEvidence(placeOf({ petPolicyTextPublic: true }))).toEqual({ kind: 'raw', text: raw });
  });

  // 칸을 빠뜨린 입구(키 없음)가 새지 않는 쪽으로 넘어진다 — `false` 와 같다.
  it('공개 키가 없으면 숨김 — 판단 줄과 notes', () => {
    for (const petPolicyTextPublic of [undefined, false]) {
      expect(policyEvidence(placeOf({ petPolicyTextPublic }))).toEqual({
        kind: 'derived',
        lines: ['야외 자리에서만 같이 있을 수 있어요'],
        note: '정원 산책로는 강아지랑 같이 돌 수 있어요',
      });
    }
  });

  it('안내가 있으면 notes 대신 안내 — 판단이 바뀌면 notes 로 내려간다', () => {
    const petPolicyGuide = { text: '정원 산책로까지 같이 걸을 수 있어요', basis: policyFingerprint(facts) };
    expect(policyEvidence(placeOf({ petPolicyGuide }))).toMatchObject({ note: '정원 산책로까지 같이 걸을 수 있어요' });
    // 운영자가 판단을 고쳤다(`/admin`) — 안내는 지문이 어긋나 숨고, 고친 판단의 notes 가 선다.
    expect(policyEvidence(placeOf({ petPolicyGuide, petPolicy: { ...facts, leash: true } }))).toMatchObject({
      note: '정원 산책로는 강아지랑 같이 돌 수 있어요',
    });
  });

  it('템플릿 줄이 없는 곳은 빈 칸 대신 상태 한 줄', () => {
    const generic = '애견동반 가능해요';
    expect(policyEvidence({ petPolicyText: generic, policy: parsePetPolicy(generic) })).toMatchObject({
      lines: ['반려견과 같이 갈 수 있다고만 적혀 있어요'],
    });
    const denied = '반려동물 동반 불가';
    expect(policyEvidence({ petPolicyText: denied, policy: parsePetPolicy(denied) })).toMatchObject({
      lines: ['반려견 동반이 안 된다고 적혀 있어요'],
    });
    // 아무 칸도 못 읽고 notes 만 남은 판단 — 판정 C7("원문을 확인해 주세요")과 같은 말.
    const odd = '사장님께 여쭤보면 상황에 따라 다르대요';
    const unread = { ...empty, notes: '상황에 따라 달라요' };
    expect(policyEvidence({ petPolicyText: odd, petPolicy: unread, policy: policyOf(odd, unread) })).toMatchObject({
      lines: ['조건을 자동으로 정리하지 못했어요. 원문에서 확인해 주세요'],
    });
  });

  it('evidenceText — 화면에 나가는 글(배지가 요금 줄 중복을 대 보는 글)', () => {
    expect(evidenceText({ kind: 'raw', text: raw })).toBe(raw);
    expect(evidenceText({ kind: 'derived', lines: ['가', '나'], note: null })).toBe('가\n나');
    expect(evidenceText({ kind: 'derived', lines: ['가'], note: '다' })).toBe('가\n다');
  });

  // S5 수용의 기계판 — 지금 스냅샷의 비공개 행(블로그 출처) 어디서도 원문 15자 이음이 화면 글에 없다.
  // `pnpm data pull` 뒤 깨지면 먼저 볼 것: 블로거가 우리 템플릿 문장과 글자가 같은 문장을 썼는가("예방접종을 마친 강아지만 들어갈 수 있어요").
  // 그건 베낌이 아니다 — `areaGroups` 고정 수처럼 데이터가 바뀌어 깨지는 테스트다.
  it('스냅샷의 비공개 행은 원문 문장을 옮기지 않는다', () => {
    const squash = (s: string) => s.replace(/\s+/g, '');
    const hidden = PLACES.filter((place) => !place.petPolicyTextPublic);
    expect(hidden.length).toBeGreaterThan(0);
    for (const place of hidden) {
      const evidence = policyEvidence(place);
      expect(evidence.kind).toBe('derived');
      const shown = squash(evidenceText(evidence));
      const source = squash(place.petPolicyText);
      for (let i = 0; i + 15 <= source.length; i += 1) {
        expect(shown, `${place.name}: "${source.slice(i, i + 15)}"`).not.toContain(source.slice(i, i + 15));
      }
    }
  });
});
