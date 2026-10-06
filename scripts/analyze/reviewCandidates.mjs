// pnpm data:review(scripts/review-candidates.mjs)가 쓰는 순수 함수 — 후보 묶기 · 검수 순서 · 표식 · 미리보기 · 출력. I/O 없음, 테스트는 reviewCandidates.test.mjs.
//
// 왜 있나 — 검수의 유일한 창이 Studio 의 JSONB 셀이었다(2026-09-28 설계 검토 RP-1·OB-8·FF-5). 사람이 "정리된 데이터" 를 보고 결정하려면
//  (1) 같은 가게를 묶어야 하고(첫 분석에서 같은 펜션이 13건), (2) 앱이 그 문장을 어떻게 읽을지 — 정규식(parsePetPolicy)과 AI 판단(petPolicy),
//  그리고 앱이 실제로 쓰는 병합 결과(withPolicyFacts) — 를 미리 봐야 하고, (3) 무엇이 비었는지(지역·좌표·조건문) 표식으로 보여야 한다.
// 본문 인용(evidence)·원문은 --verbose 뒤에서만 찍는다(docs/todo/05 의 로그 위생 — 기본 출력은 이름·종류·구간·표식·구조화 결과만).
import { correctPetPolicyFacts, feeLinesOf } from '../lib/petPolicyFacts.mjs';
import { isToponymKey, normalizeName, sameSpot } from './matchPlace.mjs';

const TIER_ORDER = { auto: 0, ask: 1, new: 2 };
export const TIER_LABEL = { auto: '일치', ask: '확인요청', new: '신규' };
/** 종류(docs/todo/11 U2) — 승인하면 무슨 일이 일어나나. 터미널 말. 화면 말은 `KIND_LABEL`(src/lib/adminCandidates.ts). */
export const KIND_LABEL = { update: '갱신', fill: '보강', new: '신규', ask: '확인' };

/**
 * 후보 한 줄의 종류. 분석이 `extracted.match.kind` 를 싣기 전(11 T1.1)의 후보는 칸이 없다 — 그때는 짝의 확신으로 정한다
 * (auto 는 '보강' — 옛 '기존' 의 뜻이 빈 칸 채우기였다). 칸이 있어도 tier 와 어긋나면(사람이 짝을 바꾼 뒤 등) tier 를 믿는다.
 */
export function kindOfRow(row) {
  const match = row?.extracted?.match;
  const tier = match?.tier ?? 'new';
  if (tier !== 'auto') return tier;
  return match?.kind === 'update' ? 'update' : 'fill';
}
const TYPE_LABEL = { stay: '숙소', restaurant: '식당', cafe: '카페', other: '기타' };

/** 묶는 키. 옛 후보(nameKey 없음)는 이름으로 계산한다. */
export const nameKeyOf = (extracted) => extracted?.nameKey ?? normalizeName(extracted?.name ?? '');

/**
 * 🙋 검수 순서 — 여기는 사용자가 다듬을 자리다. 무엇을 먼저 볼지는 도메인 판단이고 코드가 정할 수 없다. 지금 기본(작을수록 먼저):
 *   0) 종류가 갱신(사이트와 다른 사실을 말하는 글)인 묶음 — 사이트가 틀려 있을 수 있다
 *   1) 구간: 일치(auto) → 확인요청(ask) → 신규(new)   — 기존 장소에 붙는 것이 빠르고 안전하다
 *   2) 직접 방문한 글(visited)이 목록·추천 글보다 먼저   — 목록 글은 이름·주소뿐이라 조건 확인이 안 된다(첫 분석: 한 글이 101건)
 *   3) 이용 조건 문장이 있는 것이 먼저                    — 없는 후보는 승인해도 앱이 '정보 없음' 으로만 보여 준다
 *   4) **독립 글**이 여럿인 것이 먼저                       — 여러 사람이 말한 가게. 같은 블로그·같은 제목 틀의 글 묶음은 하나로 센다(`postClusters`)
 *   5) AI confidence 높은 것이 먼저
 * 예: 신규 발굴을 우선하면 1) 을 맨 뒤로 보내고, 목록 글을 아예 뒤로 밀려면 2) 를 1) 앞에 둔다. 반환 배열의 앞자리가 더 센 기준이다.
 */
