import { describe, expect, it } from 'vitest';
import places from '../../src/data/places.json' with { type: 'json' };
import {
  AUTO_APPROVE,
  DEFAULT_LIMIT,
  formatCandidateLine,
  formatSummary,
  isPlaceCandidate,
  parseArgs,
  resolveRegionRaw,
  tierOf,
  toCandidateRow,
  toMatchCandidate,
} from './analyzeCandidates.mjs';
import { matchPlace, THRESHOLD } from './matchPlace.mjs';
import { toRecheckCandidate } from './applyApproved.mjs';

const post = { url: 'https://blog.naver.com/someone/223000000001', title: '제주 동쪽 강아지 동반 여행', keyword: '제주 강아지 동반 카페' };

/** extractPlaces 가 주는 모양(TExtractedPlace). */
const extracted = {
  name: '솔숲펜션',
  type: 'stay',
  regionRaw: null,
  address: null,
  petPolicyText: '1~5kg 1만원',
  features: '마당이 넓다',
  isJeju: true,
  evidence: ['마당에서 불멍을 했어요'],
  confidence: 0.9,
};

/** pickKakaoPlace 가 주는 모양. 솔숲펜션의 실제 좌표(places.json)에서 몇 m 옆. */
const kakao = {
  lat: 33.51119,
  lng: 126.84885,
  address: '제주 제주시 구좌읍 충렬로 141-15',
  kakaoPlaceUrl: 'https://place.map.kakao.com/123',
  category: '펜션',
};

describe('parseArgs', () => {
  it('인자가 없으면 기본 limit · dry-run 아님', () => {
    expect(parseArgs([])).toEqual({ limit: DEFAULT_LIMIT, dryRun: false });
  });
  it('--limit N 과 --limit=N 둘 다 받고, --dry-run 은 어디에 있어도 된다', () => {
    expect(parseArgs(['--limit', '5', '--dry-run'])).toEqual({ limit: 5, dryRun: true });
    expect(parseArgs(['--dry-run', '--limit=20'])).toEqual({ limit: 20, dryRun: true });
  });
  it('limit 이 없거나 0·음수·문자면 throw — 오타로 전체를 돌리지 않게', () => {
    expect(() => parseArgs(['--limit'])).toThrow('--limit');
    expect(() => parseArgs(['--limit', '0'])).toThrow('--limit');
    expect(() => parseArgs(['--limit=abc'])).toThrow('--limit');
  });
  it('모르는 인자는 throw', () => {
    expect(() => parseArgs(['--dryrun'])).toThrow('알 수 없는 인자');
  });
});

describe('isPlaceCandidate', () => {
  it('제주 소재 + stay/restaurant/cafe 만 후보', () => {
    expect(isPlaceCandidate(extracted)).toBe(true);
    expect(isPlaceCandidate({ ...extracted, type: 'other' })).toBe(false);
    expect(isPlaceCandidate({ ...extracted, isJeju: false })).toBe(false);
    expect(isPlaceCandidate(null)).toBe(false);
  });
});

describe('resolveRegionRaw', () => {
  it('주소에서 읍·면이 잡히면 AI 의 regionRaw 가 있어도 주소 기반이 이긴다', () => {
    expect(resolveRegionRaw('제주 제주시 구좌읍 충렬로 141-15', '서쪽 (애월읍)', places)).toBe('동쪽 (구좌읍)');
  });
  it('주소로 못 정하면(inferRegionRaw 가 "") AI 값으로 물러선다', () => {
    // 안덕면은 기존 데이터에서 남쪽 1 · 서쪽 1 로 갈려 inferRegionRaw 가 '' 를 준다.
    expect(resolveRegionRaw('제주 서귀포시 안덕면 어딘가 1', '남쪽 (안덕면)', places)).toBe('남쪽 (안덕면)');
  });
  it('AI 값에 읍·면이 있으면 기존 표기("동쪽 (구좌읍)")로 다시 만든다 — 형식이 틀려도 지역 신호를 잃지 않는다', () => {
    expect(resolveRegionRaw(null, '동쪽 구좌읍', places)).toBe('동쪽 (구좌읍)');
    expect(resolveRegionRaw(null, '구좌읍', places)).toBe('동쪽 (구좌읍)');
    expect(resolveRegionRaw(null, '동쪽 (구좌읍)', places)).toBe('동쪽 (구좌읍)');
    // 우도는 방향 없이 '우도면' — "동쪽 (우도면)" 을 통과시키면 앱의 '동쪽' 필터에 우도가 들어간다(리뷰 지적)
    expect(resolveRegionRaw(null, '동쪽 (우도면)', places)).toBe('우도면');
    expect(resolveRegionRaw(null, '우도면', places)).toBe('우도면');
  });
  it('읍·면이 없는 AI 값은 parseRegion 이 방향을 읽을 수 있을 때만 — 아니면 null (화면에서 unknown 이 되는 걸 막는다)', () => {
    expect(resolveRegionRaw(null, '동쪽', places)).toBeNull();
    expect(resolveRegionRaw(null, '제주 어딘가', places)).toBeNull();
    expect(resolveRegionRaw(null, '우도', places)).toBe('우도');
    // 기존 데이터에 없는 읍·면(추자면)은 형식이 맞을 때만 그대로
    expect(resolveRegionRaw(null, '북쪽 (추자면)', places)).toBe('북쪽 (추자면)');
    expect(resolveRegionRaw(null, '추자면', places)).toBeNull();
  });
  it('toMatchCandidate 는 AI regionRaw 를 넘긴다 — 주소·좌표 없는 후보의 지역 신호', () => {
    expect(toMatchCandidate({ name: 'x', type: 'cafe', regionRaw: '동쪽 (성산읍)' }, null).regionRaw).toBe('동쪽 (성산읍)');
    expect(toMatchCandidate({ name: 'x', type: 'cafe', regionRaw: null }, null).regionRaw).toBeUndefined();
  });
  it('주소가 없으면 AI 값, 그것도 없으면 null', () => {
    expect(resolveRegionRaw(null, '우도면', places)).toBe('우도면');
    expect(resolveRegionRaw(null, null, places)).toBeNull();
    expect(resolveRegionRaw(undefined, undefined, places)).toBeNull();
  });
});

