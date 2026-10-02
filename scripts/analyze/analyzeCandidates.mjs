// analyze-candidates.mjs(I/O)가 쓰는 순수 함수들 — 인자 파싱, 후보 판별, regionRaw 우선순위, candidates 행 조립. 테스트는
// analyzeCandidates.test.mjs. 무엇을 왜 후보로 삼는지는 docs/todo/03-analyze-and-review.md 가 정본.
//
// 조립 규칙을 스크립트 밖으로 뺀 이유 — candidates.extracted 의 모양은 apply-approved.mjs(applyApproved.mjs)가 그대로 읽는
// 계약이다. 키 하나가 빠지면(예: 네이버가 준 category) 빌드도 테스트도 통과한 채 반영 단계에서 조용히 안 채워진다.
// 그래서 모양을 함수 하나에 모으고 테스트로 못 박는다.
import { parseRegion } from '../lib/placeFields.mjs';
import { extractAddressUnits, inferRegionRaw } from './naverLocal.mjs';
import { JEJU_TOWNS, normalizeName, THRESHOLD, townOf } from './matchPlace.mjs';
import { fillColumns, siteChanges } from './siteChanges.mjs';

/**
 * 🙋 auto 구간(confidence ≥ AUTO_MERGE)을 사람 확인 없이 바로 approved 로 넣을 것인가. 기본 false — 후보는 전부 pending 이고
 * tier 만 'auto' 로 표시돼 Studio 에서 걸러 한꺼번에 승인한다(`extracted->match->>tier = 'auto'`). true 로 바꾸면 같은 잡의
 * data:apply 가 즉시 places 를 고친다(빈 칸만이지만 좌표·주소·category 는 "빈 칸" 이라 그대로 들어간다 — 리뷰 지적). 86곳이라
 * 사람 확인 비용이 싸다는 03 의 전제를 따라 보수적으로 시작한다.
 */
export const AUTO_APPROVE = false;

/**
 * 한 실행에 읽는 미분석 글 수. 글 하나가 Claude 호출 한 번(수 초~수십 초)이고, 실행 전체가 운영자 세션 창 안에 끝나야 한다 —
 * 세션은 `pnpm data:login` 의 JWT 라, 실효 창은 대시보드 JWT expiry 에서 supabaseClient 의 skew(30분)를 뺀 값이다:
 * **지금 이 프로젝트의 expiry 는 43200 — 실효 창 11.5시간이다**(2026-09-22 에 3600 에서 올렸다). 다음 사람이 "우리는 어느 쪽인가" 를 다시 찾지 않게 적어 둔다.
 * 확인은 `pnpm data:login` 이 찍는 만료 문구(+12시간). 코드가 거부하는 상한은 supabaseClient 의 SESSION_MAX_TTL_S(하루)라 여유가 있다.
 * 다시 3600 으로 내려가면 실효 창이 **30분**이라 50건이 넉넉히 들어간다고 장담 못 한다 — 그때는 `--limit 30` 씩 나눈다.
 * 중간에 세션이 죽으면 그 글부터 DB 쓰기가 실패해 건너뛰고(analyzed_at 안 찍힘) 다음 실행이 이어 간다. 구독의 5시간 창도 같은 이유로 --limit 을 누른다.
 */
export const DEFAULT_LIMIT = 50;

/**
 * 한 실행에서 같은 블로그(blog_id)의 글을 몇 건까지 읽나. 첫 분석(2026-09-28)에서 자사 홍보 블로그 하나가 저수지 3,360건의 12%(406건)를 차지했고
 * 30건 배치에 매번 4~5건씩 들어와 같은 펜션 후보를 13번 만들었다. 넘친 글은 닫지 않고 남긴다 — 그 블로거의 최신 글이 계속 앞에 서므로 사실상
 * 뒤로 밀린다(의도). 0 은 상한 없음.
 */
export const DEFAULT_MAX_PER_BLOG = 2;

/**
 * `--dry-run` · `--limit N` · `--max-per-blog N` · `--no-geo` · `--no-verify`(교차점검 패스를 끈다 — Claude 호출이 글마다
 * 최대 한 번 더 늘어나므로 한도가 아까울 때) · `--no-propose`(셋째 패스 「제안」을 끈다 — 갱신 후보가 생긴 장소마다 한 번 더 부른다, docs/todo/11 U3) · `--no-homepage`(공식 홈페이지 카드를 읽지 않는다 — 업체 사이트에 요청이 나가지 않게) · `--dump[=경로]`(후보·제외 목록을 로컬 JSON 으로 — 정규화 품질을
 * 사람이 볼 유일한 창, 로그에는 여전히 본문 인용을 찍지 않는다). 모르는 인자나 1 미만의 limit 은 throw — 오타로 전체를 돌리는 일이 없게.
 */
