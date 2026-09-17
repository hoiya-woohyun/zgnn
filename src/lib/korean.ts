/**
 * 한국어 이름에 붙는 조사·애칭.
 *
 * 화면 곳곳이 강아지 이름을 문장 안에 넣는다("두부는 갈 수 있어요", "우현이랑 제주 어디 갈까요?").
 * 조사는 앞 글자의 받침으로 갈리고, 보호자는 받침 있는 이름을 부를 때 '이' 를 붙여 부른다
 * (우현 → 우현이). 이 둘을 자리마다 따로 구현하면 한 곳만 고쳐져 어긋나므로 여기 모은다.
 *
 * 한글 완성형(U+AC00–D7A3)만 받침을 판별한다. 영문·숫자 이름은 받침 없음으로 보고 뒤 조사를
 * 쓴다("Coco는") — 발음을 추측해 맞추려 들지 않는다.
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 마지막 글자가 한글 완성형이고 받침이 있으면 true. 한글이 아니거나 빈 문자열이면 false. */
export const hasBatchim = (text: string): boolean => {
  const last = text.at(-1);
  if (!last) return false;
  const code = last.codePointAt(0);
  if (code === undefined || code < HANGUL_START || code > HANGUL_END) return false;
  return (code - HANGUL_START) % 28 !== 0;
};

export type TJosaPair = '은/는' | '이/가' | '을/를' | '과/와' | '이랑/랑' | '아/야';

/** `word` 의 마지막 글자 받침 기준으로 조사만 고른다(받침 있으면 앞, 없으면 뒤). */
export const josa = (word: string, pair: TJosaPair): string => {
  const [withBatchim, withoutBatchim] = pair.split('/');
  return hasBatchim(word) ? withBatchim : withoutBatchim;
};

/** `word` 에 알맞은 조사를 붙인 문자열. */
export const withJosa = (word: string, pair: TJosaPair): string => `${word}${josa(word, pair)}`;

/**
 * 보호자가 부르는 이름. 받침으로 끝나면 '이' 를 붙인다(우현 → 우현이, 악동 → 악동이).
 * 받침이 없으면 그대로다 — 이미 '악동이' 로 등록한 이름에 '이' 가 겹치지 않는 이유가 이것이다.
 */
export const dogCallName = (name: string): string => {
  const trimmed = name.trim();
  return hasBatchim(trimmed) ? `${trimmed}이` : trimmed;
};

/**
 * 여러 마리를 한 덩어리로 부른다: "악동이" / "악동이와 두부" / "악동이, 두부, 콩이".
 * 조사는 붙이지 않는다 — 호출부가 문맥에 맞는 조사(`은/는`, `이랑/랑`)를 `withJosa` 로 붙인다.
 */
export const dogCallNames = (names: string[]): string => {
  const called = names.map(dogCallName);
  if (called.length <= 1) return called[0] ?? '';
  if (called.length === 2) return `${withJosa(called[0], '과/와')} ${called[1]}`;
  return called.join(', ');
};
