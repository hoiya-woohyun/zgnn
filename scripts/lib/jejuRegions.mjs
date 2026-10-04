// 제주 지역 정본 표 — 읍·면·시 → 방향, 리·동 지명 → 읍·면(시). 순수 모듈(브라우저도 import 한다 — `src/lib/adminCandidates.ts`).
//
// 왜 있나(2026-10-04) — 지역의 정본이 코드에 없었다. 방향은 기존 86곳의 `region` 다수결(`naverLocal.inferRegionRaw`)로 정했고,
// 지명이 어느 읍·면인지는 `matchPlace.mjs` 의 평평한 Set 에 **주석으로만** 갈려 있었다. 그래서 두 가지가 샜다:
//  - '지역 고르기' 선택지에 `서쪽 (안덕면)`/`남쪽 (안덕면)`, `남쪽 (서귀포)`/`남쪽 (서귀포시)` 가 같이 섰다 — 시드에 비정규 표기가 하나씩 있어서다.
//  - 주소 없는 "이춘옥고등어쌈밥 월정리점" 이 '지역 없음' 이 됐다 — 이름의 '월정리' 가 구좌읍이라는 것을 코드가 몰랐다.
// 방향은 추출 프롬프트(`scripts/analyze/extractPlaces.mjs` 의 regionRaw 기준)와 같다 — 안덕면은 **남쪽**이다.
// 그 프롬프트를 바꾸면 이 표도 같이 바꾼다(둘이 갈리면 AI 가 준 방향과 화면의 선택지가 어긋난다).

/** 읍·면·시 → 방향. 추출 프롬프트의 표 그대로. 추자면은 그 표에 없다 — 행정상 제주시라 북쪽. */
export const TOWN_DIRECTION = {
  구좌읍: 'east',
  성산읍: 'east',
  조천읍: 'east',
  애월읍: 'west',
  한림읍: 'west',
  한경면: 'west',
  대정읍: 'west',
  서귀포시: 'south',
  남원읍: 'south',
  표선면: 'south',
  안덕면: 'south',
  제주시: 'north',
  추자면: 'north',
  우도면: 'udo',
};

/**
 * 읍·면(시) → 그 안의 리·동 지명(접미 '리·동·읍·면' 을 뗀 꼴). **순서를 바꾸지 않는다** — `matchPlace.mjs` 의 `JEJU_TOPONYMS` 가 이 순서
 * 그대로 파생되고, `branchStem` 이 그 순서로 돌며 처음 맞는 꼬리를 뗀다. 순서가 바뀌면 같은 이름이 다른 몸통 키가 될 수 있다.
 * 같은 이름의 리가 두 읍·면에 있는 곳(신흥리: 조천읍·남원읍)은 한 곳에만 둔다 — 지금 목록이 그랬다. 이름 속 지명으로 지역을 정하는 길
 * (`regionFromName`)은 그래서 **지점 꼬리**에만 쓴다.
 */
const TOWN_TOPONYMS = [
  ['구좌읍', ['구좌', '동복', '김녕', '월정', '행원', '한동', '평대', '세화', '상도', '하도', '종달', '송당', '덕천']],
  ['성산읍', ['성산', '시흥', '오조', '고성', '수산', '온평', '난산', '신산', '삼달', '신풍', '신천']],
  ['조천읍', ['조천', '신촌', '신흥', '함덕', '북촌', '선흘', '와산', '대흘', '와흘', '교래']],
  ['애월읍', ['애월', '곽지', '금성', '봉성', '어음', '납읍', '상가', '하가', '용흥', '신엄', '중엄', '구엄', '고내', '하귀', '상귀', '장전', '소길', '유수암', '광령']],
  ['한림읍', ['한림', '귀덕', '수원', '대림', '한수', '상대', '동명', '명월', '금악', '상명', '월림', '협재', '옹포', '금능', '월령', '비양']],
  ['한경면', ['한경', '판포', '금등', '한원', '두모', '신창', '용당', '용수', '고산', '조수', '낙천', '청수', '산양', '저지']],
  ['대정읍', ['대정', '상모', '하모', '모슬포', '동일', '일과', '인성', '안성', '보성', '신평', '구억', '가파', '마라', '영락', '무릉', '신도']],
  ['남원읍', ['남원', '태흥', '위미', '하례', '신례', '한남', '수망', '의귀']],
  ['표선면', ['표선', '하천', '성읍', '가시', '토산']],
  ['안덕면', ['안덕', '화순', '사계', '덕수', '서광', '동광', '광평', '상천', '상창', '창천', '감산', '대평']],
  ['우도면', ['우도']],
  ['추자면', ['추자']],
  ['제주시', ['제주시', '일도', '이도', '삼도', '용담', '건입', '화북', '삼양', '봉개', '아라', '오라', '연동', '노형', '외도', '이호', '도두', '도련', '영평', '오등', '해안', '도평', '내도', '회천', '용강', '도남']],
  ['서귀포시', ['서귀포', '서귀포시', '서귀', '법환', '서호', '호근', '동홍', '서홍', '상효', '하효', '신효', '보목', '토평', '중문', '회수', '대포', '월평', '강정', '도순', '하원', '색달', '상예', '하예', '영남', '대천']],
];

