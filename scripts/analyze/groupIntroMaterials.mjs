// 묶음 소개(docs/todo/13 §5.3)의 **재료와 지문** — 노드 모듈을 쓰지 않는다. 분석(`groupIntroPass.mjs`)이 이것으로 다시 만들 묶음을 고르고,
// /admin(A3)이 같은 함수로 저장된 소개가 지금 묶음의 것인지 가린다 — 두 쪽이 다른 식으로 재면 화면이 낡은 소개를 지금 것으로 보인다.
// 그래서 `synthesizeGroupIntro.mjs`(node:crypto · claude 실행기를 부른다)에서 떼어 냈고, 그 파일은 여기의 `synthesisMaterials` 를 다시 내보낸다.
// 소개의 **내용 규칙**(`introTextReasons`, A4 에서 강아지와 묶인 문장으로 좁혔다)과 어느 소개를 쓸지(`chooseGroupIntro`, A3)도 같은 이유로 여기 있다 — 카드·등록(/admin)과 CLI 반영이 한 함수를 지난다.
import { POLICY_TOPICS, topicReasons } from '../lib/petPolicyGuide.mjs';

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * 블로그·글쓴이 이야기, 1인칭, 독자에게 하는 말 — 소개 지시가 금하는 것을 코드로 한 번 더.
 * 엔젤하우스(펜션 자기 블로그)의 요약: "건강 정보를 연재해요" · "오름 산책 시리즈를 소개해요" · "소형견 전용 숙소로 소개돼요" — 장소가 아니라 글이 하는 말이다.
 */
export const INTRO_VOICE_RE = /블로그|포스팅|연재|시리즈|소개(?:해|돼|되|하)|체험단|협찬|광고|원고료|내돈내산|저희|제가|하세요|해\s*주세요|추천해요/;

/** 강아지 낱말 — 혼자서는 조건이 아니다("야외 테이블과 강아지 밥그릇이 있어요"). `카펫` 의 `펫` 은 빼고. */
const DOG_WORD = '강아지|반려견|반려동물|애견|댕댕|멍멍|(?:^|[^카])펫';
const DOG_RE = new RegExp(DOG_WORD);

/**
 * 그 자체로 동반 조건을 말하는 꼴 — 강아지 낱말이 없어도 그 문장은 강아지와 묶여 있다.
 * 동반·입장·출입(입장료·출입문은 빼고) · 허락과 한정("불가" · "안 돼요" · "야외에서만" · "테라스만 이용") · 마릿수의 한도 ·
 * "함께 머물/들어가요"(추출 소개 지시가 금하는 바로 그 문장) · 강아지에게만 쓰는 말(소형견·대형견·목줄·케이지·개모차·접종·kg·`4견`).
 */
const CONDITION_RE =
  /동반|입장(?!료)|출입(?![문구])|불가|금지|허용|안\s*[돼되]|에서만|만\s*(?:가능|이용|입장|출입|돼|되|들어)|까지\s*(?:가능|입장|출입|돼|되|들어)|마리\s*(?:까지|이하|당|만)|함께\s*(?:머물|들어|입장|앉)|소형견|중형견|대형견|목줄|리드\s*줄|하네스|케이지|켄넬|이동\s*가방|개모차|접종|백신|\d\s*(?:kg|㎏|킬로|키로)|\d\s*견/i;

/**
 * 강아지 낱말과 한 문장에 오면 조건이 되는 말 — 가능·"수 있어요"·한정·요금. "주차가 가능해요" · "객실 전용 풀" 은 강아지가 없어 조건이 아니다.
 * `전용`·`함께` 는 강아지 낱말에 붙어 있을 때만("강아지 전용 야외 수영장" · "강아지와 함께") — 떨어져 있으면 "객실 전용 … 반려견 용품" 을 잡는다.
 * "반려견이 뛰어놀 수 있는 잔디마당과 … 야외 테라스" 처럼 시설 묘사도 일부 걸린다 — 실내를 말하는 같은 꼴("실내에 강아지가 뛰어놀 수 있어요")이 판정과 갈리므로 엄한 쪽에 둔다.
 */
