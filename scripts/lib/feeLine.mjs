// 반려견 요금 줄을 **한 가지 모양**으로 맞춘다 — 분석 시점(extractPlaces.normalizePetPolicy)이 저장 전에 한 번,
// 앱(src/lib/petPolicy.ts 의 toPetBadges)이 배지 라벨을 만들 때 한 번 더 부른다. 앱에서도 부르는 이유: 시드 86곳은 AI 를
// 거치지 않고(정규식 경로), 이 함수가 생기기 전에 분석된 후보가 DB 에 그대로 있다. 두 번 불러도 결과가 같다(멱등).
//
// 모양은 앱이 이미 읽는 것에 맞춘다 — `1마리당 N만원`·`A~Bkg N만원`(dogFee.ts 의 곱셈), `Nkg 이상`(eligibility.ts).
// 원문에서 흔한 군말(`추가`·`숙박일 관계없이`·괄호)만 걷고, **원문에 없는 기준은 붙이지 않는다**: `(2만원 추가)` 는
// 마리당인지 박당인지 원문이 말하지 않으므로 `1마리당 2만원` 이 아니라 `추가 2만원` 이다.
//
// 금액 단위 변환(`20,000원` → `2만원`)을 AI 가 아니라 여기서 하는 이유: 모델이 바꾸면 원문 대조(petPolicyFacts 의
// feeTextGrounded)가 그 줄을 지어낸 것으로 보고 뺀다. 규칙이 바꾸면 틀릴 수가 없고, 대조는 `amountsInWon` 으로 숫자끼리 본다.
//
// 순수 모듈이다: 브라우저도 import 한다 — node 모듈을 넣지 말 것.

const KOREAN_COUNT = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5 };

/**
 * 금액 토큰 — `2만원`·`1.5 만원`·`20,000원`·`5천원`. 앞에 숫자·소수점이 붙은 자리(15만원의 5만원)는 잡지 않는다.
 * lookbehind(`(?<!…)`) 대신 앞 글자를 캡처한다 — 이 모듈은 브라우저 번들에 들어가고, iOS 16.4 전 Safari 는 lookbehind
 * 정규식 리터럴에서 청크 전체가 파싱 에러로 죽는다(petPolicyFacts.mjs 의 `mentionsKg` 와 같은 어법).
 */
const AMOUNT_RE = /(^|[^\d.,])(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|천\s*원|원)/g;

const toWon = (num, unit) => {
  const n = Number(num.replace(/,/g, ''));
  if (unit.startsWith('만')) return Math.round(n * 10000);
  if (unit.startsWith('천')) return Math.round(n * 1000);
  return n;
};

/** 문장 안 금액들을 원 단위 숫자로. `1-2만원` 의 앞 숫자는 단위가 없어 잡히지 않는다 — 뒤 금액 하나로 대조된다. */
export function amountsInWon(text) {
  return [...String(text ?? '').matchAll(AMOUNT_RE)].map((m) => toWon(m[2], m[3]));
}

/** 20000 → "2만원", 15000 → "1.5만원", 5000 → "5,000원". 천 원 아래가 남으면 만원으로 못 쓰니 원 그대로. */
const formatWon = (won) => (won >= 10000 && won % 1000 === 0 ? `${won / 10000}만원` : `${won.toLocaleString('ko-KR')}원`);

/**
 * **기본 마릿수를 넘는 마리**의 요금 — `추가 1마리 3만원`·`한 마리를 추가하면 3만원`·`추가 반려견 1마리는 5만원`.
 * 요금이 붙는 쪽이 첫 마리가 아니라 둘째(기본이 1마리일 때)라는 말이라, 군말 `추가`(= 요금이 붙는다)와 다르다 —
 * 걷어 내면 `1마리 3만원` 이 남아 한 마리만 데려가도 3만원으로 읽힌다(휘닉스 아일랜드·소노벨, docs/todo/13 §5.1).
 * `1마리당 2만원 추가` 는 여기 걸리지 않는다(`마리당` 뒤의 `추가` 는 요금이 붙는다는 군말이다). `추가 1마리당` 은 걸린다.
 * petPolicyFacts.mjs 의 `shapeMatchesLabel` 이 같은 식으로 label 이 `fromDog` 를 말하는지 본다.
 */
export const EXTRA_DOG_RE =
  /추가\s*(?:(?:반려견|반려동물|강아지|애견)\s*(?:은|는|이|가|을|를)?\s*)?(\d+|한|두|세)\s*마리(\s*당)?(?!\s*까지)|(\d+|한|두|세)\s*마리\s*(?:를|을)?\s*추가(?!\s*(?:요금|금|비용|비))/;

