// Supabase(원본, ADR-015) 를 읽어 src/data/places.json · items.json 을 갱신한다. 대체가 아니라 갱신이다 —
// 로컬 dev 는 이 명령을 안 불러도 기존 스냅샷으로 그대로 돌아간다. Vercel 빌드 명령은 `pnpm data:pull && pnpm build`.
// 키가 없으면 조용히 스냅샷을 쓰지 않고 실패한다 — CI 가 옛 데이터로 조용히 빌드되는 걸 막기 위해서다.
// readOnly: published 만 읽으므로 로그인 없이 publishable(anon) 키로도 된다 — Vercel 빌드가 이 경로다. RLS 가 그 집합만 연다(ADR-016 v5).
import { writeDataJson } from './lib/dataJson.mjs';
import { fromPlaceRow, toItem, withReportFlags } from './lib/placeFields.mjs';
import { regionWarnings } from './lib/regionCheck.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

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
  process.exit(1);
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

const ROOT = new URL('../', import.meta.url);
await writeDataJson(new URL('src/data/places.json', ROOT), places);
await writeDataJson(new URL('src/data/items.json', ROOT), items);

// 읍면·방향이 주소와 어긋난 곳 — **경고만**(빌드는 막지 않는다. 고치는 것은 /admin 의 사람 손, regionCheck.mjs 머리 주석).
for (const warning of regionWarnings(places)) console.warn(`⚠ ${warning}`);

console.log(`pull 완료: places ${places.length} (published) · items ${items.length} · 폐업 제보 표식 ${places.filter((place) => place.openReportKinds).length}`);