export function parseArgs(argv) {
  const args = { limit: DEFAULT_LIMIT, dryRun: false, dump: null, maxPerBlog: DEFAULT_MAX_PER_BLOG, noGeo: false, noVerify: false, noPropose: false, noHomepage: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') { args.dryRun = true; continue; }
    if (arg === '--no-geo') { args.noGeo = true; continue; }
    if (arg === '--no-verify') { args.noVerify = true; continue; }
    if (arg === '--no-propose') { args.noPropose = true; continue; }
    if (arg === '--no-homepage') { args.noHomepage = true; continue; }
    if (arg === '--dump') { args.dump = ''; continue; } // '' = 기본 경로(data/raw/analyze-<시각>.json)
    if (arg.startsWith('--dump=')) { args.dump = arg.slice('--dump='.length); continue; }
    let key;
    let value;
    for (const [flag, k] of [['--limit', 'limit'], ['--max-per-blog', 'maxPerBlog']]) {
      if (arg === flag) { key = k; value = argv[++i]; }
      else if (arg.startsWith(`${flag}=`)) { key = k; value = arg.slice(flag.length + 1); }
    }
    if (!key) throw new Error(`알 수 없는 인자: ${arg}`);
    const min = key === 'limit' ? 1 : 0;
    if (!/^\d+$/.test(value ?? '') || Number(value) < min) {
      throw new Error(`${key === 'limit' ? '--limit 은 1' : '--max-per-blog 은 0'} 이상의 정수여야 합니다: ${value ?? '(없음)'}`);
    }
    args[key] = Number(value);
  }
  return args;
}

/**
 * 네이버 키가 없을 때 무엇을 하나 — **두 축의 세기를 가르는 자리**다.
 *
 * `search`(이름 축)가 없으면 **멈춘다.** 좌표 없이 대조하면 동명 가게가 `ask` 가 아니라 `auto` 로 올라가
 * 사람이 보지도 못한 채 합쳐진다 — 401/403/429 를 fatal 로 세우는 이유(`analyze-candidates.mjs` 머리 주석)와 같은 값이다.
 * 2026-09-28 에 키 없이 돌린 첫 실행이 좌표 0건으로 141묶음을 만들고 통째로 버려진 것이 이 게이트가 생긴 계기다.
 *
 * `map`(주소 축)이 없으면 **진행한다.** 이 축은 이름 축이 못 붙인 것에만 붙는 '더하기만 하는' 축이라, 없어도
 * 결과가 어제까지의 동작으로 돌아갈 뿐 그 아래로 내려가지 않는다. 여기서 멈추면 잘 돌던 파이프라인을 죽이는 새 통로가 된다.
 *
 * 묻는 것은 **사람 터미널일 때뿐**이다(`canPrompt`). 비TTY 면 프롬프트가 아무도 안 보는 화면에서 영원히 기다리고,
 * 에이전트 세션이면 입력한 값이 대화 기록에 실린다(`collect-blog.mjs` 가 같은 이유로 `CLAUDECODE` 를 거부한다).
 *
 * @param {'search'|'map'} axis
 * @param {{ hasKeys: boolean, noGeo: boolean, canPrompt: boolean }} state
 * @returns {'use'|'ask'|'skip'|'stop'}  use=env 것 그대로 · ask=숨김 입력 · skip=그 축 없이 진행 · stop=exit 1
 */
export function keyGate(axis, { hasKeys, noGeo, canPrompt }) {
  if (noGeo) return 'skip'; // 사람이 좌표 없이 돌리겠다고 말한 것 — 묻지도 세우지도 않는다
  if (hasKeys) return 'use';
  if (canPrompt) return 'ask';
  return axis === 'search' ? 'stop' : 'skip';
}

/**
 * 이번 실행에 넣을 글 고르기 — 최신순을 지키되 한 블로그는 maxPerBlog 건까지만(DEFAULT_MAX_PER_BLOG 참고).
 * 호출자는 limit 보다 넉넉히 가져와야 한다(넘친 글이 자리를 비운다).
 */
export function pickPostsForRun(posts, limit, maxPerBlog = DEFAULT_MAX_PER_BLOG) {
  const perBlog = new Map();
  const picked = [];
  for (const post of posts) {
    if (picked.length >= limit) break;
    const key = post.blog_id ?? post.url;
    const n = perBlog.get(key) ?? 0;
    if (maxPerBlog > 0 && n >= maxPerBlog) continue;
    perBlog.set(key, n + 1);
    picked.push(post);
  }
  return picked;
}

