// data/raw/places/*.jpg → public/images/places/*.webp
//  - {id}-{n}.webp   : 상세 갤러리용, 가로 768px
//  - {id}-cover.webp : 카드 썸네일용, 480x360 크롭 (첫 번째 사진만)
// 실행: node scripts/optimize-images.mjs → data/place-images.json 매니페스트 생성
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/images/places/', ROOT);
await mkdir(OUT, { recursive: true });

const raw = JSON.parse(await readFile(new URL('data/place-images.raw.json', ROOT), 'utf8'));
const manifest = {};
let count = 0;
for (const [id, files] of Object.entries(raw)) {
  manifest[id] = [];
  for (let i = 0; i < files.length; i++) {
    const input = fileURLToPath(new URL(files[i], ROOT));
    const full = `${id}-${i + 1}.webp`;
    await sharp(input).rotate().resize({ width: 768, withoutEnlargement: true }).webp({ quality: 78 }).toFile(fileURLToPath(new URL(full, OUT)));
    const entry = { full: `/images/places/${full}` };
    if (i === 0) {
      const cover = `${id}-cover.webp`;
      await sharp(input).rotate().resize({ width: 480, height: 360, fit: 'cover' }).webp({ quality: 75 }).toFile(fileURLToPath(new URL(cover, OUT)));
      entry.cover = `/images/places/${cover}`;
    }
    manifest[id].push(entry);
    count++;
  }
}
await writeFile(new URL('data/place-images.json', ROOT), JSON.stringify(manifest, null, 1));
console.log(`optimized ${count} images for ${Object.keys(manifest).length} places`);
