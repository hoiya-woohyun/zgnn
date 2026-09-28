import { describe, expect, it } from 'vitest';
import places from '../../src/data/places.json' with { type: 'json' };
import {
  distanceMeters,
  matchPlace,
  NAME_PARTIAL_MIN_CHARS,
  nameSimilarity,
  normalizeName,
  splitAliases,
  THRESHOLD,
  townOf,
  WEIGHT,
} from './matchPlace.mjs';

const byName = (n) => places.find((p) => p.name === n);

/** 기존 장소를 "블로그에서 온 후보" 로 바꾼다 — AI 추출이 주는 것과 같은 필드만(이름·좌표·종류). naverPlaceId 는 블로그엔 없다. */
const asCandidate = (p) => ({ name: p.name, geo: p.geo, type: p.type });

describe('normalizeName / splitAliases', () => {
  it('접두·접미 "카페" 와 공백을 지운다', () => {
    expect(normalizeName('카페 살레')).toBe('살레');
    expect(normalizeName('살레카페')).toBe('살레');
    expect(normalizeName('평대코지카페')).toBe('평대코지');
  });
  it('접사는 앞뒤에서만 뗀다 — 가운데 "제주" 는 이름의 일부', () => {
    expect(normalizeName('오늘도제주 애월오제')).toBe('오늘도제주애월오제');
    expect(normalizeName('제주돈까스')).toBe('돈까스');
    expect(normalizeName('브릭스제주')).toBe('브릭스');
    expect(normalizeName('디어마이프렌즈 제주')).toBe('디어마이프렌즈');
  });
  it('접사가 겹쳐 붙어도 다 벗긴다 — "카페 ○○ 제주점"', () => {
    expect(normalizeName('카페 살레 제주점')).toBe('살레');
    expect(normalizeName('형제도식당본점')).toBe('형제도식당');
  });
  it('이름 전체가 접사면 빈 문자열로 만들지 않는다', () => {
    expect(normalizeName('카페')).toBe('카페');
    expect(normalizeName('제주')).toBe('제주');
  });
  it('기호는 전부 지우되 글자·숫자는 남긴다', () => {
    expect(normalizeName('캄 : Kalm')).toBe('캄kalm');
    expect(normalizeName('13월봄')).toBe('13월봄');
    expect(normalizeName('백화stay')).toBe('백화stay');
  });
  it('괄호 별칭을 따로 뽑는다', () => {
    expect(splitAliases('평대반점(바당반점)')).toEqual(['평대반점', '바당반점']);
  });
});

describe('nameSimilarity', () => {
  it('별칭 어느 쪽과도 일치하면 1', () => {
    expect(nameSimilarity('바당반점', '평대반점(바당반점)')).toBe(1);
    expect(nameSimilarity('살레', '카페살레')).toBe(1);
  });
  it('18m 이웃이지만 이름은 다르다 — 이름 신호는 0', () => {
    expect(nameSimilarity('평대반점(바당반점)', '평대코지카페')).toBe(0);
  });
  it('한쪽이 다른 쪽을 포함하면 0.7 — 블로그가 "협재고기부엌" 을 "고기부엌" 으로 줄여 쓸 때', () => {
    expect(nameSimilarity('고기부엌', '협재고기부엌')).toBe(0.7);
    expect(nameSimilarity('무거버거 함덕점', '무거버거')).toBe(0.7);
  });
  it('지점 접미는 벗기지 않는다 — "A 애월점" 과 "A 함덕점" 은 다른 가게(체인). "제주점" 접사만 벗겨 "올드패션제주" 와 같은 키가 된다', () => {
    expect(nameSimilarity('카페A 애월점', '카페A 함덕점')).toBe(0);
    expect(normalizeName('올드패션 제주점')).toBe(normalizeName('올드패션제주'));
  });
  it(`부분 일치는 짧은 쪽이 ${NAME_PARTIAL_MIN_CHARS}자 이상일 때만`, () => {
    expect(nameSimilarity('가'.repeat(NAME_PARTIAL_MIN_CHARS - 1), '가'.repeat(NAME_PARTIAL_MIN_CHARS + 3))).toBe(0);
    expect(nameSimilarity('가'.repeat(NAME_PARTIAL_MIN_CHARS), '가'.repeat(NAME_PARTIAL_MIN_CHARS + 3))).toBe(0.7);
  });
});

