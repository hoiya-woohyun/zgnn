// Supabase(원본, ADR-015) 를 읽어 src/data/places.json · items.json 을 갱신한다. 대체가 아니라 갱신이다 —
// 로컬 dev 는 이 명령을 안 불러도 기존 스냅샷으로 그대로 돌아간다. Vercel 빌드 명령은 `pnpm data pull && pnpm build`.
// 키가 없으면 조용히 스냅샷을 쓰지 않고 실패한다 — CI 가 옛 데이터로 조용히 빌드되는 걸 막기 위해서다.
// readOnly: published 만 읽으므로 로그인 없이 publishable(anon) 키로도 된다 — Vercel 빌드가 이 경로다. RLS 가 그 집합만 연다(ADR-016 v5).
//
// 블로그 출처(비공개) 행은 원문 대신 판정 입력을 미리 계산해 싣는다(21 S8, `src/lib/placeDerive.ts` 의 `toSnapshotRow`) — 레포가 PUBLIC 이고
// webpack 은 JSON 을 통째로 번들에 넣는다. 원문을 포함한 전체 행은 gitignored 캐시(`data/raw/places-source.json`)에 남기고,
// `--offline` 은 그 캐시만 읽어 places.json 을 다시 계산한다 — 판정 규칙을 고친 뒤 원격 변경을 섞지 않고 블로그 행을 새로 계산하는 길.
// 앱 TS 를 부르므로 확장자 훅(`tsExtResolve.mjs`)을 main 안에서 건다 — 직접 실행해도 `node --experimental-strip-types --no-warnings scripts/pull-db.mjs` 그대로.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writeDataJson } from './lib/dataJson.mjs';
import { fromPlaceRow, toItem, withReportFlags } from './lib/placeFields.mjs';
import { regionWarnings } from './lib/regionCheck.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';
import { isDirectRun } from './lib/isDirectRun.mjs';

const ROOT = new URL('../', import.meta.url);
const CACHE = new URL('data/raw/places-source.json', ROOT);

/** 앱의 조립 함수 — 훅을 건 뒤에 부른다(확장자 없는 상대 import). Vercel 빌드에서 앱 TS 를 부르는 유일한 자리다. */
async function loadSnapshotRow() {
  await import('./lib/tsExtResolve.mjs');
  const { toSnapshotRow } = await import('../src/lib/placeDerive.ts');
  return toSnapshotRow;
}

/** 전체 행(원문 포함) → places.json. 캐시와 places.json 이 같은 행 배열에서 나온다 — drift 테스트(`placeDerive.test.ts`)가 그것을 본다. */
async function writePlaces(places) {
  const toSnapshotRow = await loadSnapshotRow();
  const rows = places.map(toSnapshotRow);
  await writeDataJson(new URL('src/data/places.json', ROOT), rows);
  return rows.filter((row) => 'derived' in row).length;
}

/** `--offline` — 원격을 안 읽는다. 캐시가 없거나 비면 덮지 않고 1(빈 결과와 같은 규칙). */
async function offline() {
  if (!existsSync(CACHE)) {
    console.error('원문 캐시(data/raw/places-source.json)가 없다 — 온라인 `pnpm data pull` 이 먼저 만든다. 파일을 덮어쓰지 않는다.');
    return 1;
  }
  const places = JSON.parse(await readFile(CACHE, 'utf8'));
  if (!Array.isArray(places) || places.length === 0) {
    console.error('원문 캐시가 비어 있다 — 파일을 덮어쓰지 않는다.');
    return 1;
  }
  for (const warning of regionWarnings(places)) console.warn(`⚠ ${warning}`);
  const hidden = await writePlaces(places);
  console.log(`pull --offline 완료: places ${places.length}(캐시) · 원문 숨김 ${hidden}(미리 계산) — items.json·원격은 그대로`);
  return 0;
}

export async function main(argv = []) {
  if (argv.includes('--offline')) return offline();
  const supabase = createSupabase({ readOnly: true });

  // 지금 규모(86곳·15개)는 supabase-js 기본 1000행 제한에 한참 못 미친다 — 늘어나면 range() 로 페이지네이션.
  const { data: placeRows, error: placesError } = await supabase
    .from('places')
    .select('*')
    .eq('status', 'published')
    .order('sort', { ascending: true, nullsFirst: false })
    .order('id');
  if (placesError) throw placesError;

  const { data: itemRows, error: itemsError } = await supabase
    .from('items')
    .select('*')
    .order('sort', { ascending: true, nullsFirst: false })
    .order('id');
  if (itemsError) throw itemsError;

  // 빈 결과는 데이터가 아니라 사고다(정책이 바뀌었거나 다른 프로젝트) — [] 로 덮어쓰면 Vercel 이 빈 사이트를 배포하고 빌드는 초록이다.
  if (placeRows.length === 0 || itemRows.length === 0) {
    console.error(`결과가 비어 있다(places ${placeRows.length} · items ${itemRows.length}) — RLS 정책·프로젝트를 확인. 파일을 덮어쓰지 않는다.`);
    return 1;
  }

  // 열린 폐업 제보가 있는 곳(ADR-021 R5) — 상세가 "○년 ○월 확인" 을 그리지 않게. 함수가 원격에 없으면(마이그레이션 `20261001150000` 전)
  // 경고 한 줄 뒤 표식 없이 간다: 이 표식은 날짜 하나를 숨길 뿐이라, 이것 때문에 배포를 멈추면 잃는 것이 더 크다.
  const { data: reportFlags, error: flagsError } = await supabase.rpc('place_report_flags');
  if (flagsError) console.warn(`제보 표식을 읽지 못했다(${flagsError.code ?? ''} ${flagsError.message}) — 표식 없이 계속한다.`);

  const places = withReportFlags(placeRows.map(fromPlaceRow), flagsError ? [] : reportFlags);

  const items = itemRows.map((row) => toItem({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    seasons: row.seasons,
    reason: row.reason,
    linkUrl: row.link_url,
  }));

  // 캐시를 먼저 — places.json 이 캐시와 같은 행에서 나와야 다음 `--offline` 이 같은 결과를 낸다.
  await mkdir(new URL('data/raw/', ROOT), { recursive: true });
  await writeFile(CACHE, JSON.stringify(places, null, 1));
  const hidden = await writePlaces(places);
  await writeDataJson(new URL('src/data/items.json', ROOT), items);

  // 읍면·방향이 주소와 어긋난 곳 — **경고만**(빌드는 막지 않는다. 고치는 것은 /admin 의 사람 손, regionCheck.mjs 머리 주석).
  for (const warning of regionWarnings(places)) console.warn(`⚠ ${warning}`);

  console.log(`pull 완료: places ${places.length} (published) · items ${items.length} · 폐업 제보 표식 ${places.filter((place) => place.openReportKinds).length} · 원문 숨김 ${hidden}(미리 계산)`);
}

if (isDirectRun(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
