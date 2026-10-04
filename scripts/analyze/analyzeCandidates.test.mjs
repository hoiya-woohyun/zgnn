import { describe, expect, it } from 'vitest';
import places from '../../src/data/places.json' with { type: 'json' };
import {
  AUTO_APPROVE,
  DEFAULT_LIMIT,
  DEFAULT_MAX_PER_BLOG,
  EDITED_NOTE,
  blockFor,
  blockUntilLabel,
  editedKey,
  editedKeysFor,
  exclusionReason,
  formatCandidateLine,
  formatSummary,
  isBlocked,
  isPlaceCandidate,
  keyGate,
  kindOf,
  parseArgs,
  pickPostsForRun,
  resolveRegionRaw,
  skipAsExisting,
  tierOf,
  toCandidateRow,
  toMatchCandidate,
  toPostAnalysis,
} from './analyzeCandidates.mjs';
import { EDITED_NOTE as EDITED_NOTE_TS } from '../../src/lib/adminApply';
import { matchPlace, normalizeName, THRESHOLD } from './matchPlace.mjs';
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

/** pickNaverPlace 가 주는 모양. 솔숲펜션의 실제 좌표(places.json)에서 몇 m 옆. */
const local = {
  lat: 33.51119,
  lng: 126.84885,
  address: '제주 제주시 구좌읍 충렬로 141-15',
  naverLink: 'https://map.naver.com/p/entry/place/123',
  category: '펜션',
};

