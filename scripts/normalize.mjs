// Notion 추출본(data/jejudo-notion-export.json) + 이미지 매니페스트(data/place-images.json)
//   → src/data/places.json, src/data/items.json
// 원본이 Supabase 로 옮겨진 뒤(ADR-015)로는 데이터를 "만드는" 명령이 아니다 — Notion export 를 다시 시드해야
// 할 때만 쓴다. 평소 갱신은 `pnpm data:pull`(scripts/pull-db.mjs). 파생 규칙은 scripts/lib/placeFields.mjs, 파일 쓰기는 scripts/lib/dataJson.mjs 가 공유한다.
import { mkdir, readFile } from 'node:fs/promises';
import { writeDataJson } from './lib/dataJson.mjs';
import { toItem, toPlace } from './lib/placeFields.mjs';
import { regionWarnings } from './lib/regionCheck.mjs';

const ROOT = new URL('../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const src = await read('data/jejudo-notion-export.json');
let images = {};
try { images = await read('data/place-images.json'); } catch { console.warn('data/place-images.json 없음 — 이미지 없이 생성'); }

const TYPE = { 숙소: 'stay', 식당: 'restaurant', 카페: 'cafe' };

const places = [];
for (const [key, type] of Object.entries(TYPE)) {
  for (const row of src[key]) {
    const geo = row.geo ?? {};
    const imgs = images[row._id] ?? [];
    places.push(toPlace({
      id: row._id,
      type,
      name: row['이름'].trim(),
      regionRaw: row['위치'],
      features: row['특징'],
      petPolicyText: type === 'stay' ? row['반려동물 요금 (1박)'] : row['반려동물 이용'],
      reviewUrl: row['후기 포스트'],
      naverUrl: row['네이버 플레이스 바로가기'],
      naverPlaceId: geo.placeId,
      lat: geo.lat || undefined,
      lng: geo.lng || undefined,
      address: geo.roadAddress,
      category: geo.category,
      cover: imgs[0]?.cover,
      images: imgs.map((e) => e.full),
      stayPriceText: row['1박 요금 (2인)'],
      stayAmenitiesText: row['반려동물 용품'],
    }));
  }
}

const EMOJI = {
  '강아지 기내용 가방(5kg 이하)': '👜', '강아지 기내용 가방(5kg 이상)': '🧳', '강아지 유모차': '🛒',
  '강아지 방한용품': '🧣', '얇은 이불/담요': '🛏️', '인식표 목걸이': '🏷️', '진드기 퇴치제': '🦟',
  '휴대용 물병/밥그릇': '🥣', '오래 씹을 수 있는 간식': '🦴', '비상약/연고': '💊', '기저귀': '🩲',
  '배변봉투': '🧻', '강아지 튜브': '🛟', '강아지 구명조끼': '🦺', '강아지 수건': '🧺',
};
const items = src['준비물'].map((r) => toItem({
  id: r._id, name: r['이름'], emoji: EMOJI[r['이름'].trim()] ?? '🐶', seasons: r['태그'], reason: r['이유'], linkUrl: r['추천'],
}));

await mkdir(new URL('src/data/', ROOT), { recursive: true });
await writeDataJson(new URL('src/data/places.json', ROOT), places);
await writeDataJson(new URL('src/data/items.json', ROOT), items);
const withGeo = places.filter((p) => p.geo).length, withImg = places.filter((p) => p.images.length).length;
console.log(`places ${places.length} (geo ${withGeo}, images ${withImg}), items ${items.length}`);
// 읍면·방향이 주소와 어긋난 곳 — 경고만(pull-db.mjs 와 같다).
for (const warning of regionWarnings(places)) console.warn(`⚠ ${warning}`);