describe('distanceMeters — 실제 데이터의 함정 쌍', () => {
  it('평대반점 ↔ 평대코지카페 는 20m 안', () => {
    expect(distanceMeters(byName('평대반점(바당반점)').geo, byName('평대코지카페').geo)).toBeLessThan(20);
  });
  it('제이아일랜드 ↔ 아오오 는 50m 안', () => {
    expect(distanceMeters(byName('제이아일랜드').geo, byName('아오오').geo)).toBeLessThan(50);
  });
});

describe('townOf', () => {
  it('주소에서 읍·면 하나를 뽑는다', () => {
    expect(townOf('제주 제주시 구좌읍 해맞이해안로 1140 1층')).toBe('구좌읍');
    expect(townOf('제주 제주시 우도면 우도해안길 816 1,2층')).toBe('우도면');
    expect(townOf('우도면')).toBe('우도면');
  });
  it('"면"·"읍" 으로 끝나는 가게 이름은 읍·면이 아니다 — 목록에 없는 건 안 잡는다 (리뷰에서 재현된 함덕해물라면)', () => {
    expect(townOf('제주 제주시 평사길 2 1층 함덕해물라면')).toBeNull();
    expect(townOf('구좌읍내식당')).toBe('구좌읍');
  });
  it('AI 가 준 regionRaw("동쪽 (성산읍)") 에서도 읍·면을 읽는다 — 좌표·주소 없는 후보의 유일한 지역 신호', () => {
    expect(townOf('동쪽 (성산읍)')).toBe('성산읍');
  });
  it('시 단위나 "○○동로" 같은 길 이름은 읍·면이 아니다', () => {
    expect(townOf('제주 서귀포시 소보리당로 200')).toBeNull();
    expect(townOf('제주 제주시 탑동로11길 6 2층')).toBeNull();
    expect(townOf('서귀포시')).toBeNull();
    expect(townOf(undefined)).toBeNull();
  });
});

/*
 * 기대값은 "이렇게 판정돼야 데이터가 안 썩는다" 를 적은 것이다 — 임계값·가중치를 바꾸면 기대값도 같이 손본다.
 */
describe('matchPlace — 실제 86곳으로', () => {

  it('점수는 소수 둘째 자리 — 0.7 − 0.3 이 0.3999… 로 ASK 아래에 떨어지지 않는다', () => {
    const salle = byName('카페살레');
    const far = { lat: salle.geo.lat + 0.5, lng: salle.geo.lng }; // 55km
    const r = matchPlace({ name: '카페살레', geo: far, type: 'cafe' }, places);
    expect(r.confidence).toBe(0.7);
    const r2 = matchPlace({ name: '살레', geo: far, type: 'restaurant', address: '제주 서귀포시 성산읍 1' }, places);
    expect(Number.isInteger(r2.confidence * 100)).toBe(true);
  });
  it('naverPlaceId 가 같으면 이름이 달라도 확실', () => {
    const r = matchPlace({ name: '전혀다른이름', naverPlaceId: byName('솔숲펜션').naverPlaceId }, places);
    expect(r.match?.id).toBe(byName('솔숲펜션').id);
    expect(r.confidence).toBe(1);
  });
  it('naverPlaceId 는 숫자로 와도 문자열과 같게 본다', () => {
    const r = matchPlace({ name: '전혀다른이름', naverPlaceId: Number(byName('솔숲펜션').naverPlaceId) }, places);
    expect(r.match?.id).toBe(byName('솔숲펜션').id);
  });
  it('좌표만 가깝고 이름이 다르면 병합하지 않는다 (평대반점 옆 평대코지카페)', () => {
    const r = matchPlace({ name: '평대코지카페', geo: byName('평대반점(바당반점)').geo, type: 'cafe' }, places);
    expect(r.match?.id).toBe(byName('평대코지카페').id);
  });
  it('이름 신호가 0 이면 좌표가 18m 여도 후보가 아니다 — confidence 0, 대신 이웃을 reason 에 적는다', () => {
    const r = matchPlace({ name: '완전히모르는이름', geo: byName('평대반점(바당반점)').geo, type: 'restaurant' }, places);
    expect(r.match).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.reason).toContain('평대반점(바당반점)');
  });
  it('별칭으로 온 이름을 잡는다', () => {
    const r = matchPlace({ name: '바당반점', type: 'restaurant' }, places);
    expect(r.match?.id).toBe(byName('평대반점(바당반점)').id);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
  });
  it('좌표 없는 기존 장소(요호르기 스테이)도 이름으로 잡는다', () => {
    const r = matchPlace({ name: '요호르기스테이', type: 'stay' }, places);
    expect(r.match?.id).toBe(byName('요호르기 스테이').id);
  });
  it('모르는 가게는 null', () => {
    const r = matchPlace({ name: '존재하지않는가게', geo: { lat: 33.4, lng: 126.5 } }, places);
    expect(r.match).toBeNull();
    expect(r.confidence).toBeLessThan(THRESHOLD.ASK);
  });
  it('reason 은 사람이 읽는 한 줄 — 신호가 차례로 적힌다', () => {
    const r = matchPlace({ ...asCandidate(byName('카페살레')), address: '제주 제주시 우도면 우도해안길 816' }, places);
    expect(r.reason).toBe('이름 일치 · 거리 0m · 지역 일치(우도면)');
  });
});