/** 리·동 지명 → 읍·면(시). 삽입 순서가 곧 `TOWN_TOPONYMS` 의 순서다. */
export const TOPONYM_TOWN = new Map(TOWN_TOPONYMS.flatMap(([town, names]) => names.map((name) => [name, town])));

/** 시를 읍·면 자리에 쓴 비정규 표기 — 시드에 `서귀포`·`서귀포시` 가 섞여 있다(`regionCheck.mjs` 의 `CITY_ALIASES` 와 같은 값). */
const TOWN_ALIASES = { 서귀포: '서귀포시', 제주: '제주시' };

/** 읍·면 표기를 정본으로(`서귀포` → `서귀포시`). 모르면 그대로. */
export const canonicalTown = (town) => TOWN_ALIASES[town] ?? town ?? null;

const DIRECTION_KR = { east: '동쪽', west: '서쪽', south: '남쪽', north: '북쪽' };

/**
 * 읍·면(시) → 정본 regionRaw(`동쪽 (구좌읍)` · `남쪽 (서귀포시)` · 우도는 `우도면`). 표에 없으면 null.
 * `parseRegion`(placeFields.mjs)과 왕복이 맞는다.
 */
export function canonicalRegionRaw(town) {
  const name = canonicalTown(town);
  const direction = TOWN_DIRECTION[name];
  if (!direction) return null;
  if (direction === 'udo') return name;
  return `${DIRECTION_KR[direction]} (${name})`;
}

const squash = (text) => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** 지명 뒤에 붙는 행정 접미 — `월정리` · `노형동` · `한림읍`. */
const ADMIN_SUFFIX = /[리동읍면]$/;
/** 지명 하나로 읽기엔 너무 넓은 꼬리 — '제주점' 은 제주 어디든이다. */
const TOO_WIDE = new Set(['제주', '제주시']);

const townOfToponym = (word) => {
  if (!word || TOO_WIDE.has(word)) return null;
  if (TOPONYM_TOWN.has(word)) return TOPONYM_TOWN.get(word);
  return ADMIN_SUFFIX.test(word) && TOPONYM_TOWN.has(word.slice(0, -1)) ? TOPONYM_TOWN.get(word.slice(0, -1)) : null;
};

/** 긴 지명부터 — '서귀포' 가 '서귀' 보다 먼저 맞아야 한다. */
const TOPONYMS_LONG_FIRST = [...TOPONYM_TOWN.keys()].sort((a, b) => b.length - a.length);

/**
 * 가게 이름의 **지점 꼬리**에 든 지명 → 읍·면(시). 없으면 null. 순수.
 * "이춘옥고등어쌈밥 월정리점" → 월정 → 구좌읍. "○○ 제주성산점" → 성산 → 성산읍. "○○애월본점" → 애월읍.
 *
 * 꼬리만 보는 이유: 이름 **앞**의 지명은 본점 위치이거나 상호의 일부다("함덕해물라면" 이 서귀포에 지점을 낼 수 있고, "제주하도" 는 펜션 이름이다).
 * '…점' 은 그 가게가 **어디 있는 지점인지**를 말하는 자리라 그 말만 믿는다. '제주점'·'공항점' 처럼 지명이 아니거나 넓은 꼬리는 null.
 */
export function townFromBranchName(name) {
  const base = String(name ?? '').replace(/\([^)]*\)/g, '').trim();
  const tokens = base.split(/\s+/).filter(Boolean);
  // 띄어 쓴 꼬리("… 월정리점") — 그 토큰만 본다.
  if (tokens.length >= 2 && tokens.at(-1).endsWith('점')) {
    const tail = squash(tokens.at(-1)).replace(/본?점$/, '').replace(/^제주(?=.)/, '');
    return townOfToponym(tail);
  }
  // 붙여 쓴 꼬리("…월정리점") — 끝이 `지명(리·동·읍·면)?(본)?점` 이고 앞에 몸통이 남는 것만.
  const key = squash(base);
  if (!key.endsWith('점')) return null;
  const body = key.replace(/본?점$/, '');
  for (const toponym of TOPONYMS_LONG_FIRST) {
    if (TOO_WIDE.has(toponym)) continue;
    for (const tail of [toponym, ...['리', '동', '읍', '면'].map((suffix) => `${toponym}${suffix}`)]) {
      if (body.length > tail.length && body.endsWith(tail)) return TOPONYM_TOWN.get(toponym);
    }
  }
  return null;
}

/** 지점 꼬리의 지명 → 정본 regionRaw. 못 정하면 null. */
export const regionFromBranchName = (name) => canonicalRegionRaw(townFromBranchName(name));