const WITH_DOG_RE = new RegExp(
  `가능|수\\s*[있없]|(?:${DOG_WORD})\\s*전용|(?:${DOG_WORD})(?:와|과|랑|이랑|하고|도)?\\s*함께|머물|제한|받(?:아|는|습)|까지|이하|미만|최대|요금|입장료`,
);

/** 문장이 강아지와 묶여 있나 — 묶인 문장의 판단 칸 주제만 소개에서 뺀다. 금액은 강아지 낱말과 한 문장이면 강아지 요금이다. */
const boundToDog = (sentence) =>
  CONDITION_RE.test(sentence) || (DOG_RE.test(sentence) && (WITH_DOG_RE.test(sentence) || POLICY_TOPICS.fees.find(sentence) !== null));

/**
 * 소개 문장의 **내용** 규칙 — 강아지와 묶인 문장의 판단 칸 주제(소개가 동반 조건을 말하면 판정과 갈린다)와 블로그 이야기. 이유들(없으면 빈 배열).
 * 주제 낱말만으로는 걸지 않는다(13 §5.3 A4) — "야외 테라스가 있어요" · "실내가 넓어요" 는 공간 묘사이고, 추출 소개 지시도 공간을 "강아지와 묶지 않고" 쓰라고 한다.
 * 낱말만 보던 때는 신규 묶음의 대체 소개 넷 중 하나가 이것으로 '소개 없이 등록' 이었다. 문장 단위다 — 첫 문장의 "애견 펜션" 이 둘째 문장의 "야외 잔디마당" 을 묶지 않는다.
 * 안내 가드(`guardPublicText`)는 같은 `topicReasons` 를 낱말만으로 건다 — 안내는 판단 칸 밖의 말이라 그쪽은 일부러 엄하다.
 * 근거(가리킨 요약) 검사는 여기 없다 — 종합 문장(`synthesizeGroupIntro.mjs` 의 `sentenceReasons`)만 그것을 보고 이 규칙을 함께 부른다.
 * 종합을 거치지 않는 소개(재료 하나 · 대표 `features` 대체값 — 옛 프롬프트로 쓴 요약이 남아 있다, 13 §5.3 A3)는 이 규칙만 지난다.
 * @param {string} body
 * @returns {string[]}
 */
export function introTextReasons(body) {
  // lookbehind 없이 나눈다 — 이 모듈은 브라우저(/admin)도 import 한다(petPolicyGuide.mjs 머리 주석). "1.5kg" 의 점은 뒤에 공백이 없어 안 나뉜다.
  const sentences = body.split(/[.!?。]\s+|\n+/).filter((s) => s.trim());
  const reasons = sentences.flatMap((s) => (boundToDog(s) ? topicReasons(s) : []));
  const voice = body.match(INTRO_VOICE_RE);
  if (voice) reasons.push(`소개에 쓰지 않는 말이에요(${voice[0]})`);
  return [...new Set(reasons)];
}

/**
 * 묶음의 글들 → 모델에 보일 재료. 다녀온 글(`visited !== false`)의 요약만, 같은 요약은 하나로(글 id 를 모은다), 같은 글이 두 번 오면 앞의 것.
 * 순서는 편수 많은 것 → 문장 순이라 같은 입력이면 같은 번호가 나온다.
 * @param {readonly { id: string, features?: string | null, visited?: boolean | null }[]} posts
 * @returns {{ text: string, posts: string[] }[]}
 */
