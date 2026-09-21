// src/data/places.json · items.json (Notion export 로 만든 마지막 스냅샷) 을 Supabase 로 1회 옮긴다.
// ADR-015: 원본이 Supabase 로 바뀐 뒤로는 이 명령이 데이터를 "만드는" 경로가 아니지만, 재현성을 위해 레포에 둔다
// (스키마를 다시 만들거나 다른 프로젝트로 옮길 때 처음부터 다시 짤 필요가 없게). 여러 번 돌려도 안전하다(upsert).
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

const { error: placesError } = await supabase.from('places').upsert(placeRows, { onConflict: 'id' });
if (placesError) throw placesError;

const { error: itemsError } = await supabase.from('items').upsert(itemRows, { onConflict: 'id' });
if (itemsError) throw itemsError;

console.log(`시드 완료: places ${placeRows.length} · items ${itemRows.length}`);
