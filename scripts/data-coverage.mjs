// `pnpm data coverage` — 원형 셋 × 6권역 × 종류의 "갈 수 있는 곳/모은 곳" 표와 데이터 문턱(docs/todo/19 T2 · §4).
// 셈은 홈 카드와 같은 함수다(`countByArea` → `countByLevel`) — 입력도 화면과 같은 `PLACES`(src/data/places.json + 파싱)라, 이 표의 수가 곧 카드의 수다.
// 오프라인이 기본이다. 로그인 세션이 있으면(`pnpm data login`) 칸마다 검수 대기 신규 후보 수를 하나 더 찍는다 — 🧑 19 H.1 의 검수 순서표.
// 세션이 없어도 멈추지 않는다: 그 열만 빼고 한 줄 안내. 원격은 읽기만 한다(candidates select).
// 앱의 TS 를 부르므로 --experimental-strip-types(package.json 의 `data` 줄)와 확장자·JSON 훅(scripts/lib/tsExtResolve.mjs — scripts/data.mjs 가 건다)이 같이 필요하다.
import { AREAS, countByArea, TOWN_TO_AREA } from '../src/lib/areaGroups.ts';
import { COVERAGE_DOGS, COVERAGE_GOALS, coverageGates, reachOf } from '../src/lib/areaCoverage.ts';
import { PLACES } from '../src/lib/places.ts';
import { canonicalTown } from './lib/jejuRegions.mjs';
import { parseRegion } from './lib/placeFields.mjs';
import { townOfAddress } from './lib/regionCheck.mjs';
import { createSupabase, resolveSupabaseCredentials } from './lib/supabaseClient.mjs';
import { isDirectRun } from './lib/isDirectRun.mjs';

const TYPE_LABEL = { stay: '숙소', cafe: '카페', restaurant: '식당' };
/** 열 순서 — 카드가 말하는 순서(묵을 곳 → 카페), 식당은 맨 뒤. */
const PLACE_TYPES = Object.keys(TYPE_LABEL);
const NO_AREA = '지역 모름';

/** 권역 이름 + 읍면 — "서부(애월·한림·한경)". 읍면은 매핑에서 읽는다(손으로 적으면 매핑과 갈린다). */
const areaTitle = (id) => {
  const towns = Object.entries(TOWN_TO_AREA)
    .filter(([, area]) => area === id)
    .map(([town]) => town.replace(/(읍|면)$/, ''));
  return `${AREAS.find((area) => area.id === id).label}(${towns.join('·')})`;
};

/**
 * 승인되면 그 후보가 들어갈 권역. 새 장소의 `region_raw` 는 `extracted.regionRaw` 그대로라(`toNewPlaceRow` — CLI·/admin 두 길 모두) 그것을 먼저 보고
 * (카드가 그 값으로 센다), 그 읍면이 권역 매핑에 없으면 주소의 읍면. `parseRegion` 은 형식 밖 문자열('남쪽')도 통째로 town 에 담으므로
 * "읽혔다" 가 아니라 "매핑에 있다" 로 가른다. 둘 다 못 읽으면 null — '지역 모름' 줄에 센다(빼면 검수할 곳이 표에서 사라진다).
 */
export function candidateArea(extracted) {
  const fromRegion = extracted?.regionRaw ? TOWN_TO_AREA[parseRegion(extracted.regionRaw).town] : undefined;
  return fromRegion ?? TOWN_TO_AREA[canonicalTown(townOfAddress(extracted?.address))] ?? null;
}

/**
 * 검수 대기 신규 후보 → 권역 × 종류 수. 신규만(`match.tier` 가 없거나 'new' — 기존 장소에 붙는 후보는 곳을 늘리지 않는다, adminApply 와 같은 기본값).
 * 같은 가게를 쓴 글이 여럿이면 후보도 여럿이라 이름 키(`nameKey`, 없으면 이름)로 한 곳으로 접는다. 종류가 숙소·카페·식당이 아니면 뺀다.
 * @returns {Map<string, Record<string, number>>} 권역 id(또는 NO_AREA) → 종류 → 곳 수
 */