/** 원문 군말 — 걷어도 기준이 안 바뀌는 말만. `추가` 는 요금 줄에서 늘 참이라 정보가 없다 — `추가 N마리`(EXTRA_DOG_RE)만 빼고. */
const FILLER = [
  /숙박\s*(일수|일)?\s*(에\s*)?(관계\s*없이|상관\s*없이|무관)/g,
  /(반려견|반려동물|강아지|애견)\s*/g,
  /의?\s*추가(?!\s*\d+마리)\s*(요금|금|비용|비)?(이|은|을)?/g,
  /요금(은|이)?/g,
  /(이|가)?\s*(발생|부과)(해요|합니다|됩니다|돼요)?/g,
  /\s*(입니다|이에요|예요|있어요|받아요|받습니다)$/g,
];

/** 한 기준(= 한 줄)을 정해진 모양으로. */
function canonical(segment) {
  let s = segment
    .replace(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*만\s*원/g, '$1~$2만원')
    .replace(AMOUNT_RE, (_, head, num, unit) => `${head}${formatWon(toWon(num, unit))}`)
    .replace(/(한|두|세|네|다섯)\s*마리/g, (_, w) => `${KOREAN_COUNT[w]}마리`)
    .replace(/마리\s*당/g, '마리당')
    .replace(/(^|[^\d])마리당/g, (_, head) => `${head}1마리당`);
  // `한 마리를 추가하면` · `추가 반려견 1마리는` → `추가 1마리` — 군말을 걷기 전에 한 모양으로 묶어 둔다(FILLER 가 이 모양만 남긴다).
  // 한글 수는 위에서 이미 숫자가 됐다.
  s = s.replace(new RegExp(`(?:${EXTRA_DOG_RE.source})\\s*(?:하면|시|할\\s*때|마다|는|은)?`), (_, a, dang, b) => ` 추가 ${a ?? b}마리${dang ? '당' : ''} `);
  for (const re of FILLER) s = s.replace(re, ' ');
  s = s.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\((.*)\)$/, '$1').replace(/[.,!~]+$/, '').trim();

  const amounts = s.match(/\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?만원|\d[\d,]*원/g) ?? [];
  if (amounts.length === 1) {
    const amount = amounts[0];
    const rest = s.replace(amount, '').trim();
    // 금액만 남았다 — 기준을 원문이 말하지 않는다.
    if (rest === '') return `추가 ${amount}`;
    if (/청소/.test(rest) && !/kg|마리/.test(rest)) return `청소비 ${amount}`;
    // "1마리 이상 … (1마리당)" 처럼 마리당 말고 다른 조건이 없으면 마리당 한 줄.
    if (/1마리당/.test(rest) && rest.replace(/\(?1마리(당|\s*이상)\)?/g, '').trim() === '') return `1마리당 ${amount}`;
  }
  return s;
}

/**
 * 기준 경계 — 쉼표·마침표 뒤 공백, **공백으로 둘러싸인** `/`·`·`. 붙어 있는 `·`·`/` 는 한 기준 안의 말이다
 * (`중·대형견`, `2만원/박`) — 거기서 자르면 `중` 이 떨어져 나가 중형견 요금이 사라진다.
 */
const CRITERION_BOUNDARY = /\s+[/·]\s+|\s*;\s*|,\s+|\.\s+/;

/**
 * 한 줄을 기준마다 나눈다. 금액 없는 조각이 무게·마릿수 조건(`10kg 이상`)이면 **버리지 않고 다음 조각 앞에 붙인다** —
 * 그 조각을 판정 C5(`FEE_MIN_KG_RE`)가 읽는다(dogFee.ts 의 `hasUnusedCondition` 이 `/마리|kg/` 를 조건으로 보는 것과 같은 기준).
 * 조건 없는 설명문(`몸무게에 따라 달라져요`)만 버린다.
 */
function splitCriteria(text) {
  if (amountsInWon(text).length < 2) return [text];
  const out = [];
  let carry = '';
  for (const part of text.split(CRITERION_BOUNDARY)) {
    if (amountsInWon(part).length > 0) {
      out.push(carry ? `${carry} ${part}` : part);
      carry = '';
    } else if (/kg|㎏|마리/i.test(part)) {
      carry = carry ? `${carry} ${part}` : part;
    }
  }
  // 조건이 맨 끝에 남았으면 앞 조각에 되돌려 붙인다 — 어디에도 안 붙으면 그 조건이 사라진다.
  if (carry && out.length) out[out.length - 1] = `${out[out.length - 1]} ${carry}`;
  return out.length ? out : [text];
}

/**
 * 요금 줄 목록을 정규화한다. 한 줄에 금액이 둘 이상이면 기준마다 나누고(`splitCriteria`), 결과는 중복 없이 원문 순서.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
export function normalizeFeeLines(lines) {
  const out = [];
  for (const line of lines ?? []) {
    const text = String(line ?? '').trim();
    if (!text) continue;
    for (const segment of splitCriteria(text)) {
      const label = canonical(segment);
      if (label && !out.includes(label)) out.push(label);
    }
  }
  return out;
}
