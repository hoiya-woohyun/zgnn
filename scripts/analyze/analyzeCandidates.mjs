// analyze-candidates.mjs(I/O)가 쓰는 순수 함수들 — 인자 파싱, 후보 판별, regionRaw 우선순위, candidates 행 조립. 테스트는
// analyzeCandidates.test.mjs. 무엇을 왜 후보로 삼는지는 docs/todo/03-analyze-and-review.md 가 정본.
//
// 조립 규칙을 스크립트 밖으로 뺀 이유 — candidates.extracted 의 모양은 apply-approved.mjs(applyApproved.mjs)가 그대로 읽는
// 계약이다. 키 하나가 빠지면(예: Kakao 가 준 category) 빌드도 테스트도 통과한 채 반영 단계에서 조용히 안 채워진다.
// 그래서 모양을 함수 하나에 모으고 테스트로 못 박는다.
import { parseRegion } from '../lib/placeFields.mjs';
import { inferRegionRaw } from './kakaoLocal.mjs';
import { THRESHOLD } from './matchPlace.mjs';

/**
 * 🙋 auto 구간(confidence ≥ AUTO_MERGE)을 사람 확인 없이 바로 approved 로 넣을 것인가. 기본 false — 후보는 전부 pending 이고
 * tier 만 'auto' 로 표시돼 Studio 에서 걸러 한꺼번에 승인한다(`extracted->match->>tier = 'auto'`). true 로 바꾸면 같은 잡의
 * data:apply 가 즉시 places 를 고친다(빈 칸만이지만 좌표·주소·category 는 "빈 칸" 이라 그대로 들어간다 — 리뷰 지적). 86곳이라
 * 사람 확인 비용이 싸다는 03 의 전제를 따라 보수적으로 시작한다.
 */
export const AUTO_APPROVE = false;

/** 한 실행에 읽는 미분석 글 수. 글 하나가 Claude 호출 한 번이라 Actions 의 timeout-minutes(30) 안에 끝나는 크기. */
export const DEFAULT_LIMIT = 50;

/** `--dry-run` · `--limit N`(또는 `--limit=N`). 모르는 인자나 1 미만의 limit 은 throw — 오타로 전체를 돌리는 일이 없게. */
export function parseArgs(argv) {
  const args = { limit: DEFAULT_LIMIT, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    let value;
    if (arg === '--limit') value = argv[++i];
    else if (arg.startsWith('--limit=')) value = arg.slice('--limit='.length);
    else throw new Error(`알 수 없는 인자: ${arg}`);
    if (!/^\d+$/.test(value ?? '') || Number(value) < 1) throw new Error(`--limit 은 1 이상의 정수여야 합니다: ${value ?? '(없음)'}`);
    args.limit = Number(value);
  }
  return args;
}

const PLACE_TYPES = new Set(['stay', 'restaurant', 'cafe']);

/** 제주 소재이고 종류가 정해진 것만 후보. type 'other'(관광지·일반론)와 제주 밖은 후보를 만들지 않고 analyzed_at 만 찍는다(03). */
export function isPlaceCandidate(extracted) {
  return extracted?.isJeju === true && PLACE_TYPES.has(extracted.type);
}

/**
 * regionRaw 는 주소 기반이 우선. AI 의 regionRaw 는 본문의 "동쪽 어디쯤" 같은 말에서 추측한 것이고, 주소(Kakao 또는 본문)에서
 * 읍·면을 뽑아 기존 86곳의 방향 표기에 맞춘 것이 더 믿을 만하다. inferRegionRaw 가 '' 를 주면(읍·면을 못 정함 — 안덕면처럼 방향이
 * 갈리는 경우 포함) AI 값으로 물러선다. 둘 다 없으면 null — 사람이 Studio 에서 채운다.
 * @returns {string | null}
 */
export function resolveRegionRaw(address, aiRegionRaw, existing) {
  const fromAddress = address ? inferRegionRaw(address, existing) : '';
  if (fromAddress) return fromAddress;
  // AI 값은 parseRegion 이 방향을 읽을 수 있을 때만 — "동쪽 구좌읍"(괄호 없음)·"구좌읍" 같은 변형은 화면에서 unknown 이 돼 방향 필터에서 사라진다.
  if (aiRegionRaw && parseRegion(aiRegionRaw).direction !== 'unknown') return aiRegionRaw;
  return null;
}

/**
 * matchPlace 결과 → 구간. 'auto' 는 자동 병합, 'ask' 는 사람이 확정, 'new' 는 신규 장소.
 * match 가 null 이면 confidence 와 무관하게 'new' — matchPlace 는 ASK 미만이면 match 를 비우므로 둘은 어긋나지 않지만, 여기서 한 번 더 막는다.
 */