export function reviewPriority(group) {
  return [
    // 0) 갱신이 맨 앞 — 사이트가 틀려 있을 수 있는 시간이 곧 비용이다(11 T1.2). 옛 묶음(kind 없음)은 갱신이 아니다.
    group.kind === 'update' ? 0 : 1,
    TIER_ORDER[group.tier] ?? 9,
    group.visited ? 0 : 1,
    group.hasPolicyText ? 0 : 1,
    -(group.independentPosts ?? group.posts.length),
    -group.confidence,
  ];
}

export function compareGroups(a, b) {
  const pa = reviewPriority(a);
  const pb = reviewPriority(b);
  for (let i = 0; i < pa.length; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return String(a.lead.extracted?.name ?? '').localeCompare(String(b.lead.extracted?.name ?? ''), 'ko');
}

/**
 * 🙋 "비슷한 글" 의 문턱 — 사람이 다듬을 자리. 2026-10-04 실측: 한 식당 후보의 글 5건이 이틀 사이에 올라왔고 제목이 전부
 * "제주공항 근처 애견동반식당 …" 틀이었다(광고성 복제 글). URL 이 다섯이라 "글 5건" · 검수 순서 앞자리 · "근거 글 둘 이상" 을 다 통과했다.
 *  - `SIMILAR_TITLE_MIN_CHARS` 두 제목이 **이어진 같은 글자열**을 이만큼 이상 나눠 가지면 같은 틀이다. 공백·기호를 떼고, 후보의 가게 이름을 뺀 뒤 잰다.
 *    실측: 복제 글끼리는 최소 12자("제주공항근처애견동반식당"), 서로 다른 블로거의 평범한 후기는 최대 7자("서귀포카페추천").
 *    토큰·바이그램 겹침은 가르지 못했다 — 두 무리의 값이 0.37 ↔ 0.36 으로 붙어 있었다(제목이 짧고 '카페·추천·애견동반' 이 어디에나 있다).
 *  - `SIMILAR_POST_WINDOW_DAYS` 그 두 글이 며칠 안에 올라왔나. 날짜를 모르면 제목만으로 묶지 않는다 — 모르는 것으로 근거를 깎지 않는다.
 * 같은 블로그(`blog_id`)의 글은 제목·날짜와 무관하게 하나다 — 한 사람이 여러 번 쓴 것은 여러 사람이 말한 것이 아니다.
 * 넘치게 묶으면 근거를 **적게** 세는 쪽으로 틀린다(검수 순서가 뒤로 · 완화 제안이 꺼진 채 시작) — 반대보다 안전하다.
 * 알려진 갈래: 검색어를 그대로 제목에 쓴 서로 다른 블로거의 글("제주 애견동반 카페 추천 ○○" ↔ "… ○○ 후기")은 가게 이름을 빼면
 * 정확히 10자("제주애견동반카페추천")가 같아 며칠 안이면 묶인다. 지역·검색어 말을 빼고 재면 이 틀은 풀리지만 광고 틀("제주공항근처애견동반식당")도
 * 함께 부서진다 — 그래서 문턱을 그대로 두고 적게 세는 쪽을 택했다(`reviewCandidates.test.mjs` 가 이 갈래를 고정한다).
 */
export const SIMILAR_TITLE_MIN_CHARS = 10;
export const SIMILAR_POST_WINDOW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 가게 이름에서 떼어 낼 조각이 아닌 말 — 이름의 일부여도 제목 틀의 일부다("서린 제주 고기국수" 의 '제주' 를 떼면 "제주공항" 이 부서진다). */
const NAME_TOKEN_KEEP = new Set(['제주', '제주점', '본점', '카페', 'cafe']);
const squash = (text) => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** 제목을 비교용으로 — 공백·기호를 떼고 가게 이름 조각(통째 · 띄어 쓴 조각 2자 이상, 지명·접사 제외)을 지운다. 긴 조각부터. */
function titleCore(title, names) {
  const pieces = new Set();
  for (const name of names) {
    const whole = squash(name);
    if (whole.length >= 2) pieces.add(whole);
    const key = normalizeName(name);
    if (key.length >= 2 && !isToponymKey(key)) pieces.add(key);
    for (const token of String(name ?? '').split(/\s+/)) {
      const t = squash(token);
      if (t.length >= 2 && !NAME_TOKEN_KEEP.has(t) && !isToponymKey(t)) pieces.add(t);
    }
  }
  let core = squash(title);
  for (const piece of [...pieces].sort((a, b) => b.length - a.length)) core = core.split(piece).join('');
  return core;
}

/** 두 문자열이 함께 가진 가장 긴 이어진 글자열의 길이. 제목은 수십 자라 O(n·m) 로 충분하다. */
function longestCommonRun(a, b) {
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/**
 * 글들을 **독립 글** 덩어리로 — 같은 블로그이거나, 제목 틀이 같고(`SIMILAR_TITLE_MIN_CHARS`) 며칠 안(`SIMILAR_POST_WINDOW_DAYS`)이면 한 덩어리. 순수.
 * 한 덩어리에 이어지는 것은 사슬로 퍼진다(A~B, B~C 면 A·B·C 가 하나).
 * @param {{ url: string, blogId?: string | null, title?: string | null, postedAt?: string | null }[]} posts  url 이 같은 글은 한 번만
 * @param {string[]} [names]  후보의 가게 이름들 — 제목에서 지우고 잰다(가게 이름이 겹치는 것만으로 묶이지 않게)
 * @returns {string[][]}  덩어리마다 url 목록(입력 순서)
 */
export function postClusters(posts, names = []) {
  const list = [];
  const seen = new Set();
  for (const post of posts ?? []) {
    if (!post?.url || seen.has(post.url)) continue;
    seen.add(post.url);
    const time = post.postedAt ? new Date(post.postedAt).getTime() : NaN;
    list.push({ url: post.url, blogId: post.blogId ?? null, core: post.title ? titleCore(post.title, names) : null, time });
  }
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const sameBlog = a.blogId != null && a.blogId === b.blogId;
      const close = Number.isFinite(a.time) && Number.isFinite(b.time) && Math.abs(a.time - b.time) <= SIMILAR_POST_WINDOW_DAYS * DAY_MS;
      const sameFrame = close && a.core && b.core && longestCommonRun(a.core, b.core) >= SIMILAR_TITLE_MIN_CHARS;
      if (sameBlog || sameFrame) parent[find(j)] = find(i);
    }
  }
  const out = new Map();
  list.forEach((post, i) => {
    const root = find(i);
    if (!out.has(root)) out.set(root, []);
    out.get(root).push(post.url);
  });
  return [...out.values()];
}

