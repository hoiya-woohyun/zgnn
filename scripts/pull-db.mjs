// Supabase(원본, ADR-015) 를 읽어 src/data/places.json · items.json 을 갱신한다. 대체가 아니라 갱신이다 —
// 로컬 dev 는 이 명령을 안 불러도 기존 스냅샷으로 그대로 돌아간다. Vercel 빌드 명령은 `pnpm data:pull && pnpm build`.
// 키가 없으면 조용히 스냅샷을 쓰지 않고 실패한다 — CI 가 옛 데이터로 조용히 빌드되는 걸 막기 위해서다.
// readOnly: published 만 읽으므로 로그인 없이 publishable(anon) 키로도 된다 — Vercel 빌드가 이 경로다. RLS 가 그 집합만 연다(ADR-016 v5).
import { fromPlaceRow, toItem, writeDataJson } from './lib/placeFields.mjs';
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

const places = placeRows.map(fromPlaceRow);

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

console.log(`pull 완료: places ${places.length} (published) · items ${items.length}`);