export function pendingByArea(rows) {
  const seen = new Set();
  const byArea = new Map();
  for (const { extracted } of rows) {
    if (!extracted || (extracted.match?.tier ?? 'new') !== 'new' || !Object.hasOwn(TYPE_LABEL, extracted.type)) continue;
    const area = candidateArea(extracted) ?? NO_AREA;
    const key = `${area}/${extracted.type}/${extracted.nameKey ?? extracted.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = byArea.get(area) ?? { stay: 0, cafe: 0, restaurant: 0 };
    row[extracted.type] += 1;
    byArea.set(area, row);
  }
  return byArea;
}

// 한글은 터미널에서 두 칸이다 — String.padEnd 로 맞추면 열이 어긋난다.
const width = (s) => [...s].reduce((w, ch) => w + (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(ch) ? 2 : 1), 0);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
const TITLE_W = Math.max(...AREAS.map(({ id }) => width(areaTitle(id)))) + 2;
const CELL_W = 9;
const header = (first) => pad(first, TITLE_W) + PLACE_TYPES.map((type) => pad(TYPE_LABEL[type], CELL_W)).join('');

async function fetchPendingRows() {
  try {
    resolveSupabaseCredentials();
  } catch (e) {
    return { skipped: e.loginNeeded ? '로그인 세션이 없다 — 사용자 터미널에서 `pnpm data login` 뒤 다시 보면 칸마다 검수 대기 수가 붙는다' : e.message };
  }
  const supabase = createSupabase();
  // 지금 대기는 100여 행(2026-10-08) — PostgREST 기본 상한(1000)을 넘으면 조용히 잘리므로 그때 range() 로 페이지를 넘긴다.
  const { data, error } = await supabase.from('candidates').select('extracted').eq('status', 'pending').limit(1000);
  if (error) return { skipped: `후보를 읽지 못했다(${error.code ?? ''} ${error.message})` };
  return { rows: data };
}

export async function main(argv = []) {
  if (argv.length > 0) {
    console.error('사용법: pnpm data coverage   (인자 없음 — 세션이 있으면 검수 대기 열이 붙는다)');
    return 2;
  }
  console.log(`6권역 커버리지 — 게시 ${PLACES.length}곳(src/data/places.json). 칸 = 갈 수 있는 곳(ok + 야외) / 모은 곳\n`);

  const byDog = {};
  for (const { id, label, dog } of COVERAGE_DOGS) {
    const counts = countByArea(PLACES, dog);
    byDog[id] = counts;
    console.log(`■ ${label}`);
    console.log(header('권역'));
    for (const { id: area } of AREAS) {
      const cells = PLACE_TYPES.map((type) => {
        const c = counts[area][type];
        return pad(`${reachOf(c)}/${Object.values(c).reduce((sum, n) => sum + n, 0)}`, CELL_W);
      });
      console.log(pad(areaTitle(area), TITLE_W) + cells.join(''));
    }
    console.log('');
  }

  const g = coverageGates(byDog);
  const goal = COVERAGE_GOALS;
  console.log(`■ 데이터 문턱(19 §4 — 넘은 칸에만 '{이름}랑 가기 좋은 곳' 라벨, 식당은 안 센다)`);
  console.log(`  소형견 숙소·카페 ${goal.cellMin}곳↑ 칸   ${g.small.cells}/12 (야외 빼면 ${g.small.okOnly}) · 목표 ${goal.smallCells}`);
  console.log(`  다견 숙소·카페 ${goal.cellMin}곳↑ 칸     ${g.multi.cells}/12 (야외 빼면 ${g.multi.okOnly}) · 목표 ${goal.multiCells}`);
  console.log(`  대형견 숙소 ${goal.bigStayMin}곳↑ 권역      ${g.bigStayAreas}/6 · 목표 ${goal.bigStayAreas}`);
  console.log(
    `  대형견 숙소·카페 빈칸     ${g.bigEmptyCells}/12 · ${g.bigEmptyCells <= goal.bigEmptyMax ? '라벨 가능' : `${goal.bigEmptyMax} 이하가 되기 전엔 라벨 없이 숫자만`}`,
  );
  console.log('');

  const pending = await fetchPendingRows();
  if (pending.skipped) {
    console.log(`(검수 대기 열 없음 — ${pending.skipped})`);
    return 0;
  }
  const byArea = pendingByArea(pending.rows);
  const total = { stay: 0, cafe: 0, restaurant: 0 };
  console.log('■ 검수 대기 신규 후보(이름으로 접은 곳 수 — 승인되면 이 칸에 더해진다)');
  console.log(header('권역'));
  for (const area of [...AREAS.map(({ id }) => id), NO_AREA]) {
    const row = byArea.get(area);
    if (!row && area === NO_AREA) continue;
    for (const type of PLACE_TYPES) total[type] += row?.[type] ?? 0;
    const title = area === NO_AREA ? NO_AREA : areaTitle(area);
    console.log(pad(title, TITLE_W) + PLACE_TYPES.map((type) => pad(String(row?.[type] ?? 0), CELL_W)).join(''));
  }
  console.log(pad('합', TITLE_W) + PLACE_TYPES.map((type) => pad(String(total[type]), CELL_W)).join(''));
  return 0;
}

if (isDirectRun(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