const PLACE_TYPES = new Set(['stay', 'restaurant', 'cafe']);

/**
 * 후보가 안 되는 이유. null 이면 후보다.
 *  'notJeju' 제주 밖 · 'other' 종류 없음(관광지·운동장·일반론) · 'notAllowed' 본문이 동반 불가라고 함 — 앱은 조건 없는 문장을 '갈 수 있어요' 로 읽으므로
 *  들어가면 정반대 안내가 된다(BUG-008, 첫 분석에서 실제로 1건). 이유는 blog_posts.analysis.excluded 에 이름·종류와 함께 남는다(본문 인용 없음).
 */
export function exclusionReason(extracted) {
  if (extracted?.isJeju !== true) return 'notJeju';
  if (!PLACE_TYPES.has(extracted.type)) return 'other';
  if (extracted.petAllowed === 'no') return 'notAllowed';
  return null;
}

/**
 * 이 후보를 막는 차단 행(`place_blocks`) — 없으면 null. D1·D2(ADR-020):
 *  - `name_key` 가 후보의 이름 키(`normalizeName`, `toCandidateRow` 의 `nameKey` 와 같은 함수)와 같고
 *  - `town` 이 null 이거나 후보의 읍·면과 같거나 **후보의 읍·면을 모를 때**(모르는 것은 막는 쪽으로) 이고
 *  - `lifted_at` 이 null(일찍 풀지 않았다) 이고 `until` 이 null(영구)이거나 `now` 보다 뒤(만료 안 됨).
 * 후보의 읍·면은 `inferRegionRaw` 가 쓰는 주소 토큰(`extractAddressUnits`)에서 먼저, 없으면 AI 가 준 `regionRaw` 에서 뽑는다.
 */
export function blockFor(extracted, blocks, now = new Date()) {
  const key = extracted?.nameKey ?? normalizeName(extracted?.name ?? '');
  if (!key) return null;
  const town = extractAddressUnits(extracted?.address).eupMyeon ?? townOf(extracted?.regionRaw);
  return (
    (blocks ?? []).find(
      (b) =>
        b.name_key === key &&
        (!b.town || !town || b.town === town) &&
        !b.lifted_at &&
        (!b.until || new Date(b.until).getTime() > now.getTime()),
    ) ?? null
  );
}

export const isBlocked = (extracted, blocks, now = new Date()) => blockFor(extracted, blocks, now) !== null;

/** 로그용 — 차단이 언제까지인가. */
export const blockUntilLabel = (block) => (block.until ? `~${new Date(block.until).toISOString().slice(0, 10)}` : '영구');

/**
 * `saveEdit`(src/lib/adminApply.ts 의 `EDITED_NOTE`)이 `reviewer_note` 에 적는 머리표. TS ↔ mjs 를 import 로 못 이어 값을 두 번 적고,
 * 둘이 같은지는 `analyzeCandidates.test.mjs` 가 묶는다.
 */
export const EDITED_NOTE = '[admin] 고침';

const EDITED_SEP = '\u0000';

/** 글 + 가게 키 한 쌍의 집합 열쇠. */
export const editedKey = (postUrl, nameKey) => `${postUrl}${EDITED_SEP}${nameKey}`;

/**
 * 사람이 고친 pending 후보의 (글, 가게) 집합 — 같은 글을 다시 읽어도 그 가게의 AI 후보를 또 만들지 않으려고(D3, T2.2).
 * 이름을 고치면 `nameKey` 가 고친 이름으로 다시 계산되고 다시 읽은 AI 는 원래 이름을 내므로, 지금 키와 `extracted.editedFrom.nameKey`(원래 키) 둘 다 넣는다.
 * 옛 후보(nameKey 없음)는 이름으로 계산한다.
 */
export function editedKeysFor(pendingRows) {
  const keys = new Set();
  for (const row of pendingRows ?? []) {
    if (!row.reviewer_note?.includes(EDITED_NOTE)) continue;
    const x = row.extracted;
    const now = x?.nameKey ?? normalizeName(x?.name ?? '');
    if (now) keys.add(editedKey(row.post_url, now));
    const was = x?.editedFrom?.nameKey;
    if (was) keys.add(editedKey(row.post_url, was));
  }
  return keys;
}

/** 제주 소재이고 종류가 정해졌고 동반 불가가 아닌 것만 후보. 나머지는 후보를 만들지 않고 analyzed_at 만 찍는다(03). */
export function isPlaceCandidate(extracted) {
  return exclusionReason(extracted) === null;
}

