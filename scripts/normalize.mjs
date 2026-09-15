// Notion 추출본(data/jejudo-notion-export.json) + 이미지 매니페스트(data/place-images.json)
//   → src/data/places.json, src/data/items.json
// 구조적인 파생(지역 분리, 요금 파싱, 좌표 병합)만 여기서 하고,
// 반려동물 이용 조건의 해석은 앱 런타임(src/lib/petPolicy.ts)에서 한다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const src = await read('data/jejudo-notion-export.json');
let images = {};
try { images = await read('data/place-images.json'); } catch { console.warn('data/place-images.json 없음 — 이미지 없이 생성'); }

const TYPE = { 숙소: 'stay', 식당: 'restaurant', 카페: 'cafe' };
const DIRECTION = { 동: 'east', 서: 'west', 남: 'south', 북: 'north' };
const clean = (s) => (s ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

function parseRegion(raw) {
  const s = (raw ?? '').trim();
  const m = s.match(/^(동|서|남|북)쪽\s*\((.+)\)$/);
  if (m) {
    const parts = m[2].trim().split(/\s+/);
    return { direction: DIRECTION[m[1]], town: parts[0], detail: parts.slice(1).join(' ') || undefined, raw: s };
  }
  if (s.startsWith('우도')) return { direction: 'udo', town: '우도면', raw: s };
  return { direction: 'unknown', town: s, raw: s };
}

// "59,000원 ~ 79,000원", "230,000원 (3인)", "150,000원 ~ 200,000원\n(인스타 DM이 빨라요)"
function parsePrice(text) {
  const t = clean(text);
  const nums = [...t.matchAll(/(\d{1,3}(?:,\d{3})+)\s*원/g)].map((m) => Number(m[1].replace(/,/g, '')));
  const note = [...t.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).join(', ') || undefined;
  return { text: t, min: nums.length ? Math.min(...nums) : undefined, max: nums.length ? Math.max(...nums) : undefined, note };
}

const places = [];
for (const [key, type] of Object.entries(TYPE)) {
  for (const row of src[key]) {
    const geo = row.geo ?? {};
    const imgs = images[row._id] ?? [];
    const place = {
      id: row._id,
      type,
      name: row['이름'].trim(),
      region: parseRegion(row['위치']),
      features: clean(row['특징']),
      petPolicyText: clean(type === 'stay' ? row['반려동물 요금 (1박)'] : row['반려동물 이용']),
      reviewUrl: row['후기 포스트'] || undefined,
      naverUrl: row['네이버 플레이스 바로가기'] || undefined,
      naverPlaceId: geo.placeId || undefined,
      geo: geo.lat && geo.lng ? { lat: geo.lat, lng: geo.lng } : undefined,
      address: geo.roadAddress || undefined,
      category: geo.category || undefined,
      cover: imgs[0]?.cover,
      images: imgs.map((e) => e.full),
    };
    if (type === 'stay') {
      place.stay = { price: parsePrice(row['1박 요금 (2인)']), amenitiesText: clean(row['반려동물 용품']) };
    }
    places.push(place);
  }
}

const EMOJI = {
  '강아지 기내용 가방(5kg 이하)': '👜', '강아지 기내용 가방(5kg 이상)': '🧳', '강아지 유모차': '🛒',
  '강아지 방한용품': '🧣', '얇은 이불/담요': '🛏️', '인식표 목걸이': '🏷️', '진드기 퇴치제': '🦟',
  '휴대용 물병/밥그릇': '🥣', '오래 씹을 수 있는 간식': '🦴', '비상약/연고': '💊', '기저귀': '🩲',
  '배변봉투': '🧻', '강아지 튜브': '🛟', '강아지 구명조끼': '🦺', '강아지 수건': '🧺',
};
const items = src['준비물'].map((r) => ({
  id: r._id,
  name: r['이름'].trim(),
  emoji: EMOJI[r['이름'].trim()] ?? '🐶',
  seasons: (r['태그'] ?? []).map((s) => s.trim()),
  reason: clean(r['이유']),
  linkUrl: r['추천'] || undefined,
}));

await mkdir(new URL('src/data/', ROOT), { recursive: true });
await writeFile(new URL('src/data/places.json', ROOT), JSON.stringify(places, null, 1));
await writeFile(new URL('src/data/items.json', ROOT), JSON.stringify(items, null, 1));
const withGeo = places.filter((p) => p.geo).length, withImg = places.filter((p) => p.images.length).length;
console.log(`places ${places.length} (geo ${withGeo}, images ${withImg}), items ${items.length}`);
