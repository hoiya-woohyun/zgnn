/**
 * 두 주소가 **같은 곳을 가리키는가** — 표기 차이를 걷어 내고 비교한다.
 *
 * 왜 있나 — 후보에는 주소가 둘 실린다. 네이버가 준 것(`extracted.address`)과 AI 가 본문에서 읽은 것
 * (`extracted.addressAi`). 검수 화면은 이 둘이 **문자열로** 다르면 "원글에는 다른 주소가 적혀 있어요" 를
 * 띄웠는데, 실측(2026-09-30, pending 후보의 불일치 43쌍) 결과 그중 40쌍이 표기 차이뿐이었다:
 *   `제주특별자치도` ↔ `제주` 39쌍 · 뒤에 붙은 층·호(`1층`, `1층 105호`) · 상호(`... 179 본카페`) ·
 *   괄호 행정동(`(노형동)`) · `제주` 접두어 누락(`제주시 한경면 …`).
 * 경보가 40번 울리면 남은 3번을 아무도 안 본다. 그리고 그 3번이 값어치의 전부다 —
 * `제주시 애월읍 신엄안3길 95` ↔ `서귀포시 대포로 93` 은 **`naverLocal` 이 동명의 다른 가게를 집었다**는 뜻이고,
 * 그대로 승인하면 엉뚱한 좌표·카테고리가 `places` 에 들어간다.
 *
 * **AI 에게 묻지 않는다.** 남은 갈래가 지번↔도로명(`조천읍 함덕리 272-4` ↔ `조천읍 함덕27길 18-2`)인데,
 * 그 둘이 같은 건물인지는 **조회**해야 아는 것이라 모델은 그럴듯하게 지어낸다. 지어낸 '같다' 는 위 3번을
 * 덮어 버려서, 하나 있는 진짜 신호를 잃는다. 그래서 종류가 갈리면 판단하지 않고 `'unknown'` 을 돌려주고,
 * 화면은 그것을 경보가 아니라 참고로 적는다(누가 맞는지는 사람이 링크를 열어 본다).
 *
 * 앱 런타임(`src/lib/`)에 두는 이유: 분석 때 계산해 저장하면 **이미 쌓인 후보 218건은 영원히 옛 경보**를 쓴다.
 * 화면이 그때그때 계산하면 다음 분석을 기다리지 않는다.
 */

/** 시·도 접두어. 제주만 다룬다 — 제주 밖 후보는 `isJeju` 에서 이미 걸러진다. */
const PROVINCE_RE = /^(제주특별자치도|제주자치도|제주도|제주)\s+/;

/** 행정구역 토큰(시·군·구·읍·면). 비교의 앞자리 — 여기가 갈리면 표기 문제가 아니다. */
const DISTRICT_RE = /(시|군|구|읍|면)$/;

/** 도로명 토큰. `1100로` · `칠십리로214번길` · `태위로723번길` 처럼 숫자가 박힌 것이 제주에 흔하다. */
const ROAD_RE = /(로|길)$/;

/** 지번 토큰(리·동·가). 도로명이 아닌 옛 표기이고, 도로명과 **직접 비교할 수 없다**. */
const LOT_RE = /(리|동|가)$/;

/** 건물번호·지번. `179` · `48-39` · `3198-20`. */
const NUMBER_RE = /^\d+(-\d+)?$/;

export type TAddressMatch = 'same' | 'different' | 'unknown';

/** 주소 한 줄을 비교용 조각으로. 못 읽으면 null — 그때 판정은 `'unknown'` 이다. */
export type TAddressKey = {
  /** 행정구역 사슬(제주시 · 애월읍). 시·도 접두어는 이미 떼어 냈다. */
  districts: string[];
  /** 도로명 또는 지번 이름. */
  base: string;
  /** 그 뒤의 번호. */
  number: string;
  /** 도로명주소인가 지번주소인가 — 종류가 갈리면 비교하지 않는다. */
  kind: 'road' | 'lot';
};

/**
 * 비교에 **쓰지 않는 꼬리**를 떼고 토큰으로 나눈다.
 *  - 괄호는 통째로 버린다(`(노형동)` 은 행정동 병기, `1층(빨간머리앤)` 은 상호).
 *  - 쉼표도 공백으로 본다 — `관덕로 8, 2층` 처럼 본문 주소의 표준 표기다.
 * 번호 뒤의 층·호·상호는 토큰을 고르는 쪽(`addressKey`)이 자연히 버린다.
 */
function tokenize(address: string): string[] {
  return address
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function addressKey(address: string | null | undefined): TAddressKey | null {
  const raw = (address ?? '').trim();
  if (!raw) return null;
  const tokens = tokenize(raw.replace(PROVINCE_RE, ''));

  /*
   * **번호가 따라오는 첫 이름 토큰**이 축이다. "이름처럼 생긴 토큰" 만 찾으면 번호 뒤의 `1~2동`·상호가 걸리고,
   * 번호만 찾으면 `1100로` 의 숫자가 걸린다. 둘을 짝으로 봐야 한 번에 가려진다.
   */
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (!NUMBER_RE.test(tokens[i + 1])) continue;
    const kind = ROAD_RE.test(token) ? 'road' : LOT_RE.test(token) ? 'lot' : null;
    if (!kind) continue;
    return {
      districts: tokens.slice(0, i).filter((t) => DISTRICT_RE.test(t)),
      base: token,
      number: tokens[i + 1],
      kind,
    };
  }
  return null;
}

/**
 * 두 주소의 관계.
 *  `'same'`      행정구역·이름·번호가 모두 같다(표기만 달랐다).
 *  `'different'` 행정구역이 갈렸거나, 같은 종류인데 이름·번호가 다르다 — 다른 가게일 수 있다.
 *  `'unknown'`   한쪽을 못 읽었거나, 지번↔도로명이라 **비교 자체가 불가능**하다.
 *
 * 행정구역을 먼저 보는 이유: 종류가 갈려도 `제주시` ↔ `서귀포시` 는 표기 문제가 아니다.
 * 한쪽 사슬이 다른 쪽의 접두어면(`[제주시]` vs `[제주시, 애월읍]`) 생략으로 보고 갈렸다고 하지 않는다 —
 * 실측에 `제주시 신설로2길 18-1` 처럼 읍·면이 빠진 본문 주소가 있다.
 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): TAddressMatch {
  const ka = addressKey(a);
  const kb = addressKey(b);
  if (!ka || !kb) return 'unknown';

  const shared = Math.min(ka.districts.length, kb.districts.length);
  for (let i = 0; i < shared; i += 1) {
    if (ka.districts[i] !== kb.districts[i]) return 'different';
  }

  if (ka.kind !== kb.kind) return 'unknown';
  return ka.base === kb.base && ka.number === kb.number ? 'same' : 'different';
}