describe('tierOf', () => {
  it('THRESHOLD 그대로 — AUTO_MERGE 이상 auto · ASK 이상 ask · 그 아래 new', () => {
    const match = places[0];
    expect(tierOf({ match, confidence: THRESHOLD.AUTO_MERGE })).toBe('auto');
    expect(tierOf({ match, confidence: THRESHOLD.AUTO_MERGE - 0.01 })).toBe('ask');
    expect(tierOf({ match, confidence: THRESHOLD.ASK })).toBe('ask');
    expect(tierOf({ match, confidence: THRESHOLD.ASK - 0.01 })).toBe('new');
  });
  it('match 가 null 이면 confidence 와 무관하게 new', () => {
    expect(tierOf({ match: null, confidence: 1 })).toBe('new');
    expect(tierOf(null)).toBe('new');
  });
});

describe('toMatchCandidate', () => {
  it('Kakao 좌표·주소를 쓰고, 없는 값은 undefined 로 둔다(matchPlace 가 그 신호를 건너뛰게)', () => {
    expect(toMatchCandidate(extracted, kakao)).toEqual({ name: '솔숲펜션', type: 'stay', geo: { lat: kakao.lat, lng: kakao.lng }, address: kakao.address });
    expect(toMatchCandidate(extracted, null)).toEqual({ name: '솔숲펜션', type: 'stay', geo: undefined, address: undefined });
  });
  it('Kakao 가 없으면 본문 주소로 물러선다', () => {
    expect(toMatchCandidate({ ...extracted, address: '제주 제주시 구좌읍 어딘가' }, null).address).toBe('제주 제주시 구좌읍 어딘가');
  });
});

describe('toCandidateRow — candidates.extracted 는 applyApproved.mjs 가 읽는 계약', () => {
  const matchedAuto = matchPlace(toMatchCandidate(extracted, kakao), places);

  it('실제 86곳과 대조하면 솔숲펜션 + 옆 좌표는 auto 다(전제 확인)', () => {
    expect(matchedAuto.match?.name).toBe('솔숲펜션');
    expect(matchedAuto.confidence).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
  });

  it('auto 도 기본은 pending(AUTO_APPROVE=false) · tier 가 auto, match_place_id 는 기존 장소 id, extracted 에 geo·kakaoPlaceUrl·category·regionRaw·match 가 모두 있다', () => {
    const row = toCandidateRow(post, extracted, kakao, '동쪽 (구좌읍)', matchedAuto);
    expect(row.post_url).toBe(post.url);
    expect(AUTO_APPROVE).toBe(false);
    expect(row.status).toBe('pending');
    expect(row.extracted.match.tier).toBe('auto');
    expect(row.match_place_id).toBe(matchedAuto.match.id);
    expect(row.match_confidence).toBe(matchedAuto.confidence);
    expect(row.extracted).toEqual({
      ...extracted,
      address: kakao.address,
      geo: { lat: kakao.lat, lng: kakao.lng },
      kakaoPlaceUrl: kakao.kakaoPlaceUrl,
      category: '펜션',
      regionRawAi: extracted.regionRaw ?? null,
      regionRaw: '동쪽 (구좌읍)',
      match: { confidence: matchedAuto.confidence, reason: matchedAuto.reason, tier: 'auto' },
    });
  });

  it('Kakao 가 없으면 geo·kakaoPlaceUrl·category 는 null 이고 address 는 본문 값(없으면 null)', () => {
    const matched = { match: null, confidence: 0, reason: '이름이 맞는 기존 장소 없음' };
    const row = toCandidateRow(post, { ...extracted, name: '없던가게' }, null, null, matched);
    expect(row.extracted.geo).toBeNull();
    expect(row.extracted.kakaoPlaceUrl).toBeNull();
    expect(row.extracted.category).toBeNull();
    expect(row.extracted.address).toBeNull();
    expect(row.extracted.regionRaw).toBeNull();
    const withAddress = toCandidateRow(post, { ...extracted, name: '없던가게', address: '제주 어딘가' }, null, null, matched);
    expect(withAddress.extracted.address).toBe('제주 어딘가');
  });

  it('ask → pending 이지만 match_place_id 는 붙는다(사람이 확인할 단서)', () => {
    const match = places.find((p) => p.name === '카페살레');
    const matched = { match, confidence: 0.7, reason: '이름 일치 · 거리 16.6km (멀다)' };
    const row = toCandidateRow(post, { ...extracted, name: '카페살레', type: 'cafe' }, null, null, matched);
    expect(row.status).toBe('pending');
    expect(row.match_place_id).toBe(match.id);
    expect(row.extracted.match.tier).toBe('ask');
  });

  it('new → pending, match_place_id null, confidence 는 그대로 기록', () => {
    const matched = { match: null, confidence: 0.3, reason: '이름 부분 일치 → 임계값 미만(어딘가)' };
    const row = toCandidateRow(post, { ...extracted, name: '새가게' }, null, null, matched);
    expect(row.status).toBe('pending');
    expect(row.match_place_id).toBeNull();
    expect(row.match_confidence).toBe(0.3);
    expect(row.extracted.match.tier).toBe('new');
  });

  it('원본 extracted 객체를 바꾸지 않는다', () => {
    const original = { ...extracted };
    toCandidateRow(post, extracted, kakao, '동쪽 (구좌읍)', matchedAuto);
    expect(extracted).toEqual(original);
  });
});