/** 후보 행들 → `postClusters` 의 입력. 글 정보는 `blog_posts` 임베딩에서(없으면 url 만 — 그때는 url 하나가 한 덩어리다). */
export function postsOfRows(rows) {
  return (rows ?? [])
    .filter((row) => row?.post_url)
    .map((row) => ({ url: row.post_url, blogId: row.blog_posts?.blog_id ?? null, title: row.blog_posts?.title ?? null, postedAt: row.blog_posts?.posted_at ?? null }));
}

/**
 * 행들의 독립 글 수. 고른 url(`urls`)만 셀 수도 있다 — 제안의 근거 글(`basedOn`)처럼.
 * @param {readonly object[]} rows
 * @param {readonly string[] | null} [urls]
 * @returns {number}
 */
export function independentPostCount(rows, urls = null) {
  const wanted = urls ? new Set(urls) : null;
  const posts = postsOfRows(rows).filter((post) => !wanted || wanted.has(post.url));
  const names = [...new Set((rows ?? []).map((row) => row?.extracted?.name).filter(Boolean))];
  // 고른 url 중 행에 없는 것도 하나씩 센다 — 모르는 글을 0 으로 세면 근거가 사라진다.
  const known = new Set(posts.map((post) => post.url));
  const unknown = wanted ? [...wanted].filter((url) => !known.has(url)).length : 0;
  return postClusters(posts, names).length + unknown;
}

/** 묶음 하나의 요약 칸을 채운다 — 행이 바뀌면(같은 자리 묶음 합치기) 다시 부른다. */
function summarizeGroup(g) {
  g.rows.sort((a, b) => (b.extracted?.confidence ?? 0) - (a.extracted?.confidence ?? 0));
  g.lead = g.rows[0];
  g.tier = g.rows.map((r) => r.extracted?.match?.tier ?? 'new').sort((a, b) => (TIER_ORDER[a] ?? 9) - (TIER_ORDER[b] ?? 9))[0];
  g.kind = g.rows.some((r) => kindOfRow(r) === 'update') ? 'update' : g.tier === 'auto' ? 'fill' : g.tier;
  g.visited = g.rows.some((r) => r.extracted?.visited !== false);
  g.hasPolicyText = g.rows.some((r) => Boolean(r.extracted?.petPolicyText));
  g.confidence = Math.max(...g.rows.map((r) => r.extracted?.confidence ?? 0));
  g.posts = [...new Set(g.rows.map((r) => r.post_url).filter(Boolean))];
  g.independentPosts = independentPostCount(g.rows);
  return g;
}

