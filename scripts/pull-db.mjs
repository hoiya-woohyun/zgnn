// Supabase(원본, ADR-015) 를 읽어 src/data/places.json · items.json 을 갱신한다. 대체가 아니라 갱신이다 —
// 로컬 dev 는 이 명령을 안 불러도 기존 스냅샷으로 그대로 돌아간다. Vercel 빌드 명령은 `pnpm data:pull && pnpm build`.
// 키가 없으면 조용히 스냅샷을 쓰지 않고 실패한다 — CI 가 옛 데이터로 조용히 빌드되는 걸 막기 위해서다.
import { fromPlaceRow, toItem, writeDataJson } from './lib/placeFields.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

const supabase = createSupabase();

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