/** 시 단위 지역 표기. 시내(동 단위) 주소는 읍·면이 없어 여기로 뭉친다 — 시드도 '북쪽 (제주시)'·'남쪽 (서귀포시)' 다. */
const CITY_REGION = { 제주시: '북쪽 (제주시)', 서귀포시: '남쪽 (서귀포시)' };
const TOWN_SET = new Set(JEJU_TOWNS);

/**
 * regionRaw 는 주소 기반이 우선. AI 의 regionRaw 는 본문의 "동쪽 어디쯤" 같은 말에서 추측한 것이고, 주소(네이버 또는 본문)에서
 * 읍·면을 뽑아 기존 86곳의 방향 표기에 맞춘 것이 더 믿을 만하다. inferRegionRaw 가 '' 를 주면(읍·면을 못 정함 — 안덕면처럼 방향이
 * 갈리는 경우 포함) AI 값으로 물러선다. 둘 다 없으면 null — 사람이 Studio 에서 채운다.
 * @returns {string | null}
 */
export function resolveRegionRaw(address, aiRegionRaw, existing) {
  const fromAddress = address ? inferRegionRaw(address, existing) : '';
  if (fromAddress) return fromAddress;
  // AI 값에 읍·면이 있으면 형식만 기존 86곳 표기("동쪽 (성산읍)", 우도는 "우도면")로 다시 만든다 — AI 는 맞는 읍·면을 형식만 틀리게 주기
  // 쉽고("동쪽 성산읍"·"성산읍"), 그대로 버리면 분석 때 쓴 지역 신호가 DB 에 안 남아 apply 의 재대조가 다른 값을 본다(리뷰 지적).
  const town = townOf(aiRegionRaw);
  const fromTown = town ? inferRegionRaw(town, existing) : '';
  if (fromTown) return fromTown;
  // 읍·면이 없거나 기존 데이터에 없는 읍·면이면 parseRegion 이 방향을 읽을 수 있을 때만 — 아니면 화면에서 unknown 이 돼 방향 필터에서 사라진다.
  if (!aiRegionRaw) return null;
  const parsed = parseRegion(aiRegionRaw);
  if (parsed.direction === 'unknown') return null;
  if (parsed.direction === 'udo') return aiRegionRaw;
  // 시는 방향을 코드가 정한다(AI 가 "서쪽 (제주시)" 라 해도 북쪽). 동 이름("남쪽 (중문동)")은 방향으로 시를 고른다 — 첫 분석(2026-09-28)에서
  // 22건이 동 단위로 왔고, 그대로 두면 앱의 읍·면 필터 목록에 동 이름이 섞인다(설계 검토 OB-10).
  if (CITY_REGION[parsed.town]) return CITY_REGION[parsed.town];
  if (parsed.town.endsWith('동')) {
    if (parsed.direction === 'south') return CITY_REGION.서귀포시;
    if (parsed.direction === 'north') return CITY_REGION.제주시;
    return null;
  }
  // 목록에 있는 읍·면은 위 townOf 분기가 이미 처리했다. 여기 오는 것은 목록에도 시에도 없는 이름("동쪽 (성산리)") — 사람이 채운다.
  return TOWN_SET.has(parsed.town) ? aiRegionRaw : null;
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
 * 후보의 **종류**(docs/todo/11 U1·U2) — 승인하면 무슨 일이 일어나나. `tier`(짝이 맞나)와 다른 축이다.
 *   'new'    짝이 없다 → 등록
 *   'ask'    짝이 애매하다(0.4~0.85) → 사람이 고른다
 *   'fill'   짝이 있고 **빈 칸만** 채운다(덧붙이는 글) → 합치기
 *   'update' 짝이 있고 **이미 찬 칸과 다른 사실**을 말한다 → 덮어쓰기(칸 고르기)
 * `exclude` 가 있으면 후보를 만들지 않는다(`blog_posts.analysis.excluded` 의 이유로 남는다):
 *   'sameAsSite' 사이트와 같은 말(빈 칸도 다른 사실도 없다) — data-pipeline v14 가 막은 소음은 이것이다
 *   'stale'      글이 그 장소의 `verified_at`(사람이 확인한 날)보다 오래됐다 — 운영자가 본 뒤의 글만 새 소식이다(U5)
 *   'weak'       목록글(`visited === false`)이거나 교차점검이 '동반 근거 없음' — 그 글은 그 가게의 조건을 말할 근거가 약하다
 *
 * **게시된(`published`) 짝일 때만** 거른다 — `draft` 짝은 그 승인이 초안을 게시로 올리는 유일한 길이고, `archived` 짝은
 * 재개업을 아는 유일한 신호다(막으면 그 가게는 다음에 다른 이름으로 잡혀 복제본이 된다). 그 둘은 늘 후보이고 종류만 붙는다.
 * `status` 나 짝 행을 모르면(시드·테스트 경로) 거르지 않는다 — 모르는 것을 "이미 있다" 로 읽으면 후보가 조용히 사라진다.
 *
 * 순서: 같은 말이면 이유는 늘 'sameAsSite' 다(그것이 가장 많이 알려 준다). 다른 말이 있을 때만 근거(목록글·근거 없음)와 날짜를 본다.
 * 교차점검이 '동반 불가 정황'(`petAllowedHere === 'no'`)이면 다른 칸이 없어도 'update' 다 — "이제 안 받는다" 가 가장 중요한 갱신이다.
 *
 * 비용은 줄지 않는다: 추출도 네이버 조회도 이미 끝난 뒤의 판정이라 **DB 에 안 넣을 뿐**이다(운영자가 훑을 줄 수를 아낀다).
 *
 * @param {{ match: object | null, confidence: number } | null} matched  matchPlace 결과(짝의 `status` 를 본다)
 * @param {object | null} extracted  toCandidateRow 가 만든 extracted(네이버 주소·좌표가 합쳐진 값) — 없으면 짝의 상태만 본다
 * @param {object | null} placeRow  짝의 places 행(snake_case, `verified_at` 포함) — 없으면 판정하지 않는다
 * @param {{ postedAt?: string | null }} [opts]  글 날짜(`blog_posts.posted_at`)
 * @returns {{ kind: 'new' | 'ask' | 'fill' | 'update', exclude: null | 'sameAsSite' | 'stale' | 'weak', changes: string[], fills: string[] }}
 */
export function kindOf(matched, extracted, placeRow, { postedAt = null } = {}) {
  const tier = tierOf(matched);
  if (tier === 'new' || tier === 'ask') return { kind: tier, exclude: null, changes: [], fills: [] };

  const changes = placeRow ? siteChanges(placeRow, extracted) : [];
  const fills = placeRow ? fillColumns(placeRow, extracted) : [];
  const deniedHere = extracted?.verify?.petAllowedHere === 'no';
  const kind = changes.length > 0 || deniedHere ? 'update' : 'fill';
  const result = { kind, exclude: null, changes, fills };

  // 상태를 모르거나 짝 행이 없으면 거르지 않는다(머리 주석). draft·archived 는 늘 후보다.
  if (matched?.match?.status !== 'published' || !placeRow || !extracted) return result;

  if (kind === 'fill' && fills.length === 0) return { ...result, exclude: 'sameAsSite' };
  // '동반 불가 정황' 은 근거가 약해도 올린다 — 그 글은 강아지를 데려가려다 막힌 글일 수 있다.
  const weak = extracted.visited === false || (extracted.verify != null && !deniedHere && extracted.verify.petAllowedHere !== 'yes' && !extracted.verify.dogWasThere);
  if (weak) return { ...result, exclude: 'weak' };
  if (isOlder(postedAt, placeRow.verified_at)) return { ...result, exclude: 'stale' };
  return result;
}

/** 글 날짜가 확인 날짜보다 앞인가. 둘 중 하나라도 없거나 못 읽으면 false — 모르는 날짜로 글을 버리지 않는다. */
function isOlder(postedAt, verifiedAt) {
  if (!postedAt || !verifiedAt) return false;
  const posted = new Date(postedAt).getTime();
  const verified = new Date(verifiedAt).getTime();
  return Number.isFinite(posted) && Number.isFinite(verified) && posted < verified;
}

/**
 * **이미 사이트에 있는 곳이고 같은 말인가** — 그렇다면 후보를 만들지 않는다. `kindOf` 의 얇은 래퍼다(호출부·테스트가 이 이름을 안다).
 *
 * 'auto'(≥0.85)는 "기존 장소와 같은 가게" 라는 뜻이다. 게시된 86곳은 이름·소개·조건이 이미 사람 손으로 차 있어, 같은 말을 하는 글의
 * 후보는 검수 목록에서 신규와 같은 무게로 한 줄을 먹을 뿐이다(data-pipeline v14). **다른 말을 하는 글**은 그렇지 않다 —
 * 그것이 사이트가 틀려 있다는 유일한 신호라 `kindOf` 가 'update'·'fill' 후보로 올린다(docs/todo/11 U1).
 *
 * `extracted`·`placeRow` 없이 부르면 옛 규칙(auto + published 면 막는다)이다 — 짝 행을 모르면 차이를 볼 수 없다.
 * `draft`·`archived`·상태 미상 짝은 막지 않는다(`kindOf` 머리 주석).
 */
export function skipAsExisting(matched, extracted = null, placeRow = null, opts = {}) {
  if (!extracted || !placeRow) return tierOf(matched) === 'auto' && matched?.match?.status === 'published';
  return kindOf(matched, extracted, placeRow, opts).exclude !== null;
}

/**
 * matchPlace 에 넘길 후보. 좌표는 네이버 것만 쓴다(AI 는 좌표를 주지 않는다) — 이름 축(naverLocal)이든 주소 축(naverGeocode)이든
 * 호출부가 같은 모양으로 넘겨 주므로 여기는 축을 구별하지 않는다. 주소는 네이버가 우선 — 본문 주소는 오타·생략이 잦다.
 * AI 의 regionRaw 도 넘긴다 — 주소·좌표가 없는 후보에서 우도 vs 본섬 동명 가게를 가르는 유일한 신호다(빠뜨리면 자동 병합된다, 리뷰 지적).
 * 없는 값은 undefined 로 둔다: matchPlace 는 값이 없는 신호를 감점 없이 건너뛴다.
 */
export function toMatchCandidate(extracted, local) {
  return {
    name: extracted.name,
    type: extracted.type,
    geo: local ? { lat: local.lat, lng: local.lng } : undefined,
    address: local?.address ?? extracted.address ?? undefined,
    regionRaw: extracted.regionRaw ?? undefined,
  };
}

/**
 * candidates 행. extracted 의 모양은
 *   { ...TExtractedPlace, geo: {lat,lng}|null, geoSource: 'local'|'geocode'|null, naverLink: string|null,
 *     homepage: { url, siteName, image }|null, category: string|null,
 *     regionRaw: string|null, regionRawAi: string|null, match: { confidence, reason, tier: 'auto'|'ask'|'new' },
 *     verify: { petAllowedHere, dogWasThere, quote, why, promptVersion, model } | null }
 * — applyApproved.mjs 가 읽는 계약이다. address 는 네이버 값이 있으면 그것으로 덮는다(기존 86곳과 같은 "제주 제주시 …" 꼴).
 * regionRawAi 는 AI 가 준 원본 — 분석 때 matchPlace 가 본 지역 신호 그대로를 apply 의 재대조가 다시 보게 하기 위해 남긴다(regionRaw 는 정리된 값).
 * category 는 TExtractedPlace 에 없고 네이버가 한 단어("커피전문점")로 주는 값 — 빠뜨리면 apply 가 category 를 영영 못 채운다.
 * geoSource 는 좌표가 **어느 축에서 왔는지**다: 'local' 은 이름으로 찾은 업체 엔트리(naverLocal), 'geocode' 는 주소를 좌표로 바꾼 것(naverGeocode).
 * 사람이 Studio 에서 볼 단서다 — 'geocode' 는 "그 주소의 점" 이라 건물은 맞지만 **그 가게가 지금 그 건물에 있다는 보증은 아니다**.
 * 판정(matchPlace)에는 쓰지 않는다: 축에 따라 가중치를 달리 두면 임계값이 두 벌이 되고, 좌표의 정확도 자체는 두 축이 다르지 않다.
 *
 * status: AUTO_APPROVE 가 true 일 때만 auto 가 바로 approved. 기본은 전부 pending — tier 가 Studio 에서 거를 단서다.
 * match_place_id 는 ask 에도 붙인다 — 사람이 "이 기존 장소가 맞나" 를 확인하는 단서다. new 는 null.
 *
 * @param {{ url: string }} post  blog_posts 행
 * @param {object} extracted  TExtractedPlace
 * @param {{ lat, lng, address, naverLink, category } | null} local  pickNaverPlace 결과
 * @param {string | null} regionRaw  resolveRegionRaw 결과
 * @param {{ match: object | null, confidence: number, reason: string }} matched  matchPlace 결과
 * @param {{ meta?: { model: string, promptVersion: string } | null, dupOf?: string | null, verify?: object | null }} [extra]
 *   meta — 어느 모델·프롬프트로 뽑았나(재분석 대상을 고르는 키). dupOf — 같은 nameKey 의 먼저 난 pending 후보 id(검수자가 묶어 보게).
 *   homepage — 공식 홈페이지 카드 `{ url, siteName, image }`(`homepageCard.mjs`). **`null` 은 "홈페이지 없음 또는 안 읽음"** 이다 —
 *   이름 축이 준 link 가 없거나 네이버·SNS·예약 플랫폼이었거나 읽기에 실패했다. 사진은 URL 뿐이다(ADR-002 v2).
 *   kind — `kindOf` 결과(종류 · 다른 칸). 없으면 tier 로 정한다.
 *   verify — 교차점검 판단(`verifyPlaces.mjs`). **`null` 은 "점검하지 않았다" 다**(조건 문장이 있었거나 그 패스가 꺼졌거나 실패했다).
 *   "점검했고 근거가 없었다" 는 값이 든 객체이고, 둘을 섞으면 화면이 미점검 후보에 초록 표식을 단다.
 */
export function toCandidateRow(post, extracted, local, regionRaw, matched, { meta = null, dupOf = null, verify = null, homepage = null, kind = null } = {}) {
  const tier = tierOf(matched);
  return {
    post_url: post.url,
    extracted: {
      ...extracted,
      // Studio·data:review 에서 같은 가게를 묶는 키(normalizeName). 첫 분석에서 같은 펜션이 13건 따로 쌓였다.
      nameKey: normalizeName(extracted.name),
      dupOf,
      meta,
      // AI 가 본문에서 읽은 주소 원문 — 네이버 주소로 덮인 뒤에도 남겨 동명 오채택을 사람이 알아채게(regionRawAi 와 같은 이유).
      addressAi: extracted.address ?? null,
      address: local?.address ?? extracted.address ?? null,
      geo: local ? { lat: local.lat, lng: local.lng } : null,
      // 이름 축(pickNaverPlace)은 geoSource 를 달지 않으므로 여기서 'local' 이 기본이다 — 축을 아는 곳이 한 군데여야 어긋나지 않는다.
      geoSource: local ? (local.geoSource ?? 'local') : null,
      naverLink: local?.naverLink ?? null,
      homepage,
      category: local?.category ?? null,
      regionRaw: regionRaw ?? null,
      regionRawAi: extracted.regionRaw ?? null,
      // kind — 승인하면 무슨 일이 일어나나(`kindOf`, 11 U2). 부르는 쪽이 짝 행과 대 본 결과를 넘긴다. 안 넘기면 짝의 확신으로만 정한다
      // (auto 는 '보강' — 옛 '기존' 의 뜻). changes 는 'update' 가 된 칸(덮어쓰기 칸 이름) — 검수 화면이 그 칸을 먼저 보여 준다.
      match: { confidence: matched.confidence, reason: matched.reason, tier, kind: kind?.kind ?? (tier === 'auto' ? 'fill' : tier), changes: kind?.changes ?? [] },
      // 교차점검 결과. applyApproved 는 칸을 명시해 읽으므로 이 값이 `places` 로 새지 않는다 — 검수 화면 전용 단서다.
      verify,
    },
    match_place_id: tier === 'new' ? null : matched.match.id,
    match_confidence: matched.confidence,
    status: tier === 'auto' && AUTO_APPROVE ? 'approved' : 'pending',
  };
}

/**
 * blog_posts.analysis(jsonb) — 글 하나의 분석 결과 요약. 후보 0건인 글의 "왜" 가 여기 남는다(제외된 장소의 이름·종류·이유만 —
 * 본문 인용은 넣지 않는다, docs/todo/02 의 저장 원칙). skip 은 분석 불가로 닫을 때의 사유. 마이그레이션 20260928150000.
 */
export function toPostAnalysis({ meta = null, candidates = [], excluded = [], skip = null } = {}) {
  return {
    model: meta?.model ?? null,
    promptVersion: meta?.promptVersion ?? null,
    candidates: candidates.length,
    candidateNames: candidates.map((row) => row.extracted.name),
    excluded: excluded.map(({ extracted, reason }) => ({ name: extracted.name, type: extracted.type, reason })),
    skip,
  };
}

// 'auto' 를 '자동병합' 이라 부르지 않는 이유 — AUTO_APPROVE=false 면 아무것도 자동으로 병합되지 않는다. 구간 이름은 "기존과 일치" 다.
const TIER_LABEL = { auto: '일치', ask: '확인요청', new: '신규' };
// 종류(11 U2) — 짝이 있는 후보에만 덧붙인다(신규·확인요청은 구간 이름이 이미 그 말이다).
const KIND_LABEL = { fill: '보강', update: '갱신' };

/**
 * 로그 한 줄. 이름·종류·구간·confidence·짝지은 기존 장소·이유만 — evidence·petPolicyText 는 본문 인용이라 로그에 싣지 않는다(05).
 * @param {object} row  toCandidateRow 결과
 * @param {string} [matchedName]  짝지은 기존 장소 이름(있을 때)
 */
export function formatCandidateLine(row, matchedName) {
  const { name, type, match } = row.extracted;
  const target = match.tier === 'new' ? '' : ` → ${matchedName ?? row.match_place_id}`;
  const kind = match.tier === 'auto' && KIND_LABEL[match.kind] ? ` · ${KIND_LABEL[match.kind]}${match.changes?.length ? `(${match.changes.join(', ')})` : ''}` : '';
  return `후보 ${name} (${type}) ${TIER_LABEL[match.tier]} ${match.confidence.toFixed(2)}${target}${kind} · ${match.reason}`;
}

/** 마지막 한 줄. 터미널에서 이 줄만 보면 된다. */
export function formatSummary(stats, meterSummary, { dryRun } = {}) {
  const prefix = dryRun ? '[dry-run] ' : '';
  const dropped = stats.dropped ? ` · 분석불가 ${stats.dropped}` : '';
  const ex = stats.excluded;
  /*
   * 짝짓기 뒤에 걸리는 셋(같은 말 · 옛 글 · 근거 약함 — `kindOf`)은 추출 직후에 걸리는 셋(exclusionReason)과 **단계가 다르다**.
   * 그래도 한 괄호에 넣는다: 운영자가 읽는 뜻은 "후보로 안 들어간 수" 하나이고, 자리를 나누면 그 합을 사람이 더해야 한다.
   * `alreadyHave` 는 차이 게이트 전의 이름(같은 말 + 다른 말 전부)이라 옛 stats 에만 있다.
   * 옛 실행의 stats 에는 칸이 없으므로 `?? 0` — 없다고 NaN 이 되면 요약 한 줄이 통째로 못 읽히게 된다.
   */
  const already = ex?.alreadyHave ?? 0;
  const same = ex?.sameAsSite ?? 0;
  const stale = ex?.stale ?? 0;
  const weak = ex?.weak ?? 0;
  const blocked = ex?.blocked ?? 0;
  const tail = [
    already && `이미 있음 ${already}`,
    same && `같은 말 ${same}`,
    stale && `옛 글 ${stale}`,
    weak && `근거 약함 ${weak}`,
    blocked && `차단 ${blocked}`,
  ].filter(Boolean).map((part) => ` · ${part}`).join('');
  const excluded = ex
    ? ` · 제외 ${ex.other + ex.notJeju + ex.notAllowed + already + same + stale + weak + blocked}(other ${ex.other} · 제주밖 ${ex.notJeju} · 동반불가 ${ex.notAllowed}${tail})`
    : '';
  // 짝이 게시된 장소인 후보의 종류 — 이 두 수가 차이 게이트를 지나 올라온 것이다. 옛 stats 엔 칸이 없다.
  const kinds = stats.update || stats.fill ? ` · 갱신 ${stats.update ?? 0} · 보강 ${stats.fill ?? 0}` : '';
  const dup = stats.dup ? ` · 중복표시 ${stats.dup}` : '';
  // 사람이 고친 후보가 있는 (글, 가게) 는 새로 만들지 않았다 — 제외 합계와 단계가 달라(추출 뒤·짝짓기 전) 따로 적는다. 옛 stats 엔 칸이 없다.
  const edited = stats.edited ? ` · 고침 유지 ${stats.edited}` : '';
  /*
   * 교차점검은 **점검한 수와 근거를 못 찾은 수를 같이** 적는다. 하나만 적으면 0 을 두 가지로 읽을 수 있다 —
   * "전부 근거가 있었다" 와 "패스가 안 돌았다" 는 운영자가 해야 할 일이 정반대다(⚠️ 판정 불가에 속지 말 것과 같은 자리).
   */
  const v = stats.verify;
  const verify = v ? ` · 교차점검 ${v.checked}건(근거 없음 ${v.noEvidence} · 동반 불가 정황 ${v.notAllowed}${v.failed ? ` · 실패 ${v.failed}` : ''})` : '';
  // 제안(셋째 패스) — 갱신이 생긴 장소 수와 제안을 실은 수를 같이(교차점검과 같은 이유: 0 이 "안 돌았다" 인지 "실패했다" 인지 갈라야 한다).
  const p = stats.propose;
  const propose = p && p.places ? ` · 제안 ${p.done}/${p.places}곳${p.failed ? `(실패 ${p.failed})` : ''}` : '';
  return `${prefix}분석 ${stats.analyzed}건 (후보 ${stats.candidates} · 일치 ${stats.auto} · 확인요청 ${stats.ask} · 신규 ${stats.new}${kinds}${dup} · 건너뜀 ${stats.skipped}${dropped}${excluded}${edited}${verify}${propose}) · ${meterSummary}`;
}