const spotOf = (row) => ({ address: row?.extracted?.address ?? null, geo: row?.extracted?.geo ?? null });
// 같은 건물의 **다른 업종**은 다른 가게다 — 1층 카페 "모루티" ↔ 위층 숙소 "스테이모루티"(2026-10-04). 종류를 둘 다 아는데 다르면 묶지 않는다.
const sameTypeRows = (a, b) => !a?.extracted?.type || !b?.extracted?.type || a.extracted.type === b.extracted.type;

/**
 * 이름 키가 다른 **신규** 묶음끼리 같은 자리면 한 묶음으로(2026-10-04) — "본카페" ↔ "애월본카페". 순수.
 *
 * 이름 키가 '본'(1자)·'애월본' 이라 `nameSimilarity` 의 부분 일치(2자)도, 지점 꼬리(`sameBranchStem`)도 못 잡는데 두 주소는
 * `제주 제주시 애월읍 애월해안로 179` ↔ `… 179 본카페` 로 같은 자리다(`sameSpot` — 주소 'same', 두 좌표가 다 있으면 100m 안).
 * 두 줄로 두면 운영자가 둘 다 올려 같은 자리에 장소가 둘 선다. 분석은 앞으로 키를 물려받지만(`newSiblingOf`) 이미 쌓인 후보는 여기서 묶는다.
 *
 * 대상은 짝이 없는 신규 묶음(`name:` 키 · tier 'new')뿐이다 — 기존 장소에 붙은 묶음은 이미 그 장소 id 로 묶였다.
 * 묶음 안의 행 어느 둘이든 같은 자리면 잇고, 사슬로 퍼진다. 합친 묶음의 키는 원래 키 중 가장 앞(정렬)의 것 — 다시 묶어도 같은 키가 나온다.
 * 같은 건물의 다른 가게도 같은 주소다 — **종류가 다르면 묶지 않는다**(카페 "모루티" ↔ 숙소 "스테이모루티"). 종류까지 같은 다른 가게는 여전히 걸리므로
 * 합치는 것은 **화면의 한 줄**이지 데이터가 아니다. 대표 이름 밖의 이름은 화면이 같이 보여 준다.
 */
export function mergeSameSpotGroups(groups) {
  const isNew = (g) => g.key.startsWith('name:') && g.tier === 'new' && !g.rows.some((r) => r.match_place_id);
  const pool = groups.filter(isNew);
  if (pool.length < 2) return groups;
  const parent = pool.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      if (find(i) === find(j)) continue;
      if (pool[i].rows.some((a) => pool[j].rows.some((b) => sameTypeRows(a, b) && sameSpot(spotOf(a), spotOf(b))))) parent[find(j)] = find(i);
    }
  }
  const merged = new Map();
  pool.forEach((g, i) => {
    const root = find(i);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root).push(g);
  });
  const out = groups.filter((g) => !isNew(g));
  for (const members of merged.values()) {
    if (members.length === 1) {
      out.push(members[0]);
      continue;
    }
    const key = members.map((g) => g.key).sort()[0];
    out.push(summarizeGroup({ key, rows: members.flatMap((g) => g.rows) }));
  }
  return out;
}

/**
 * pending 후보를 같은 가게로 묶는다 — 기존 장소에 붙은 것은 match_place_id 로, 신규는 nameKey 로, 그리고 키가 달라도 같은 자리인 신규끼리(`mergeSameSpotGroups`).
 * 묶음마다 대표(lead)는 AI confidence 가 가장 높은 후보. 묶음의 구간은 가장 강한 것(auto > ask > new).
 * 묶음의 종류(`kind`)는 **갱신이 하나라도 있으면 갱신**이다 — 다른 말을 하는 글이 하나라도 있으면 그 묶음은 "볼 일" 이다(11 U2).
 * 아니면 묶음의 구간을 따른다(auto → 보강).
 */
