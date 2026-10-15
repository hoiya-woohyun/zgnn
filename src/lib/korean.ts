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

export type TJosaPair = '은/는' | '이/가' | '을/를' | '과/와' | '이랑/랑' | '아/야' | '이라고/라고' | '으로/로';

/** 받침 ㄹ(종성 번호 8) — '으로/로' 만 ㄹ 받침 뒤에서 '로' 다(서울로·물로). */
const endsWithRieul = (text: string): boolean => {
  const code = text.at(-1)?.codePointAt(0);
  return code !== undefined && code >= HANGUL_START && code <= HANGUL_END && (code - HANGUL_START) % 28 === 8;
};

/** `word` 의 마지막 글자 받침 기준으로 조사만 고른다(받침 있으면 앞, 없으면 뒤). */
export const josa = (word: string, pair: TJosaPair): string => {
  const [withBatchim, withoutBatchim] = pair.split('/');
  if (pair === '으로/로' && endsWithRieul(word)) return withoutBatchim;
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

/** 이름 여럿을 한 덩어리로 — 둘은 앞 이름에 '과/와', 셋부터 쉼표. 부르는 이름·적은 이름이 같은 꼴을 쓴다. */
const joinNames = (names: string[]): string => {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${withJosa(names[0], '과/와')} ${names[1]}`;
  return names.join(', ');
};

/**
 * 여러 마리를 한 덩어리로 부른다: "악동이" / "악동이와 두부" / "악동이, 두부, 콩이".
 * 조사는 붙이지 않는다 — 호출부가 문맥에 맞는 조사(`은/는`, `이랑/랑`)를 `withJosa` 로 붙인다.
 *
 * **문장 안에서 강아지를 부르는 자리에만 쓴다**("단풍이랑 제주 어디 갈까요?" · "단풍이는 갈 수 있어요" · "단풍이에게 어려워요").
 * 이름만 서는 자리(카드 제목·목록)와 방금 적은 이름을 되비추는 자리(`/dog` 폼의 알림)는 `dogNamesAsWritten` 이다 —
 * 거기서 '단풍' 이 '단풍이' 로 보이면 적은 이름이 바뀐 것으로 읽힌다(14 W261010.33h, tremor-05c).
 */
export const dogCallNames = (names: string[]): string => joinNames(names.map(dogCallName));

/**
 * 보호자가 적은 이름 그대로 묶는다: "단풍" / "단풍과 깜지" / "보리, 단풍, 깜지". 묶는 꼴은 `dogCallNames` 와 같고 '이' 만 안 붙인다.
 * 이름이 가리키는 말로 서는 자리(설정 카드 제목 · 저장 알림 "○○ 기준으로 바꿨어요")에 쓴다 — 부르는 말 자리는 `dogCallNames`.
 */
export const dogNamesAsWritten = (names: string[]): string => joinNames(names.map((name) => name.trim()));