export function tierOf(matched) {
  if (!matched?.match) return 'new';
  if (matched.confidence >= THRESHOLD.AUTO_MERGE) return 'auto';
  if (matched.confidence >= THRESHOLD.ASK) return 'ask';
  return 'new';
}

/**
 * matchPlace 에 넘길 후보. 좌표는 Kakao 것만 쓴다(AI 는 좌표를 주지 않는다). 주소는 Kakao 가 우선 — 본문 주소는 오타·생략이 잦다.
 * AI 의 regionRaw 도 넘긴다 — 주소·좌표가 없는 후보에서 우도 vs 본섬 동명 가게를 가르는 유일한 신호다(빠뜨리면 자동 병합된다, 리뷰 지적).
 * 없는 값은 undefined 로 둔다: matchPlace 는 값이 없는 신호를 감점 없이 건너뛴다.
 */
export function toMatchCandidate(extracted, kakao) {
  return {
    name: extracted.name,
    type: extracted.type,
    geo: kakao ? { lat: kakao.lat, lng: kakao.lng } : undefined,
    address: kakao?.address ?? extracted.address ?? undefined,
    regionRaw: extracted.regionRaw ?? undefined,
  };
}

/**
 * candidates 행. extracted 의 모양은
 *   { ...TExtractedPlace, geo: {lat,lng}|null, kakaoPlaceUrl: string|null, category: string|null, regionRaw: string|null,
 *     match: { confidence, reason, tier: 'auto'|'ask'|'new' } }
 * — applyApproved.mjs 가 읽는 계약이다. address 는 Kakao 값이 있으면 그것으로 덮는다(기존 86곳과 같은 "제주 제주시 …" 꼴).
 * category 는 TExtractedPlace 에 없고 Kakao 가 한 단어("커피전문점")로 주는 값 — 빠뜨리면 apply 가 category 를 영영 못 채운다.
 *
 * status: AUTO_APPROVE 가 true 일 때만 auto 가 바로 approved. 기본은 전부 pending — tier 가 Studio 에서 거를 단서다.
 * match_place_id 는 ask 에도 붙인다 — 사람이 "이 기존 장소가 맞나" 를 확인하는 단서다. new 는 null.
 *
 * @param {{ url: string }} post  blog_posts 행
 * @param {object} extracted  TExtractedPlace
 * @param {{ lat, lng, address, kakaoPlaceUrl, category } | null} kakao  pickKakaoPlace 결과
 * @param {string | null} regionRaw  resolveRegionRaw 결과
 * @param {{ match: object | null, confidence: number, reason: string }} matched  matchPlace 결과
 */
export function toCandidateRow(post, extracted, kakao, regionRaw, matched) {
  const tier = tierOf(matched);
  return {
    post_url: post.url,
    extracted: {
      ...extracted,
      address: kakao?.address ?? extracted.address ?? null,
      geo: kakao ? { lat: kakao.lat, lng: kakao.lng } : null,
      kakaoPlaceUrl: kakao?.kakaoPlaceUrl ?? null,
      category: kakao?.category ?? null,
      regionRaw: regionRaw ?? null,
      match: { confidence: matched.confidence, reason: matched.reason, tier },
    },
    match_place_id: tier === 'new' ? null : matched.match.id,
    match_confidence: matched.confidence,
    status: tier === 'auto' && AUTO_APPROVE ? 'approved' : 'pending',
  };
}

const TIER_LABEL = { auto: '자동병합', ask: '확인요청', new: '신규' };

/**
 * 로그 한 줄. 이름·종류·구간·confidence·짝지은 기존 장소·이유만 — evidence·petPolicyText 는 본문 인용이라 로그에 싣지 않는다(05).
 * @param {object} row  toCandidateRow 결과
 * @param {string} [matchedName]  짝지은 기존 장소 이름(있을 때)
 */
export function formatCandidateLine(row, matchedName) {
  const { name, type, match } = row.extracted;
  const target = match.tier === 'new' ? '' : ` → ${matchedName ?? row.match_place_id}`;
  return `후보 ${name} (${type}) ${TIER_LABEL[match.tier]} ${match.confidence.toFixed(2)}${target} · ${match.reason}`;
}

/** 마지막 한 줄. Actions 로그에서 이 줄만 보면 된다. */
export function formatSummary(stats, meterSummary, { dryRun } = {}) {
  const prefix = dryRun ? '[dry-run] ' : '';
  const dropped = stats.dropped ? ` · 분석불가 ${stats.dropped}` : '';
  return `${prefix}분석 ${stats.analyzed}건 (후보 ${stats.candidates} · 자동병합 ${stats.auto} · 확인요청 ${stats.ask} · 신규 ${stats.new} · 건너뜀 ${stats.skipped}${dropped}) · ${meterSummary}`;
}