export function groupCandidates(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.match_place_id ? `place:${row.match_place_id}` : `name:${nameKeyOf(row.extracted)}`;
    if (!groups.has(key)) groups.set(key, { key, rows: [] });
    groups.get(key).rows.push(row);
  }
  // 키로 묶은 뒤 이름 키가 다른 같은 자리의 신규 묶음을 합친다(`mergeSameSpotGroups`) — CLI 와 화면이 같은 묶음을 보게 여기서 한다.
  return mergeSameSpotGroups([...groups.values()].map(summarizeGroup)).sort(compareGroups);
}

/**
 * 앱이 이 후보의 이용 조건을 어떻게 읽을지 — 정규식(parsePetPolicy)과 AI 판단(petPolicy)을 각각, 그리고 앱이 실제로 쓰는 병합 결과(withPolicyFacts).
 * 둘이 어긋나면 표식으로 알린다 — 그 자리가 "정규화가 잘 됐는가" 의 실측이다. parsers 는 src/lib/petPolicy.ts 의 세 함수(CLI 가 넘긴다).
 */
export function previewPolicy(extracted, { parsePetPolicy, toPetBadges, withPolicyFacts }) {
  const text = extracted?.petPolicyText ?? '';
  const regex = parsePetPolicy(text);
  const facts = extracted?.petPolicy ?? null;
  const merged = withPolicyFacts(regex, facts, text);
  const regexBadges = toPetBadges(regex).map((b) => b.label);
  /*
   * 라벨과 톤을 **한 번에** 낸다. 예전에는 라벨 배열만 돌려줘서, 화면이 '동반 불가' 를 눈에 띄게 하려면
   * 라벨 문자열로 톤을 되찾아야 했다 — 요금 문장('1마리당 2만원')처럼 값이 그대로 라벨이 되는 것이 있어
   * 그 되찾기는 반드시 실패한다. 순서는 `toPetBadges` 하나가 정한다(사이트와 같은 순서다).
   */
  const mergedBadgeList = toPetBadges(merged);
  const mergedBadges = mergedBadgeList.map((b) => b.label);
  const flags = [];
  if (!text) flags.push('조건문 없음');
  else if (regexBadges.length === 0) flags.push('정규식 못읽음');
  if (text && !facts) flags.push('AI 판단 없음');
  if (facts && facts.indoor !== 'unknown' && regex.indoor !== 'unknown' && facts.indoor !== regex.indoor) flags.push(`AI≠정규식(실내 ${facts.indoor}/${regex.indoor})`);
  if (merged.notAllowed) flags.push('동반불가 문장');
  // AI 판단 중 원문에 근거가 없어 앱이 빼고 보는 것(withPolicyFacts 가 같은 함수를 부른다). facts 는 **모델이 낸 그대로** 두고
  // 뺀 것을 따로 싣는다 — 운영자가 "AI 는 이렇게 읽었고 이건 원문에 없어서 안 썼다" 를 나란히 봐야 프롬프트를 고칠 수 있다.
  const { corrections, dropped } = correctPetPolicyFacts(facts, text);
  if (corrections.length) flags.push('AI 판단 보정');
  const level = merged.noInfo ? '정보없음' : merged.notAllowed ? '동반불가' : merged.unread ? '못읽음' : mergedBadges.length ? '조건' : '자유';
  return { regexBadges, mergedBadges, mergedBadgeList, facts, corrections, dropped, flags, level };
}

/** 묶음 단위 표식 — 승인하기 전에 채워야 할 것. */
export function groupFlags(group) {
  const e = group.lead.extracted ?? {};
  const flags = [];
  if (!e.regionRaw) flags.push('지역 없음');
  if (!e.geo) flags.push('좌표 없음');
  if (!group.visited) flags.push('목록글');
  if (group.rows.some((r) => r.extracted?.dupOf)) flags.push('중복표시');
  if (group.tier !== 'new' && !group.rows.some((r) => r.match_place_id)) flags.push('짝 없음');
  return flags;
}

