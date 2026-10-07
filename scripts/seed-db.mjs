// src/data/places.json · items.json (Notion export 로 만든 마지막 스냅샷) 을 Supabase 로 1회 옮긴다.
// ADR-015: 원본이 Supabase 로 바뀐 뒤로는 이 명령이 데이터를 "만드는" 경로가 아니지만, 재현성을 위해 레포에 둔다
// (스키마를 다시 만들거나 다른 프로젝트로 옮길 때 처음부터 다시 짤 필요가 없게). 여러 번 돌려도 안전하다(upsert).
// `node scripts/seed-db.mjs` 로 직접 부른다(재해복구용, ADR-024 — package.json 스크립트 줄은 없다).
import { readFile } from 'node:fs/promises';
import { createSupabase } from './lib/supabaseClient.mjs';

const supabase = createSupabase();

const ROOT = new URL('../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));

const places = await read('src/data/places.json');
const items = await read('src/data/items.json');

const placeRows = places.map((p, i) => ({
  id: p.id,
  type: p.type,
  name: p.name,
  region_raw: p.region.raw,
  features: p.features,
  pet_policy_text: p.petPolicyText,
  review_url: p.reviewUrl ?? null,
  naver_url: p.naverUrl ?? null,
  naver_place_id: p.naverPlaceId ?? null,
  lat: p.geo?.lat ?? null,
  lng: p.geo?.lng ?? null,
  address: p.address ?? null,
  category: p.category ?? null,
  stay_price_text: p.stay?.price.text ?? null,
  stay_amenities_text: p.stay?.amenitiesText ?? null,
  sort: i,
  status: 'published',
  source: 'notion',
}));

const itemRows = items.map((it, i) => ({
  id: it.id,
  name: it.name,
  emoji: it.emoji,
  seasons: it.seasons,
  reason: it.reason,
  link_url: it.linkUrl ?? null,
  sort: i,
}));

// 내린 곳(archived)은 건너뛴다. 위 행들은 `status: 'published'` 를 못 박고 upsert 는 `on conflict do update` 라,
// 그냥 두면 이 명령 한 번이 운영자가 내린 곳을 전부 **다시 게시한다** — 그것도 조용히(upsert 는 몇 행을 덮었는지 말하지 않는다).
// 스냅샷(`places.json`)에는 이미 내린 곳이 없으니 보통은 교집합이 비지만, 옛 스냅샷이나 git 이전 버전으로 돌리면 되살아난다.
// PostgREST 에는 "일부 칸만 덮는 upsert" 가 없어서 대상을 **보내기 전에** 뺀다.
const { count: placeCount, error: countError } = await supabase
  .from('places')
  .select('id', { count: 'exact', head: true });
if (countError) throw countError;
// 빈 결과는 데이터가 아니라 사고다(이 레포의 규칙 — RLS·프로젝트가 어긋나면 PostgREST 는 에러가 아니라 0을 준다).
// 여기서 그것을 "내린 곳이 없다" 로 읽으면 아래 upsert 가 운영자가 내린 곳을 전부 다시 게시한다.
if (!placeCount) {
  console.error('places 를 못 읽었다(0행) — 정책·PROJECT_REF 를 확인. 아무것도 쓰지 않고 멈춘다.');
  process.exit(1);
}

const { data: archivedRows, error: archivedError } = await supabase
  .from('places')
  .select('id')
  .eq('status', 'archived');
if (archivedError) throw archivedError;

const archivedIds = new Set((archivedRows ?? []).map((row) => row.id));
const seedRows = placeRows.filter((row) => !archivedIds.has(row.id));
const skipped = placeRows.length - seedRows.length;

const { error: placesError } = await supabase.from('places').upsert(seedRows, { onConflict: 'id' });
if (placesError) throw placesError;

const { error: itemsError } = await supabase.from('items').upsert(itemRows, { onConflict: 'id' });
if (itemsError) throw itemsError;

console.log(
  `시드 완료: places ${seedRows.length} · items ${itemRows.length}` +
    (skipped ? ` (내린 곳 ${skipped}곳은 건너뜀 — 되살리려면 /admin 에서)` : ''),
);