export function synthesisMaterials(posts) {
  const seen = new Set();
  const byText = new Map();
  for (const post of posts ?? []) {
    const id = text(post?.id);
    const features = text(post?.features);
    if (!id || !features || post.visited === false || seen.has(id)) continue;
    seen.add(id);
    if (!byText.has(features)) byText.set(features, []);
    byText.get(features).push(id);
  }
  return [...byText]
    .map(([t, ids]) => ({ text: t, posts: ids.sort() }))
    .sort((a, b) => b.posts.length - a.posts.length || a.text.localeCompare(b.text, 'ko'));
}

/** 소개를 다는 묶음 — 신규(`name:` 키 = 어느 행에도 짝 장소가 없다)만. 기존 장소의 소개는 사람이 쓴 글이라 AI 가 다시 쓰지 않는다(`proposePlaces.mjs`). */
export const isIntroGroup = (group) => typeof group?.key === 'string' && group.key.startsWith('name:');

/**
 * 묶음(`groupCandidates` 의 한 줄) → 종합의 입력. 이름·종류는 대표의 것, 글은 행마다 { id: 글 주소, features, visited }.
 * @param {{ lead?: { extracted?: object }, rows?: readonly { post_url?: string, extracted?: object }[] }} group
 */
export function groupIntroInput(group) {
  const lead = group?.lead?.extracted ?? {};
  return {
    name: lead.name ?? '',
    type: lead.type ?? '',
    posts: (group?.rows ?? []).map((row) => ({ id: row?.post_url, features: row?.extracted?.features ?? null, visited: row?.extracted?.visited ?? null })),
  };
}

/**
 * 재료의 지문 — 요약 문장과 그 글 주소들. 목록글·빈 요약·같은 글 두 번은 재료에서 이미 빠져 지문을 바꾸지 않는다.
 * 이름·종류·프롬프트 버전은 넣지 않는다 — 다시 만드는 때는 "새 글이 붙었거나 요약이 바뀐 묶음" 이다(대표가 바뀌어 이름 표기가 달라져도 부르지 않는다).
 * 해시는 cyrb53(53비트, 공개 도메인) — 브라우저에서도 같은 값이 나와야 해서 node:crypto 를 쓰지 않는다. 지문은 비밀이 아니라 비교 열쇠다.
 * 같은 이유로 해시 전에 **코드 단위 순서로** 다시 줄 세운다 — `synthesisMaterials` 의 순서(편수 → `localeCompare('ko')`)는 모델에 보일 번호용이고,
 * ICU 정렬은 Node 와 브라우저가 영문·숫자·기호 섞인 문장에서 갈릴 수 있다.
 * @param {readonly { text: string, posts: readonly string[] }[]} materials  `synthesisMaterials` 의 결과
 * @returns {string}  16진 14자리
 */