const shortId = (id) => String(id ?? '').slice(0, 8);
const factsLine = (facts) => {
  if (!facts) return null;
  const parts = [];
  if (facts.indoor !== 'unknown') parts.push({ free: '실내 자유', cage: '실내 케이지', outdoorOnly: '야외만' }[facts.indoor]);
  if (facts.leash) parts.push('리드줄');
  if (facts.largeDogOk === true) parts.push('대형견 OK');
  if (facts.largeDogOk === false) parts.push('대형견 불가');
  if (facts.smallDogOnly) parts.push('소형견만');
  if (facts.weightLimitKg != null) parts.push(`~${facts.weightLimitKg}kg`);
  if (facts.maxDogs != null) parts.push(`최대 ${facts.maxDogs}마리`);
  if (facts.feeFree === true) parts.push('추가요금 없음');
  // 요금은 줄마다 하나 — 첫 줄만 찍으면 구간 요금표("1~5kg 1만원" + "6~10kg 1.5만원")의 둘째 줄이 터미널에서도 사라진다.
  parts.push(...feeLinesOf(facts));
  if (facts.callFirst) parts.push('전화 확인');
  if (facts.vaccineRequired) parts.push('예방접종 필수');
  if (facts.notes) parts.push(facts.notes);
  return parts.length ? parts.join(' · ') : '(판단 없음)';
};

/**
 * 묶음 하나를 터미널 몇 줄로. verbose 면 원문·evidence 까지(본문 인용이라 기본은 안 찍는다).
 * @param {object} group  groupCandidates 결과 하나
 * @param {object} preview  previewPolicy(lead.extracted) 결과
 * @param {{ verbose?: boolean, matchedName?: string | null }} [opts]
 */
export function formatGroup(group, preview, { verbose = false, matchedName = null } = {}) {
  const e = group.lead.extracted ?? {};
  const head = [
    `■ ${e.name}`,
    `[${TYPE_LABEL[e.type] ?? e.type} · ${TIER_LABEL[group.tier] ?? group.tier}${group.tier === 'auto' && group.kind ? `(${KIND_LABEL[group.kind]})` : ''}${group.lead.match_confidence != null && group.tier !== 'new' ? ` ${Number(group.lead.match_confidence).toFixed(2)}` : ''}${matchedName ? ` → ${matchedName}` : ''} · AI ${group.confidence.toFixed(2)} · 글 ${group.posts.length}${group.independentPosts != null && group.independentPosts < group.posts.length ? `(비슷한 글 묶음 ${group.independentPosts})` : ''}]`,
    e.regionRaw ?? '지역?',
    e.geo ? `좌표 ${e.geoSource ?? 'local'}` : '',
    ...groupFlags(group).map((f) => `⚠ ${f}`),
  ].filter(Boolean);
  const lines = [head.join('  ')];
  lines.push(`   id ${group.rows.map((r) => shortId(r.id)).join(' ')}   ${group.posts.slice(0, 2).join('  ')}${group.posts.length > 2 ? `  (+${group.posts.length - 2})` : ''}`);
  const policy = [
    `조건: ${preview.level}`,
    `정규식 [${preview.regexBadges.join(', ') || '—'}]`,
    `AI [${factsLine(preview.facts) ?? '—'}]`,
    `앱 [${preview.mergedBadges.join(', ') || '—'}]`,
    ...preview.flags.map((f) => `⚠ ${f}`),
  ];
  lines.push(`   ${policy.join(' · ')}`);
  if (e.address || e.addressAi) lines.push(`   주소: ${e.address ?? '—'}${e.addressAi && e.addressAi !== e.address ? ` (AI: ${e.addressAi})` : ''}`);
  if (verbose) {
    if (e.petPolicyText) lines.push(`   원문: ${String(e.petPolicyText).replace(/\s*\n\s*/g, ' / ')}`);
    if (e.features) lines.push(`   소개: ${e.features}`);
    for (const row of group.rows) {
      for (const q of row.extracted?.evidence ?? []) lines.push(`   “${q}” — ${shortId(row.id)}`);
    }
  }
  return lines.join('\n');
}

