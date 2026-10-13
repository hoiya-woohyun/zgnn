// 묶음 소개(docs/todo/13 §5.3)의 **재료와 지문** — 노드 모듈을 쓰지 않는다. 분석(`groupIntroPass.mjs`)이 이것으로 다시 만들 묶음을 고르고,
// /admin(A3)이 같은 함수로 저장된 소개가 지금 묶음의 것인지 가린다 — 두 쪽이 다른 식으로 재면 화면이 낡은 소개를 지금 것으로 보인다.
// 그래서 `synthesizeGroupIntro.mjs`(node:crypto · claude 실행기를 부른다)에서 떼어 냈고, 그 파일은 여기의 `synthesisMaterials` 를 다시 내보낸다.

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

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
