// 장소의 읍면·방향(`region`)이 주소와 어긋나는지 — 데이터 갱신(`pull`·`normalize`) 끝에 **경고만** 찍는다(docs/todo/12 U0.2).
//
// 왜 있나 — `region` 은 사람이 고른 값(시드의 「위치」 칸, /admin 의 지역 고르기)이고 주소·좌표는 네이버에서 온 값이라
// 둘은 따로 움직인다. 어긋나면 사용자가 '남원읍' 으로 고른 목록에 섬 반대편(구좌읍)에 핀이 찍힌 곳이 섞인다.
// 빌드·테스트는 그대로 통과한다 — 이 검사가 유일한 신호다. 2026-10-02 기준 3곳(위미애머물다락쿤 · 살롱드라방 · 제주포슬).
//
// 왜 빌드를 막지 않나 — 고치는 것은 사람 손(/admin 의 주소·지역 고치기)이고, 원본이 Supabase 라 여기서 고칠 수도 없다.
// 막으면 운영자가 다른 장소를 승인해도 사이트가 안 바뀐다. 이름을 알려 주는 것까지가 이 검사의 일이다.
//
// 어느 쪽이 맞는지는 판정하지 않는다 — 이름의 지명('위미' 는 남원)이 주소가 틀렸다는 단서일 때도 있다(검색이 동명의 다른 가게를 집은 것, ADR-019).

/** 시내(동 단위) 주소를 읍면 자리에 쓰는 표기 — 시드에 `서귀포`·`서귀포시` 가 섞여 있다. */
const CITY_ALIASES = { 서귀포: '서귀포시', 제주: '제주시' };

const canonicalTown = (town) => CITY_ALIASES[town] ?? town ?? null;

/**
 * 주소의 읍면. 읍·면이 없는 시내 주소는 시(`제주시`·`서귀포시`). 못 읽으면 null.
 * 토큰 단위로 보는 이유 — 한글엔 `\b` 가 없어 "중산간동로" 같은 도로명에 걸린다(`naverLocal.extractAddressUnits` 와 같은 어법).
 * 맨 앞의 `제주`(도 표기)는 시가 아니므로 `…시` 로 끝나는 토큰만 시로 본다.
 */
export function townOfAddress(address) {
  const tokens = (address ?? '').split(/\s+/);
  const town = tokens.find((token) => /^[가-힣]{1,4}[읍면]$/.test(token));
  if (town) return town;
  return tokens.find((token) => /^[가-힣]{1,4}시$/.test(token)) ?? null;
}

/**
 * 경고 줄들. 두 가지를 본다.
 *  1. 읍면 ↔ 주소: `region.town` 과 주소의 읍면(시)이 다르다. 주소가 없거나 못 읽으면 보지 않는다.
 *  2. 같은 읍면이 두 방향: 방향은 읍면에서 파생되는 값인데 같은 읍면이 서로 다른 방향을 가졌다(안덕면 south ↔ west).
 *     어느 쪽이 맞는지는 정하지 않는다 — 1:1 이면 다수결도 없다. 둘 다 이름을 댄다.
 * @param {Array<{ name: string, address?: string, region?: { town?: string, direction?: string } }>} places
 * @returns {string[]}
 */
export function regionWarnings(places) {
  const warnings = [];
  const directionsByTown = new Map();
  for (const place of places) {
    const town = canonicalTown(place.region?.town);
    const fromAddress = townOfAddress(place.address);
    if (town && fromAddress && town !== fromAddress) {
      warnings.push(`읍면이 주소와 다르다: ${place.name} — 읍면 ${place.region.town} · 주소 ${place.address}`);
    }
    const direction = place.region?.direction;
    if (!town || !direction || direction === 'unknown') continue;
    if (!directionsByTown.has(town)) directionsByTown.set(town, new Map());
    const byDirection = directionsByTown.get(town);
    if (!byDirection.has(direction)) byDirection.set(direction, []);
    byDirection.get(direction).push(place.name);
  }
  for (const [town, byDirection] of directionsByTown) {
    if (byDirection.size < 2) continue;
    const parts = [...byDirection].map(([direction, names]) => `${direction} ${names.join('·')}`);
    warnings.push(`같은 읍면이 두 방향이다: ${town} — ${parts.join(' ↔ ')}`);
  }
  return warnings;
}
