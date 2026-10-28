// 전화번호 정규화 — 순수 모듈. `/admin` 의 번호 칸(저장 때 한 번)과 `placeFields.mjs`(JSON 으로 옮길 때)가 같은 함수를 쓴다.
// 브라우저도 import 한다 — node 모듈을 넣지 말 것(placeFields.mjs 머리 주석과 같다).
//
// 저장 꼴은 하이픈 있는 국내 표기 한 가지다: `064-123-4567` · `010-1234-5678` · `0507-1234-5678`(안심번호) · `1588-1234`.
// 하이픈 위치는 지역번호/식별번호가 정한다 — 사람이 적은 띄어쓰기·점·괄호·`+82` 는 여기서 걷는다.
//
// **지역번호 없는 번호(`723-1234`)는 받지 않는다.** 제주 가게라고 064 를 짐작해 붙이면 틀린 번호가 맞는 번호처럼 사이트에 선다 — 운영자가 적게 한다.
// 내선·메모("064-123-4567 (내선 2)")도 받지 않는다: `tel:` 은 숫자만 건다.

/** 식별번호(앞자리) → 총 자릿수 허용 집합. 0507 류 안심번호는 따로. */
const MOBILE = ['010', '011', '016', '017', '018', '019'];
const AREA = ['031', '032', '033', '041', '042', '043', '044', '051', '052', '053', '054', '055', '061', '062', '063', '064'];
const SPECIAL = ['070', '080'];
const SAFE_NUMBER = /^050[2-8]/;

const PROBLEM = '전화번호 형식이 아니에요 — 지역번호부터 숫자로 적어 주세요 (예: 064-123-4567).';

/** 하이픈을 넣는다. 앞자리 길이 `head` 뒤 나머지는 3-4 또는 4-4(7·8자리)로 가른다. */
function hyphenate(head, rest) {
  if (rest.length === 7) return `${head}-${rest.slice(0, 3)}-${rest.slice(3)}`;
  return `${head}-${rest.slice(0, 4)}-${rest.slice(4)}`;
}

/**
 * 손으로 적은 번호 → 정규 표기. 순수.
 * - 빈 값(공백뿐)은 `{ phone: null }` — 번호를 지우는 것이다.
 * - 읽을 수 없으면 `{ error }`.
 * @param {string | null | undefined} raw
 * @returns {{ phone: string | null } | { error: string }}
 */
export function normalizePhone(raw) {
  const text = (raw ?? '').trim();
  if (!text) return { phone: null };

  // `+82-64-…` · `+82 (0)64-…` → 국내 표기. 국가번호 뒤의 0 은 있어도 없어도 같다.
  let s = text.replace(/^\+\s*82[\s-]*(?:\(0\)|0)?/, '0');
  if (/[^\d\s\-.()]/.test(s)) return { error: PROBLEM };
  s = s.replace(/[\s\-.()]/g, '');
  if (!/^\d+$/.test(s)) return { error: PROBLEM };

  // 대표번호 1588-1234 류(8자리, 15·16·18 로 시작)
  if (/^1[568]\d{6}$/.test(s)) return { phone: `${s.slice(0, 4)}-${s.slice(4)}` };

  if (!s.startsWith('0')) return { error: PROBLEM };

  if (SAFE_NUMBER.test(s)) {
    // 안심번호 0507-1234-5678(12자리) · 0507-123-4567(11자리)
    if (s.length === 11 || s.length === 12) return { phone: hyphenate(s.slice(0, 4), s.slice(4)) };
    return { error: PROBLEM };
  }

  if (s.startsWith('02')) {
    if (s.length === 9 || s.length === 10) return { phone: hyphenate('02', s.slice(2)) };
    return { error: PROBLEM };
  }

  const head = s.slice(0, 3);
  if (head === '010') return s.length === 11 ? { phone: hyphenate(head, s.slice(3)) } : { error: PROBLEM };
  if (MOBILE.includes(head) || AREA.includes(head) || SPECIAL.includes(head)) {
    if (s.length === 10 || s.length === 11) return { phone: hyphenate(head, s.slice(3)) };
  }
  return { error: PROBLEM };
}

/** 정규 표기 → `tel:` 주소. 숫자만 건다(하이픈은 일부 기기에서 걸림 앞에 읽히지 않는다). 번호가 없으면 undefined. */
export function phoneTelHref(phone) {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits ? `tel:${digits}` : undefined;
}