export function materialsFingerprint(materials) {
  const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pairs = (materials ?? []).map((m) => [m.text, [...m.posts].sort(byCodeUnit)]).sort((a, b) => byCodeUnit(a[0], b[0]));
  const source = JSON.stringify(pairs);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * 묶음의 소개 — **사이트에 나갈 소개는 이 함수 하나가 정한다**(13 §5.3 A3). 카드의 'AI 요약' · 펼친 줄의 '소개' · 등록(`approveGroup`) ·
 * CLI 반영(`apply-approved.mjs`)이 같은 묶음 · 같은 저장 줄로 이것을 부른다 — 갈리면 본 소개와 나간 소개가 다르다.
 *
 *  - 신규 묶음(`isIntroGroup`)만 대상이다. 기존 장소에 붙은 묶음은 대표 `features` 그대로다(빈 칸 채우기에만 쓰여 사람이 쓴 소개를 덮지 않는다).
 *  - 재료가 둘 이상이고 저장된 줄의 지문이 **지금 재료의 지문과 같을 때만** 저장값을 쓴다 — 충돌이면 소개 없음(사람이 제외·재분석으로 가른다),
 *    종합이면 그 소개. 지문이 다르거나 줄이 없으면(종합 전 · 새 글이 붙었다 · 요약이 바뀌었다) 대체값이다 — 낡은 종합을 지금 것으로 보이지 않는다.
 *  - 대체값: 재료가 하나면 그 요약, 아니면 대표의 `features`. 대표가 목록글인데 다녀온 글의 요약이 있으면 가장 많이 나온 요약이다(목록글의 소개는 글의 틀, 21 S7).
 *    대체값은 종합의 내용 규칙(`introTextReasons`)을 지나야 한다 — 걸리면 **소개 없음**(옛 프롬프트의 "소형견 전문"·"블로그로 소개해요" 가 그대로 나가는 것보다 낫다).
 *
 * @param {{ key?: string, lead?: { post_url?: string | null, extracted?: object }, rows?: readonly object[] } | null | undefined} group  `groupCandidates` 의 한 줄
 * @param {{ fingerprint?: string, intro?: string | null, sentences?: { text: string, posts: string[] }[] | null, conflict?: { reason: string, posts: string[] } | null, reasons?: string[] | null } | null | undefined} stored
 *   `group_intros` 의 그 묶음 줄(묶음 키로 찾은 것) — 없으면 null
 * @returns {{
 *   text: string | null, source: 'synth' | 'summary' | 'lead' | 'conflict',
 *   sentences: { text: string, posts: string[] }[], conflict: { reason: string, posts: string[] } | null,
 *   dropped: string[], droppedText: string | null,
 *   synth: 'fresh' | 'rejected' | 'waiting' | null, synthReasons: string[], materials: { text: string, posts: string[] }[],
 * }}
 *   text — 사이트에 나갈 소개(없으면 null) · sentences — 문장마다 출처 글 주소 · dropped/droppedText — 대체값이 걸린 규칙과 그 글(그래서 text 가 null) ·
 *   synth — 재료 둘 이상인 신규 묶음의 종합 상태(저장값 그대로 · 거부돼 대체값 · 아직 없어 대체값), 그 밖엔 null · synthReasons — 거부 이유(저장된 것)
 */
export function chooseGroupIntro(group, stored) {
  const lead = group?.lead?.extracted ?? {};
  const leadText = text(lead.features);
  const leadPosts = group?.lead?.post_url ? [group.lead.post_url] : [];
  const base = { conflict: null, dropped: [], droppedText: null, synth: null, synthReasons: [], materials: [] };
  if (!isIntroGroup(group)) return { ...base, text: leadText, source: 'lead', sentences: leadText ? [{ text: leadText, posts: leadPosts }] : [] };

  const materials = synthesisMaterials(groupIntroInput(group).posts);
  let synth = null;
  let synthReasons = [];
  if (materials.length >= 2) {
    const fresh = Boolean(stored) && stored.fingerprint === materialsFingerprint(materials);
    synth = fresh ? 'fresh' : 'waiting';
    if (fresh && stored.conflict) return { ...base, text: null, source: 'conflict', sentences: [], conflict: stored.conflict, synth, materials };
    const intro = fresh ? text(stored.intro) : null;
    if (intro) return { ...base, text: intro, source: 'synth', sentences: stored.sentences ?? [], synth, materials };
    if (fresh) {
      synth = 'rejected';
      synthReasons = stored.reasons ?? [];
    }
  }
  const useSummary = materials.length === 1 || (materials.length > 1 && lead.visited === false);
  const pick = useSummary ? { text: materials[0].text, source: 'summary', posts: materials[0].posts } : { text: leadText, source: 'lead', posts: leadPosts };
  const out = { ...base, source: pick.source, synth, synthReasons, materials };
  if (!pick.text) return { ...out, text: null, sentences: [] };
  const dropped = introTextReasons(pick.text);
  if (dropped.length) return { ...out, text: null, sentences: [], dropped, droppedText: pick.text };
  return { ...out, text: pick.text, sentences: [{ text: pick.text, posts: pick.posts }] };
}