describe('로그 형식 — 본문 인용은 싣지 않는다', () => {
  it('formatCandidateLine 은 이름·종류·구간·confidence·짝·이유만 담고 evidence·petPolicyText 는 없다', () => {
    const matched = { match: places[0], confidence: 0.92, reason: '이름 일치 · 거리 40m' };
    const row = toCandidateRow(post, extracted, kakao, null, matched);
    const line = formatCandidateLine(row, places[0].name);
    expect(line).toBe(`후보 솔숲펜션 (stay) 일치 0.92 → ${places[0].name} · 이름 일치 · 거리 40m`);
    expect(line).not.toContain('불멍');
    expect(line).not.toContain('1만원');
  });
  it('신규는 짝 없이', () => {
    const row = toCandidateRow(post, extracted, null, null, { match: null, confidence: 0, reason: '이름이 맞는 기존 장소 없음' });
    expect(formatCandidateLine(row)).toBe('후보 솔숲펜션 (stay) 신규 0.00 · 이름이 맞는 기존 장소 없음');
  });
  it('formatSummary 는 한 줄, dry-run 이면 접두어', () => {
    const stats = { analyzed: 3, skipped: 1, candidates: 4, auto: 1, ask: 2, new: 1 };
    expect(formatSummary({ ...stats, dropped: 2 }, 'x')).toContain('건너뜀 1 · 분석불가 2)');
    expect(formatSummary(stats, 'Claude 3회 · 입력 100 · 출력 50 · 캐시 읽기 0 · 캐시 쓰기 0 토큰')).toBe(
      '분석 3건 (후보 4 · 일치 1 · 확인요청 2 · 신규 1 · 건너뜀 1) · Claude 3회 · 입력 100 · 출력 50 · 캐시 읽기 0 · 캐시 쓰기 0 토큰',
    );
    expect(formatSummary(stats, 'x', { dryRun: true })).toMatch(/^\[dry-run\] 분석 3건/);
  });
});


describe('분석 ↔ 반영 계약 — matchPlace 가 분석 때 본 지역 신호를 apply 의 재대조도 본다', () => {
  it('AI regionRaw 가 형식이 틀려도("성산읍") 분석·재대조의 confidence 가 같다 — 사람이 신규로 비운 ask 후보가 우도 동명 가게로 합쳐지지 않는다', () => {
    for (const ai of ['성산읍', '동쪽 성산읍', '동쪽 (성산읍)']) {
      const ex = { name: '카페살레', type: 'cafe', regionRaw: ai, address: null, petPolicyText: '소형견 가능', features: 'x', isJeju: true, evidence: ['x'], confidence: 0.9 };
      const regionRaw = resolveRegionRaw(null, ex.regionRaw, places);
      const analyzeTime = matchPlace(toMatchCandidate(ex, null), places);
      const row = toCandidateRow({ url: 'u' }, ex, null, regionRaw, analyzeTime);
      const applyTime = matchPlace(toRecheckCandidate({ id: 'c', post_url: 'u', extracted: row.extracted, match_place_id: null }), places);
      expect(applyTime.confidence, ai).toBe(analyzeTime.confidence);
      expect(analyzeTime.confidence, ai).toBeLessThan(THRESHOLD.AUTO_MERGE);
      expect(row.extracted.regionRaw, ai).toBe('동쪽 (성산읍)');
    }
  });
});