describe('parseArgs', () => {
  it('인자가 없으면 기본 limit · dry-run 아님', () => {
    expect(parseArgs([])).toEqual({ limit: DEFAULT_LIMIT, dryRun: false, dump: null, maxPerBlog: DEFAULT_MAX_PER_BLOG, noGeo: false, noVerify: false, noPropose: false, noHomepage: false });
  });
  it('--limit N 과 --limit=N 둘 다 받고, --dry-run 은 어디에 있어도 된다', () => {
    expect(parseArgs(['--limit', '5', '--dry-run'])).toEqual({ limit: 5, dryRun: true, dump: null, maxPerBlog: DEFAULT_MAX_PER_BLOG, noGeo: false, noVerify: false, noPropose: false, noHomepage: false });
    expect(parseArgs(['--dry-run', '--limit=20'])).toEqual({ limit: 20, dryRun: true, dump: null, maxPerBlog: DEFAULT_MAX_PER_BLOG, noGeo: false, noVerify: false, noPropose: false, noHomepage: false });
    expect(parseArgs(['--no-geo']).noGeo).toBe(true);
    expect(parseArgs(['--no-verify']).noVerify).toBe(true);
    expect(parseArgs(['--no-propose']).noPropose).toBe(true);
    expect(parseArgs(['--no-homepage']).noHomepage).toBe(true);
  });
  it('--dump 는 기본 경로(빈 문자열), --dump=경로 는 그 경로 · --max-per-blog 는 0 도 된다(상한 없음)', () => {
    expect(parseArgs(['--dump']).dump).toBe('');
    expect(parseArgs(['--dump=/tmp/x.json']).dump).toBe('/tmp/x.json');
    expect(parseArgs(['--max-per-blog', '0']).maxPerBlog).toBe(0);
    expect(parseArgs(['--max-per-blog=5']).maxPerBlog).toBe(5);
    expect(() => parseArgs(['--max-per-blog', '-1'])).toThrow();
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

describe('keyGate', () => {
  it('env 에 있으면 그대로 · 사람 터미널이면 묻는다', () => {
    expect(keyGate('search', { hasKeys: true, noGeo: false, canPrompt: false })).toBe('use');
    expect(keyGate('search', { hasKeys: false, noGeo: false, canPrompt: true })).toBe('ask');
    expect(keyGate('map', { hasKeys: false, noGeo: false, canPrompt: true })).toBe('ask');
  });

  /*
   * 두 축의 세기가 갈리는 한 줄. 이름 축이 없으면 좌표 없이 대조하게 되고 동명 가게가 ask 대신 auto 로 올라간다 —
   * 2026-09-28 에 키 없이 돌린 첫 실행이 좌표 0건으로 141묶음을 만들고 통째로 버려졌다.
   */
  it('물을 수 없을 때 — 이름 축은 멈추고 주소 축은 진행한다', () => {
    expect(keyGate('search', { hasKeys: false, noGeo: false, canPrompt: false })).toBe('stop');
    expect(keyGate('map', { hasKeys: false, noGeo: false, canPrompt: false })).toBe('skip');
  });

  it('--no-geo 는 묻지도 세우지도 않는다 — 사람이 좌표 없이 돌리겠다고 말한 것', () => {
    for (const axis of ['search', 'map']) {
      expect(keyGate(axis, { hasKeys: false, noGeo: true, canPrompt: true })).toBe('skip');
      expect(keyGate(axis, { hasKeys: true, noGeo: true, canPrompt: false })).toBe('skip');
    }
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

/**
 * 이 네 갈래가 전부 필요한 이유는 하나씩 다르다 — 셋은 **막으면 길이 끊기는** 경우다.
 * 게시된 곳만 막고, draft(초안을 올리는 유일한 길) · archived(재개업을 아는 유일한 신호) · 미상(모르는 것)은 남긴다.
 */
describe('skipAsExisting — 이미 게시된 곳이면 후보를 만들지 않는다', () => {
  const at = (status) => ({ match: { ...places[0], status }, confidence: THRESHOLD.AUTO_MERGE });

  it('auto + published 면 막는다', () => {
    expect(skipAsExisting(at('published'))).toBe(true);
  });
  it('auto 라도 draft 면 남긴다 — 그 승인이 초안을 게시로 올리는 유일한 길이다', () => {
    expect(skipAsExisting(at('draft'))).toBe(false);
  });
  it('auto 라도 archived 면 남긴다 — 내린 가게가 다시 열렸다는 유일한 신호다', () => {
    expect(skipAsExisting(at('archived'))).toBe(false);
  });
  it('status 를 모르면 남긴다 — 모르는 것을 "이미 있다" 로 읽으면 후보가 조용히 사라진다', () => {
    expect(skipAsExisting({ match: places[0], confidence: THRESHOLD.AUTO_MERGE })).toBe(false);
  });
  it('auto 가 아니면 상태와 무관하게 남긴다 — ask·new 는 사람이 볼 것이다', () => {
    expect(skipAsExisting({ match: { ...places[0], status: 'published' }, confidence: THRESHOLD.ASK })).toBe(false);
    expect(skipAsExisting({ match: null, confidence: 1 })).toBe(false);
    expect(skipAsExisting(null)).toBe(false);
  });
});

/**
 * 차이 게이트(docs/todo/11 U1) — 게시된 곳을 쓴 글은 사이트와 다른 말을 할 때만 후보가 된다.
 * 사실 비교의 세부는 siteChanges.test.mjs, 여기는 종류·제외 갈래.
 */
describe('kindOf — 신규 · 보강 · 갱신 · 확인', () => {
  const policy = { indoor: 'free', leash: false, largeDogOk: true, smallDogOnly: false, callFirst: false, feeFree: true, weightLimitKg: null, maxDogs: null, notes: null };
  const row = {
    id: 'p1', type: 'cafe', name: '솔숲카페', region_raw: '동쪽 (구좌읍)', address: '제주 제주시 구좌읍 1', lat: 33.5, lng: 126.8,
    features: '사람이 쓴 소개', pet_policy_text: '대형견 가능, 실내 동반', pet_policy: policy, category: '카페', review_url: 'x',
    naver_place_id: null, naver_url: null, homepage_url: 'https://a.com/', homepage_name: 'a', homepage_image: null, verified_at: null,
  };
  const sameX = { name: '솔숲카페', type: 'cafe', petPolicyText: '대형견도 실내 가능', petPolicy: policy, visited: true, verify: null };
  const auto = (status) => ({ match: { id: 'p1', name: '솔숲카페', status }, confidence: THRESHOLD.AUTO_MERGE });

  it('같은 말 → 후보 없음(sameAsSite)', () => {
    expect(kindOf(auto('published'), sameX, row)).toMatchObject({ kind: 'fill', exclude: 'sameAsSite' });
    expect(skipAsExisting(auto('published'), sameX, row)).toBe(true);
  });
  it('빈 칸만 채운다 → fill', () => {
    expect(kindOf(auto('published'), { ...sameX, category: '카페' }, { ...row, category: null })).toMatchObject({ kind: 'fill', exclude: null, fills: ['category'] });
  });
  it('찬 칸과 다른 사실 → update', () => {
    const r = kindOf(auto('published'), { ...sameX, petPolicy: { ...policy, largeDogOk: false } }, row);
    expect(r).toMatchObject({ kind: 'update', exclude: null, changes: ['pet_policy_text'] });
    expect(skipAsExisting(auto('published'), { ...sameX, petPolicy: { ...policy, largeDogOk: false } }, row)).toBe(false);
  });
  const differ = { ...sameX, petPolicy: { ...policy, largeDogOk: false } };
  it('목록글이 다른 말을 하면 → 제외(weak)', () => {
    expect(kindOf(auto('published'), { ...differ, visited: false }, row).exclude).toBe('weak');
  });
  it('교차점검 "동반 근거 없음" 은 weak · "동반 불가 정황" 은 다른 칸이 없어도 update', () => {
    expect(kindOf(auto('published'), { ...differ, verify: { petAllowedHere: 'unknown', dogWasThere: false } }, row).exclude).toBe('weak');
    expect(kindOf(auto('published'), { ...sameX, verify: { petAllowedHere: 'no', dogWasThere: false } }, row)).toMatchObject({ kind: 'update', exclude: null });
  });
  it('추출이 동반 불가(petAllowed no)를 읽으면 다른 칸이 없어도 update · 옛 글·목록글이면 여전히 제외', () => {
    const denied = { ...sameX, petAllowed: 'no' };
    expect(kindOf(auto('published'), denied, row)).toMatchObject({ kind: 'update', exclude: null });
    expect(kindOf(auto('published'), { ...denied, visited: false }, row).exclude).toBe('weak');
    expect(kindOf(auto('published'), denied, { ...row, verified_at: '2026-09-20' }, { postedAt: '2026-01-01' }).exclude).toBe('stale');
  });
  it('글 날짜 < verified_at → stale · verified_at 이 없으면 update', () => {
    const verified = { ...row, verified_at: '2026-09-20T00:00:00Z' };
    expect(kindOf(auto('published'), differ, verified, { postedAt: '2026-08-01T00:00:00Z' }).exclude).toBe('stale');
    expect(kindOf(auto('published'), differ, verified, { postedAt: '2026-09-25T00:00:00Z' }).exclude).toBeNull();
    expect(kindOf(auto('published'), differ, row, { postedAt: '2024-01-01T00:00:00Z' })).toMatchObject({ kind: 'update', exclude: null });
  });
  it('같은 말이면 날짜와 무관하게 sameAsSite(가장 많이 알려 주는 이유)', () => {
    expect(kindOf(auto('published'), sameX, { ...row, verified_at: '2026-09-20T00:00:00Z' }, { postedAt: '2026-01-01' }).exclude).toBe('sameAsSite');
  });
  it('archived · draft · 상태 미상 짝은 늘 후보 — 종류만 붙는다', () => {
    expect(kindOf(auto('archived'), sameX, row)).toMatchObject({ kind: 'fill', exclude: null });
    expect(kindOf(auto('draft'), differ, row)).toMatchObject({ kind: 'update', exclude: null });
    expect(kindOf(auto(undefined), sameX, row).exclude).toBeNull();
  });
  it('짝 행이 없으면 거르지 않는다 · ask·new 는 그대로', () => {
    expect(kindOf(auto('published'), sameX, null)).toMatchObject({ kind: 'fill', exclude: null });
    expect(kindOf({ match: { id: 'p1', status: 'published' }, confidence: THRESHOLD.ASK }, sameX, row)).toMatchObject({ kind: 'ask', exclude: null });
    expect(kindOf({ match: null, confidence: 0 }, sameX, row)).toMatchObject({ kind: 'new', exclude: null });
  });
});

describe('toMatchCandidate', () => {
  it('네이버 좌표·주소를 쓰고, 없는 값은 undefined 로 둔다(matchPlace 가 그 신호를 건너뛰게)', () => {
    expect(toMatchCandidate(extracted, local)).toEqual({ name: '솔숲펜션', type: 'stay', geo: { lat: local.lat, lng: local.lng }, address: local.address });
    expect(toMatchCandidate(extracted, null)).toEqual({ name: '솔숲펜션', type: 'stay', geo: undefined, address: undefined });
  });
  it('네이버가 없으면 본문 주소로 물러선다', () => {
    expect(toMatchCandidate({ ...extracted, address: '제주 제주시 구좌읍 어딘가' }, null).address).toBe('제주 제주시 구좌읍 어딘가');
  });
});

describe('toCandidateRow — candidates.extracted 는 applyApproved.mjs 가 읽는 계약', () => {
  const matchedAuto = matchPlace(toMatchCandidate(extracted, local), places);

  it('실제 86곳과 대조하면 솔숲펜션 + 옆 좌표는 auto 다(전제 확인)', () => {
    expect(matchedAuto.match?.name).toBe('솔숲펜션');
    expect(matchedAuto.confidence).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
  });

  it('auto 도 기본은 pending(AUTO_APPROVE=false) · tier 가 auto, match_place_id 는 기존 장소 id, extracted 에 geo·geoSource·naverLink·category·regionRaw·match 가 모두 있다', () => {
    const row = toCandidateRow(post, extracted, local, '동쪽 (구좌읍)', matchedAuto);
    expect(row.post_url).toBe(post.url);
    expect(AUTO_APPROVE).toBe(false);
    expect(row.status).toBe('pending');
    expect(row.extracted.match.tier).toBe('auto');
    expect(row.match_place_id).toBe(matchedAuto.match.id);
    expect(row.match_confidence).toBe(matchedAuto.confidence);
    expect(row.extracted).toEqual({
      ...extracted,
      nameKey: '솔숲펜션',
      dupOf: null,
      meta: null,
      addressAi: null,
      address: local.address,
      geo: { lat: local.lat, lng: local.lng },
      geoSource: 'local',
      naverLink: local.naverLink,
      homepage: null,
      category: '펜션',
      regionRawAi: extracted.regionRaw ?? null,
      regionRaw: '동쪽 (구좌읍)',
      // 짝 행과 대 보지 않았으면(kind 를 안 넘김) auto 는 '보강' 이다 — 옛 '기존' 의 뜻.
      match: { confidence: matchedAuto.confidence, reason: matchedAuto.reason, tier: 'auto', kind: 'fill', changes: [] },
      // 물어보지 않았으면 null 이다 — "점검했고 근거가 없었다" 와 섞이지 않게(verifyPlaces.mjs).
      verify: null,
    });
  });

  it('홈페이지 카드는 넘긴 그대로 싣고, 안 넘기면 null(없음 또는 안 읽음)', () => {
    const homepage = { url: 'https://www.solsup.com/', siteName: '솔숲펜션', image: 'https://www.solsup.com/a.jpg' };
    expect(toCandidateRow(post, extracted, local, null, matchedAuto, { homepage }).extracted.homepage).toEqual(homepage);
    expect(toCandidateRow(post, extracted, local, null, matchedAuto).extracted.homepage).toBeNull();
  });

  it('네이버가 없으면 geo·geoSource·naverLink·category 는 null 이고 address 는 본문 값(없으면 null)', () => {
    const matched = { match: null, confidence: 0, reason: '이름이 맞는 기존 장소 없음' };
    const row = toCandidateRow(post, { ...extracted, name: '없던가게' }, null, null, matched);
    expect(row.extracted.geo).toBeNull();
    expect(row.extracted.geoSource).toBeNull();
    expect(row.extracted.naverLink).toBeNull();
    expect(row.extracted.category).toBeNull();
    expect(row.extracted.address).toBeNull();
    expect(row.extracted.regionRaw).toBeNull();
    const withAddress = toCandidateRow(post, { ...extracted, name: '없던가게', address: '제주 어딘가' }, null, null, matched);
    expect(withAddress.extracted.address).toBe('제주 어딘가');
  });

  it('두 번째 축(주소→좌표)에서 온 좌표는 geoSource 가 geocode 이고 naverLink·category 가 null 이다', () => {
    // naverGeocode.mjs 가 돌려주는 모양 — Geocoding 은 업체를 모르므로 category 를 지어내면 apply 가 엉뚱한 값으로 빈 칸을 채운다.
    const fromGeocode = { lat: 33.46209, lng: 126.37098, address: '제주 제주시 애월읍 상가로1길 11-15', naverLink: null, category: null, geoSource: 'geocode' };
    const matched = { match: null, confidence: 0, reason: '이름이 맞는 기존 장소 없음' };
    const row = toCandidateRow(post, { ...extracted, name: '요호르기 스테이' }, fromGeocode, '서쪽 (애월읍)', matched);
    expect(row.extracted.geoSource).toBe('geocode');
    expect(row.extracted.geo).toEqual({ lat: 33.46209, lng: 126.37098 });
    expect(row.extracted.naverLink).toBeNull();
    expect(row.extracted.category).toBeNull();
    expect(row.extracted.address).toBe('제주 제주시 애월읍 상가로1길 11-15');
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
    toCandidateRow(post, extracted, local, '동쪽 (구좌읍)', matchedAuto);
    expect(extracted).toEqual(original);
  });
});

describe('로그 형식 — 본문 인용은 싣지 않는다', () => {
  it('formatCandidateLine 은 이름·종류·구간·confidence·짝·이유만 담고 evidence·petPolicyText 는 없다', () => {
    const matched = { match: places[0], confidence: 0.92, reason: '이름 일치 · 거리 40m' };
    const row = toCandidateRow(post, extracted, local, null, matched);
    const line = formatCandidateLine(row, places[0].name);
    expect(line).toBe(`후보 솔숲펜션 (stay) 일치 0.92 → ${places[0].name} · 보강 · 이름 일치 · 거리 40m`);
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

  /**
   * '이미 있음' 은 제외 합계에 **들어가야** 한다. 안 들어가면 `후보 4 · 제외 2` 인데 실제로 뺀 것이 5건인
   * 요약이 나오고, 운영자는 그 차이를 "글 분석이 빠졌나" 로 읽는다. 0이면 괄호 안에서 사라진다 —
   * 이 경로가 안 도는 실행(전부 신규)에서 `이미 있음 0` 이 서 있으면 새 갈래가 생긴 줄 안다.
   */
  it('제외 합계에 이미 있음이 들어가고, 0이면 조각이 사라진다', () => {
    const stats = { analyzed: 3, skipped: 0, candidates: 4, auto: 1, ask: 2, new: 1 };
    const ex = { other: 1, notJeju: 0, notAllowed: 0, alreadyHave: 3 };
    expect(formatSummary({ ...stats, excluded: ex }, 'x')).toContain('제외 4(other 1 · 제주밖 0 · 동반불가 0 · 이미 있음 3)');
    expect(formatSummary({ ...stats, excluded: { ...ex, alreadyHave: 0 } }, 'x')).toContain(
      '제외 1(other 1 · 제주밖 0 · 동반불가 0)',
    );
    // 옛 실행의 stats 에는 칸이 없다 — NaN 이 되면 요약 한 줄이 통째로 못 읽힌다.
    expect(formatSummary({ ...stats, excluded: { other: 1, notJeju: 0, notAllowed: 0 } }, 'x')).toContain('제외 1(');
  });

  it('차이 게이트 — 같은 말 · 옛 글 · 근거 약함이 제외 합계에 들어가고, 갱신·보강 수가 후보 괄호에 선다', () => {
    const stats = { analyzed: 3, skipped: 0, candidates: 4, auto: 2, ask: 1, new: 1, update: 1, fill: 1 };
    const ex = { other: 0, notJeju: 0, notAllowed: 0, sameAsSite: 5, stale: 2, weak: 1, blocked: 0 };
    const line = formatSummary({ ...stats, excluded: ex }, 'x');
    expect(line).toContain('신규 1 · 갱신 1 · 보강 1');
    expect(line).toContain('제외 8(other 0 · 제주밖 0 · 동반불가 0 · 같은 말 5 · 옛 글 2 · 근거 약함 1)');
  });

  it('제안 패스 — 갱신이 생긴 장소 수와 실은 수를 같이, 안 돌았으면 조각이 없다', () => {
    const stats = { analyzed: 1, skipped: 0, candidates: 1, auto: 1, ask: 0, new: 0 };
    expect(formatSummary({ ...stats, propose: { places: 2, done: 1, failed: 1 } }, 'x')).toContain(' · 제안 1/2곳(실패 1)');
    expect(formatSummary({ ...stats, propose: { places: 0, done: 0, failed: 0 } }, 'x')).not.toContain('제안');
  });

  /**
   * 교차점검 집계는 **점검한 수와 못 찾은 수를 같이** 적는다. `근거 없음 0` 만 적으면 "전부 근거가 있었다" 와
   * "패스가 안 돌았다" 를 구별할 수 없는데, 운영자가 해야 할 일은 정반대다.
   */
  it('교차점검을 돌렸으면 점검 수와 갈래를 같이 적고, 안 돌렸으면 그 조각이 아예 없다', () => {
    const stats = { analyzed: 3, skipped: 0, candidates: 4, auto: 1, ask: 2, new: 1 };
    expect(formatSummary({ ...stats, verify: { checked: 7, noEvidence: 2, notAllowed: 1, failed: 0 } }, 'x')).toContain(
      '교차점검 7건(근거 없음 2 · 동반 불가 정황 1)',
    );
    expect(formatSummary({ ...stats, verify: { checked: 0, noEvidence: 0, notAllowed: 0, failed: 3 } }, 'x')).toContain('실패 3');
    expect(formatSummary(stats, 'x')).not.toContain('교차점검');
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

describe('exclusionReason — 후보가 안 되는 이유(2026-09-28 설계 검토)', () => {
  it('제주 밖 → notJeju, other → other, 본문이 동반 불가라고 하면 notAllowed, 아니면 null', () => {
    expect(exclusionReason({ ...extracted, isJeju: false })).toBe('notJeju');
    expect(exclusionReason({ ...extracted, type: 'other' })).toBe('other');
    expect(exclusionReason({ ...extracted, petAllowed: 'no' })).toBe('notAllowed');
    expect(exclusionReason({ ...extracted, petAllowed: 'unknown' })).toBeNull();
    expect(exclusionReason(extracted)).toBeNull();
    expect(isPlaceCandidate({ ...extracted, petAllowed: 'no' })).toBe(false);
  });
});

describe('resolveRegionRaw — 시내(동 단위)는 시로 뭉친다', () => {
  it('"남쪽 (중문동)" → 남쪽 (서귀포시), "북쪽 (노형동)" → 북쪽 (제주시), 방향이 어긋난 동은 null', () => {
    expect(resolveRegionRaw(null, '남쪽 (중문동)', places)).toBe('남쪽 (서귀포시)');
    expect(resolveRegionRaw(null, '북쪽 (노형동)', places)).toBe('북쪽 (제주시)');
    expect(resolveRegionRaw(null, '서쪽 (노형동)', places)).toBeNull();
  });
  it('시 이름은 AI 가 준 방향과 무관하게 코드가 정한다', () => {
    expect(resolveRegionRaw(null, '서쪽 (제주시)', places)).toBe('북쪽 (제주시)');
    expect(resolveRegionRaw(null, '남쪽 (서귀포시)', places)).toBe('남쪽 (서귀포시)');
  });
  it('목록에도 시에도 없는 이름("동쪽 (성산리)")은 null — 사람이 채운다', () => {
    expect(resolveRegionRaw(null, '동쪽 (성산리)', places)).toBeNull();
  });
});

describe('pickPostsForRun — 한 블로그는 maxPerBlog 건까지', () => {
  const mk = (blog, n) => ({ url: `https://blog.naver.com/${blog}/${n}`, blog_id: blog });
  const posts = [mk('a', 1), mk('a', 2), mk('a', 3), mk('b', 1), mk('a', 4), mk('c', 1), mk('b', 2)];
  it('최신순을 지키되 넘친 글은 건너뛰고 limit 까지 채운다', () => {
    expect(pickPostsForRun(posts, 5, 2).map((p) => p.url.split('/').slice(-2).join('/'))).toEqual(['a/1', 'a/2', 'b/1', 'c/1', 'b/2']);
  });
  it('maxPerBlog 0 은 상한 없음, blog_id 가 없으면 url 로 센다', () => {
    expect(pickPostsForRun(posts, 10, 0)).toHaveLength(7);
    expect(pickPostsForRun([{ url: 'x' }, { url: 'y' }], 10, 1)).toHaveLength(2);
  });
});

describe('toPostAnalysis — blog_posts.analysis', () => {
  it('후보 수·이름, 제외 목록(이름·종류·이유), 모델·프롬프트 버전, skip 만 — 본문 인용은 없다', () => {
    const meta = { model: 'claude-opus-5', promptVersion: 'abcd1234' };
    const row = toCandidateRow(post, extracted, null, null, { match: null, confidence: 0, reason: '없음' }, { meta });
    const a = toPostAnalysis({ meta, candidates: [row], excluded: [{ extracted: { ...extracted, name: '해변', type: 'other' }, reason: 'other' }] });
    expect(a).toEqual({
      model: 'claude-opus-5',
      promptVersion: 'abcd1234',
      candidates: 1,
      candidateNames: ['솔숲펜션'],
      excluded: [{ name: '해변', type: 'other', reason: 'other' }],
      skip: null,
    });
    expect(JSON.stringify(a)).not.toContain('불멍');
    expect(row.extracted.meta).toEqual(meta);
  });
  it('분석 불가로 닫을 때는 skip 만', () => {
    expect(toPostAnalysis({ skip: '본문 없음' })).toMatchObject({ candidates: 0, excluded: [], skip: '본문 없음', model: null });
  });
});

describe('editedKeysFor — 사람이 고친 후보는 다시 읽어도 새로 만들지 않는다(T2.2)', () => {
  const url = 'https://blog.naver.com/a/1';
  const pending = (over = {}) => ({ post_url: url, reviewer_note: EDITED_NOTE, extracted: { name: '솔숲펜션', nameKey: '솔숲펜션' }, ...over });

  it('머리표 문자열이 TS 의 EDITED_NOTE 와 같다', () => {
    expect(EDITED_NOTE).toBe(EDITED_NOTE_TS);
  });
  it('같은 글·같은 가게는 걸린다', () => {
    expect(editedKeysFor([pending()]).has(editedKey(url, '솔숲펜션'))).toBe(true);
  });
  it('같은 가게라도 다른 글이면 걸리지 않는다', () => {
    expect(editedKeysFor([pending()]).has(editedKey('https://blog.naver.com/a/2', '솔숲펜션'))).toBe(false);
  });
  it('고침 표시가 없는 pending 은 넣지 않는다', () => {
    expect(editedKeysFor([pending({ reviewer_note: null }), pending({ reviewer_note: '[data:review] 확인 필요' })]).size).toBe(0);
  });
  it('이름을 고친 행은 원래 이름의 추출도 걸린다(editedFrom.nameKey)', () => {
    const keys = editedKeysFor([pending({ extracted: { name: '새이름', nameKey: '새이름', editedFrom: { nameKey: '원래이름' } } })]);
    expect(keys.has(editedKey(url, '원래이름'))).toBe(true);
    expect(keys.has(editedKey(url, '새이름'))).toBe(true);
  });
  it('nameKey 없는 옛 후보는 이름으로 계산한다', () => {
    expect(editedKeysFor([pending({ extracted: { name: '솔숲 펜션' } })]).size).toBe(1);
  });
  it('요약 줄에 고침 유지 건수가 붙는다', () => {
    const stats = { analyzed: 1, skipped: 0, candidates: 0, auto: 0, ask: 0, new: 0, edited: 2 };
    expect(formatSummary(stats, 'x')).toContain(' · 고침 유지 2');
    expect(formatSummary({ ...stats, edited: 0 }, 'x')).not.toContain('고침 유지');
  });
});

describe('isBlocked — 차단 목록에 걸린 가게는 후보를 만들지 않는다(T1.2)', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const cand = (over = {}) => ({ name: '카페 살레', address: null, regionRaw: null, ...over });
  const block = (over = {}) => ({ name_key: normalizeName('카페 살레'), town: null, until: null, lifted_at: null, ...over });

  it('이름만 같으면(town null) 걸린다 — 다른 이름은 안 걸린다', () => {
    expect(isBlocked(cand(), [block()], now)).toBe(true);
    expect(isBlocked(cand({ name: '다른카페' }), [block()], now)).toBe(false);
  });
  it('town 이 있으면 읍·면까지 맞아야 걸린다 — 다른 읍·면이면 동명 가게라 안 걸린다', () => {
    const b = block({ town: '우도면' });
    expect(isBlocked(cand({ address: '제주특별자치도 제주시 우도면 연평리 1' }), [b], now)).toBe(true);
    expect(isBlocked(cand({ address: '제주특별자치도 제주시 애월읍 1' }), [b], now)).toBe(false);
    expect(isBlocked(cand({ regionRaw: '동쪽 (우도면)' }), [b], now)).toBe(true);
  });
  it('후보의 읍·면을 모르면 이름만으로 건다(모르는 것은 막는다)', () => {
    expect(isBlocked(cand(), [block({ town: '우도면' })], now)).toBe(true);
  });
  it('until 이 지났으면 안 걸리고, 남았으면 걸린다', () => {
    expect(isBlocked(cand(), [block({ until: '2026-09-30T23:59:59Z' })], now)).toBe(false);
    expect(isBlocked(cand(), [block({ until: '2026-10-02T00:00:00Z' })], now)).toBe(true);
  });
  it('lifted_at 이 찍힌 행은 안 걸린다', () => {
    expect(isBlocked(cand(), [block({ lifted_at: '2026-09-30T00:00:00Z' })], now)).toBe(false);
  });
  it('영구(until null)는 걸리고, 라벨은 영구 / ~날짜', () => {
    const b = block();
    expect(blockFor(cand(), [b], now)).toBe(b);
    expect(blockUntilLabel(b)).toBe('영구');
    expect(blockUntilLabel(block({ until: '2027-01-02T00:00:00Z' }))).toBe('~2027-01-02');
    expect(isBlocked(cand(), [], now)).toBe(false);
  });
  it('요약 줄에 차단이 제외 합계와 괄호에 들어가고, 0 이면 조각이 사라진다', () => {
    const stats = { analyzed: 1, skipped: 0, candidates: 0, auto: 0, ask: 0, new: 0 };
    const ex = { other: 0, notJeju: 0, notAllowed: 0, alreadyHave: 0, blocked: 2 };
    expect(formatSummary({ ...stats, excluded: ex }, 'x')).toContain('제외 2(other 0 · 제주밖 0 · 동반불가 0 · 차단 2)');
    expect(formatSummary({ ...stats, excluded: { ...ex, blocked: 0 } }, 'x')).not.toContain('차단');
  });
});

describe('isFocusedTitle · mergeFocusedFirst — 분석 순서(2026-10-02)', () => {
  it('반려동물 말이 있고 목록·일정형이 아니면 먼저', async () => {
    const { isFocusedTitle } = await import('./analyzeCandidates.mjs');
    expect(isFocusedTitle('[애월 애견동반 카페] 키에키 로스팅 룸 후기')).toBe(true);
    expect(isFocusedTitle('제주 애견동반 카페 추천 — 노지커피')).toBe(true);
    expect(isFocusedTitle('제주 강아지 동반 맛집 BEST 10')).toBe(false);
    expect(isFocusedTitle('제주 애견동반 여행 3박4일 일정')).toBe(false);
    expect(isFocusedTitle('Day 4 제주도 서쪽 애견동반 맛집')).toBe(false);
    expect(isFocusedTitle('제주 서귀포 흑돼지 맛집')).toBe(false);
    expect(isFocusedTitle('대구 강아지 동반 카페 추천, 마고플레인 강정보점')).toBe(false);
    expect(isFocusedTitle('[태안] 애견 풀빌라 펜션 도그데이')).toBe(false);
    expect(isFocusedTitle('함덕 언더라운지 루프탑 카페 애견동반 솔직 후기')).toBe(true);
    expect(isFocusedTitle(null)).toBe(false);
  });

  it('장소 없는 주제 글(오름 정리·배편·업주 연재·명소)은 뒤로, 가게 후기에 흔한 말은 그대로(2026-10-03 실측 제목)', async () => {
    const { isFocusedTitle } = await import('./analyzeCandidates.mjs');
    expect(isFocusedTitle('[제주 도민이 알려주는 애견동반 오름 정리 01] 새별오름')).toBe(false);
    expect(isFocusedTitle('제주 목포 배편 퀸제누비아2 펫스위트룸 예약방법')).toBe(false);
    expect(isFocusedTitle('강아지와 배타고 제주 완도항 출발 골드스텔라호 차량선적')).toBe(false);
    expect(isFocusedTitle('[제주 애월 애견동반 전문펜션 엔젤하우스] 견종백과 제50편「로트')).toBe(false);
    expect(isFocusedTitle('[제주 애월 애견전문 펜션 엔젤하우스] 제주 올레길 애견동반 제21편')).toBe(false);
    expect(isFocusedTitle('제주동쪽스노클링 명소 애견동반 가능한 코난비치')).toBe(false);
    expect(isFocusedTitle('이스타항공 강아지 기내동반｜제주도 비행기 예약·이동장·요금')).toBe(false);
    expect(isFocusedTitle('대형견과 제주도 배여행｜완도-제주 실버클라우드호 반려견 동반')).toBe(false);
    expect(isFocusedTitle('제주도 애견동반 숙소 고를 때 꼭 확인할 7가지')).toBe(false);
    expect(isFocusedTitle('제주 빛의섬루미버스 입장료 할인 제주민속촌 애견동반 야간개장')).toBe(false);
    expect(isFocusedTitle('제주 함덕해수욕장 애견동반 맛집 갈치옥 갈치구이')).toBe(true);
    expect(isFocusedTitle('[제주공항]카페 깅코 | 운동장까지 있는 제주공항근처애견동반 카페')).toBe(true);
    expect(isFocusedTitle('나만 알고 싶은 금오름 카페 바이못 by MOT | 제주 펫프렌들리')).toBe(true);
    expect(isFocusedTitle('제주 애월 애견동반펜션 산책 후 갈치구이')).toBe(true);
  });

  it('꼬리가 잘린 연재 제목(`제11....`)도 뒤로 — 「제주」 는 걸리지 않는다', async () => {
    const { isFocusedTitle } = await import('./analyzeCandidates.mjs');
    expect(isFocusedTitle('[제주 애월 애견동반 전문펜션 엔젤하우스] 강아지 시니어케어 제11....')).toBe(false);
    expect(isFocusedTitle('제주 애견동반 카페 노지커피 후기....')).toBe(true);
  });

  it('singlePlaceBlogs — 분석 끝난 글 2건 이상에서 가게가 하나 이하인 블로그만', async () => {
    const { singlePlaceBlogs } = await import('./analyzeCandidates.mjs');
    const post = (blogId, candidateNames, excluded = [], extra = {}) => ({ blog_id: blogId, analysis: { candidateNames, excluded, skip: null, ...extra } });
    const rows = [
      // 업주 블로그 — 같은 펜션(띄어쓰기만 다름)이 후보·제외로 나온다
      post('owner', ['엔젤하우스']),
      post('owner', [], [{ name: '엔젤 하우스', reason: 'noPetEvidence' }]),
      // 주제만 쓰는 블로그 — 가게 0
      post('topic', []),
      post('topic', []),
      // 여러 가게를 다니는 블로거
      post('reviewer', ['명월반점']),
      post('reviewer', ['노지커피']),
      // 1건뿐 — 아직 모른다
      post('fresh', ['키에키']),
      // 실패로 닫힌 글·옛 글은 세지 않는다
      post('failed', []),
      post('failed', [], [], { skip: 'body empty' }),
      { blog_id: 'failed', analysis: null },
    ];
    expect([...singlePlaceBlogs(rows)].sort()).toEqual(['owner', 'topic']);
  });

  it('deferBlogs — 그 블로그 글만 맨 뒤로, 순서는 그대로', async () => {
    const { deferBlogs } = await import('./analyzeCandidates.mjs');
    const posts = [{ url: 'a', blog_id: 'owner' }, { url: 'b', blog_id: 'x' }, { url: 'c', blog_id: 'owner' }, { url: 'd', blog_id: 'y' }];
    expect(deferBlogs(posts, new Set(['owner'])).map((post) => post.url)).toEqual(['b', 'd', 'a', 'c']);
    expect(deferBlogs(posts, new Set())).toBe(posts);
  });

  it('집중 글을 앞에, 겹침은 지우고 각 무리 순서는 그대로', async () => {
    const { mergeFocusedFirst } = await import('./analyzeCandidates.mjs');
    const merged = mergeFocusedFirst([{ url: 'b' }, { url: 'd' }], [{ url: 'a' }, { url: 'b' }, { url: 'c' }]);
    expect(merged.map((post) => post.url)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('isNoPetEvidenceNew — 신규·동반 근거 없음(ADR-019 v6 임시 단계)', () => {
  it('verify 가 null(안 봤다)이면 빼지 않는다 — 교차점검이 꺼졌거나 실패한 후보도 그대로 후보다', async () => {
    const { isNoPetEvidenceNew } = await import('./analyzeCandidates.mjs');
    expect(isNoPetEvidenceNew('new', null)).toBe(false);
    expect(isNoPetEvidenceNew('new', undefined)).toBe(false);
  });

  it('신규만, verifyLabel 의 동반 근거 없음과 같은 판정', async () => {
    const { isNoPetEvidenceNew } = await import('./analyzeCandidates.mjs');
    const { verifyLabel } = await import('./verifyPlaces.mjs');
    const cases = [
      { petAllowedHere: 'unknown', dogWasThere: false },
      { petAllowedHere: 'yes', dogWasThere: false },
      { petAllowedHere: 'no', dogWasThere: false },
      { petAllowedHere: 'unknown', dogWasThere: true },
    ];
    for (const verify of cases) {
      expect(isNoPetEvidenceNew('new', verify)).toBe(verifyLabel(verify) === '동반 근거 없음');
      expect(isNoPetEvidenceNew('auto', verify)).toBe(false);
      expect(isNoPetEvidenceNew('ask', verify)).toBe(false);
    }
  });

  it('제외 기록에 재검색 재료가 실리고, 요약 줄이 센다', async () => {
    const { toPostAnalysis, formatSummary } = await import('./analyzeCandidates.mjs');
    const analysis = toPostAnalysis({
      excluded: [{ extracted: { name: '해녀의집', type: 'restaurant' }, reason: 'noPetEvidence', extra: { town: '구좌읍', address: null, recheck: null } }],
    });
    expect(analysis.excluded[0]).toEqual({ name: '해녀의집', type: 'restaurant', reason: 'noPetEvidence', town: '구좌읍', address: null, recheck: null });
    const stats = {
      analyzed: 1, skipped: 0, dropped: 0, candidates: 0, auto: 0, ask: 0, new: 0, dup: 0, edited: 0, update: 0, fill: 0,
      excluded: { other: 0, notJeju: 0, notAllowed: 0, sameAsSite: 0, stale: 0, weak: 0, blocked: 0, noPetEvidence: 3 },
      verify: { checked: 3, noEvidence: 3, notAllowed: 0, failed: 0 },
    };
    const line = formatSummary(stats, '');
    expect(line).toContain('제외 3(');
    expect(line).toContain('신규·동반 근거 없음 3');
  });
});