/** 마크다운 보고서 — 파일로 저장해 에디터에서 검수할 때. verbose 와 같은 정보를 담는다(원문·evidence 포함). */
export function formatMarkdown(groups, previews, { matchedNames = new Map() } = {}) {
  const out = [`# 후보 검수 (pending ${groups.reduce((n, g) => n + g.rows.length, 0)}건 · 묶음 ${groups.length})`, ''];
  for (const g of groups) {
    const e = g.lead.extracted ?? {};
    const p = previews.get(g.key);
    out.push(`## ${e.name} — ${TYPE_LABEL[e.type] ?? e.type} · ${TIER_LABEL[g.tier] ?? g.tier}${matchedNames.get(g.key) ? ` → ${matchedNames.get(g.key)}` : ''}`);
    out.push('');
    out.push(`- id: ${g.rows.map((r) => `\`${shortId(r.id)}\``).join(' ')}`);
    out.push(`- 지역: ${e.regionRaw ?? '—'} · 좌표: ${e.geo ? `${e.geo.lat}, ${e.geo.lng} (${e.geoSource ?? 'local'})` : '—'} · 주소: ${e.address ?? '—'}`);
    out.push(`- 표식: ${[...groupFlags(g), ...p.flags].map((f) => `⚠ ${f}`).join(' ') || '없음'}`);
    out.push(`- 조건(${p.level}): 정규식 [${p.regexBadges.join(', ') || '—'}] · AI [${factsLine(p.facts) ?? '—'}] · 앱 [${p.mergedBadges.join(', ') || '—'}]`);
    for (const note of p.corrections ?? []) out.push(`  · AI 보정: ${note}`);
    if (e.petPolicyText) out.push(`- 원문: ${String(e.petPolicyText).replace(/\n/g, ' / ')}`);
    if (e.features) out.push(`- 소개: ${e.features}`);
    for (const row of g.rows) {
      out.push(`- 글: ${row.post_url}`);
      for (const q of row.extracted?.evidence ?? []) out.push(`  > ${q}`);
    }
    out.push('');
  }
  return out.join('\n');
}

/** id 앞자리로 후보를 고른다. 없는 것·둘 이상 맞는 것은 따로 돌려준다 — 조용히 엉뚱한 후보를 승인하지 않게. */
export function resolveIds(rows, prefixes) {
  const found = [];
  const missing = [];
  const ambiguous = [];
  for (const prefix of prefixes) {
    const hits = rows.filter((r) => String(r.id).startsWith(prefix));
    if (hits.length === 1) found.push(hits[0]);
    else if (hits.length === 0) missing.push(prefix);
    else ambiguous.push(prefix);
  }
  return { found, missing, ambiguous };
}

/** `list [--tier t] [--limit N] [--verbose] [--md 경로]` · `status` · `approve <id…> [--merge-into id] [--note …]` · `reject <id…> --note …` */
export function parseReviewArgs(argv) {
  const args = { command: 'list', ids: [], tier: null, limit: null, verbose: false, md: null, mergeInto: null, note: null, all: false };
  const rest = [...argv];
  if (rest.length && !rest[0].startsWith('-')) args.command = rest.shift();
  if (!['list', 'status', 'approve', 'reject'].includes(args.command)) throw new Error(`알 수 없는 명령: ${args.command}`);
  while (rest.length) {
    const arg = rest.shift();
    const takeValue = (name) => {
      const v = rest.shift();
      if (v === undefined) throw new Error(`${name} 뒤에 값이 필요합니다`);
      return v;
    };
    if (arg === '--verbose' || arg === '-v') args.verbose = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--tier') {
      args.tier = takeValue('--tier');
      if (!TIER_ORDER[args.tier] && args.tier !== 'auto') throw new Error(`--tier 는 auto|ask|new: ${args.tier}`);
    } else if (arg === '--limit') {
      const v = takeValue('--limit');
      if (!/^\d+$/.test(v) || Number(v) < 1) throw new Error(`--limit 은 1 이상의 정수: ${v}`);
      args.limit = Number(v);
    } else if (arg === '--md') args.md = takeValue('--md');
    else if (arg === '--merge-into') args.mergeInto = takeValue('--merge-into');
    else if (arg === '--note') args.note = takeValue('--note');
    else if (arg.startsWith('-')) throw new Error(`알 수 없는 인자: ${arg}`);
    else args.ids.push(arg);
  }
  if ((args.command === 'approve' || args.command === 'reject') && args.ids.length === 0 && !args.tier) {
    throw new Error(`${args.command} 는 후보 id(앞자리) 또는 --tier 가 필요합니다`);
  }
  if (args.command === 'reject' && !args.note) throw new Error('reject 는 --note "이유" 가 필요합니다(reviewer_note 에 남는다)');
  return args;
}