describe('matchPlace — 자기충돌 검사 (86곳)', () => {
  it('자기 자신은 1.0', () => {
    for (const p of places) {
      const r = matchPlace(asCandidate(p), places);
      expect(r.match?.id, p.name).toBe(p.id);
      expect(r.confidence, p.name).toBe(1);
    }
  });
  it('서로 다른 장소끼리 ASK 를 넘는 쌍이 없다 — 깨지면 임계값 대신 nameSimilarity 를 조인다', () => {
    const collisions = [];
    for (const p of places) {
      const others = places.filter((q) => q.id !== p.id);
      const r = matchPlace(asCandidate(p), others);
      if (r.confidence >= THRESHOLD.ASK) collisions.push(`${p.name} → ${r.match?.name} (${r.confidence}, ${r.reason})`);
    }
    expect(collisions).toEqual([]);
  });
});

describe('matchPlace — 같은 이름, 다른 곳 (우도 vs 본섬)', () => {
  const salle = byName('카페살레'); // 우도
  const mainland = byName('아오오').geo; // 성산, 우도에서 16km

  it('이름은 같은데 좌표가 2km 밖이면 병합하지 않고 사람에게 묻는다', () => {
    const r = matchPlace({ name: '카페 살레', geo: mainland, type: 'cafe' }, places);
    expect(r.match?.id).toBe(salle.id);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD.ASK);
    expect(r.confidence).toBeLessThan(THRESHOLD.AUTO_MERGE);
    expect(r.reason).toContain('멀다');
  });
  it('주소도 좌표도 없고 AI regionRaw 만 있어도 우도 vs 본섬을 가른다', () => {
    const r = matchPlace({ name: '살레', type: 'cafe', regionRaw: '동쪽 (성산읍)' }, places);
    expect(r.match?.id).toBe(salle.id);
    expect(r.confidence).toBeLessThan(THRESHOLD.AUTO_MERGE);
    expect(r.reason).toContain('지역 다름(성산읍≠우도면)');
  });
  it('시내 장소(region.town 이 제주시)엔 지역 가점이 붙지 않는다 — 읍·면만 신호', () => {
    const city = places.find((p) => p.region.town === '제주시');
    const r = matchPlace({ name: city.name, type: city.type, address: '제주 제주시 아무동 1' }, places);
    expect(r.match?.id).toBe(city.id);
    expect(r.reason).not.toContain('지역 일치');
  });
  it('좌표는 없고 주소의 읍·면만 다를 때도 묻는다 — 좌표 없는 후보에서 우도를 가르는 유일한 신호', () => {
    const r = matchPlace({ name: '살레', type: 'cafe', address: '제주 서귀포시 성산읍 일출로 1' }, places);
    expect(r.match?.id).toBe(salle.id);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD.ASK);
    expect(r.confidence).toBeLessThan(THRESHOLD.AUTO_MERGE);
    expect(r.reason).toContain('지역 다름(성산읍≠우도면)');
  });
  it('좌표가 우도 안이면 자동 병합', () => {
    const r = matchPlace({ name: '살레', geo: salle.geo, type: 'cafe' }, places);
    expect(r.match?.id).toBe(salle.id);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
  });
  it('100m~2km 사이는 판단 보류 — 이름 일치만으로 병합', () => {
    const onoff = byName('온오프'); // 카페살레에서 341m
    const r = matchPlace({ name: '카페살레', geo: onoff.geo, type: 'cafe' }, places);
    expect(r.match?.id).toBe(salle.id);
    expect(r.confidence).toBe(1);
    expect(r.reason).not.toContain('멀다');
  });
});

describe('matchPlace — 좌표 없는 기존 장소 5곳', () => {
  const NO_GEO = ['요호르기 스테이', '미트타운', '개떼목장', '브릭스제주', '롯지먼트'];

  it('데이터에 좌표 없는 곳이 정확히 이 5곳이다 — 바뀌면 이 절을 손본다', () => {
    expect(places.filter((p) => !p.geo).map((p) => p.name)).toEqual(NO_GEO);
  });
  it('후보에 좌표가 있어도 기존에 없으면 거리 신호를 건너뛴다(감점 없음) — 이름만으로 병합', () => {
    for (const name of NO_GEO) {
      const p = byName(name);
      const r = matchPlace({ name, geo: { lat: 33.45, lng: 126.4 }, type: p.type }, places);
      expect(r.match?.id, name).toBe(p.id);
      expect(r.confidence, name).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
      expect(r.reason, name).toContain('좌표 없음');
    }
  });
  it('블로그식 표기("브릭스 카페", "롯지먼트 제주")도 잡는다', () => {
    expect(matchPlace({ name: '브릭스 카페', type: 'cafe' }, places).match?.id).toBe(byName('브릭스제주').id);
    expect(matchPlace({ name: '롯지먼트 제주', type: 'cafe' }, places).match?.id).toBe(byName('롯지먼트').id);
    expect(matchPlace({ name: '개떼 목장', type: 'cafe' }, places).match?.id).toBe(byName('개떼목장').id);
  });
});

describe('matchPlace — 종류·부분 일치 보정', () => {
  it('이름이 완전히 같으면 종류가 달라도 병합 — 블로그의 종류 추정은 틀릴 수 있다', () => {
    const r = matchPlace({ name: '평대반점', type: 'cafe' }, places);
    expect(r.match?.id).toBe(byName('평대반점(바당반점)').id);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
    expect(r.reason).toContain('종류 다름(cafe≠restaurant)');
  });
  it("종류가 'other' 면 비교하지 않는다", () => {
    const r = matchPlace({ name: '평대반점', type: 'other' }, places);
    expect(r.confidence).toBe(1);
    expect(r.reason).not.toContain('종류');
  });
  it('부분 일치 + 종류 다름은 사람에게 묻는다', () => {
    const r = matchPlace({ name: '고기부엌', type: 'cafe' }, places);
    expect(r.match?.id).toBe(byName('협재고기부엌').id);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD.ASK);
    expect(r.confidence).toBeLessThan(THRESHOLD.AUTO_MERGE);
  });
  it('부분 일치라도 100m 안이면 병합', () => {
    const r = matchPlace({ name: '고기부엌', geo: byName('협재고기부엌').geo, type: 'restaurant' }, places);
    expect(r.match?.id).toBe(byName('협재고기부엌').id);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
  });
  it('부분 일치 + 2km 밖 + 지역 다름은 신규로 떨어진다 — 임계값 미만이어도 reason 에 어디와 비교했는지 남긴다', () => {
    const r = matchPlace(
      { name: '고기부엌', geo: byName('아오오').geo, type: 'cafe', address: '제주 서귀포시 성산읍 환해장성로 75' },
      places,
    );
    expect(r.match).toBeNull();
    expect(r.confidence).toBeLessThan(THRESHOLD.ASK);
    expect(r.reason).toContain('협재고기부엌');
  });
  it('WEIGHT 의 값이 만드는 구간이 문서(주석)와 같다 — 값을 바꾸면 주석도 같이', () => {
    expect(1 + WEIGHT.GEO_FAR_PENALTY).toBeGreaterThanOrEqual(THRESHOLD.ASK);
    expect(1 + WEIGHT.GEO_FAR_PENALTY).toBeLessThan(THRESHOLD.AUTO_MERGE);
    expect(0.7 + WEIGHT.GEO_NEAR_BONUS).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
    expect(0.7 + WEIGHT.TYPE_MISMATCH_PENALTY).toBeLessThan(THRESHOLD.AUTO_MERGE);
  });
});
