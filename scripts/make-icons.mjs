// PWA 아이콘 생성: SVG(둥근 사각 배경 + 발자국) → sharp 로 PNG.
// 실행: pnpm icons  → public/icons/{icon-180,icon-192,icon-512,icon-maskable-512}.png
//                    + public/{favicon.ico,apple-touch-icon.png}
// 결과 PNG 는 커밋해 두고, 팔레트가 바뀔 때만 다시 실행한다.
//
// 루트의 두 파일은 **관례 경로**용이다 — 페이지는 layout.tsx 의 `icons` 로 /icons/ 를 선언해 그쪽을 쓰지만,
// <link rel="icon"> 을 안 읽는 클라이언트(일부 크롤러·북마크·링크 없는 문서를 연 탭)는 이 두 경로를 그냥 찾아 404 를 낸다(08 T5.8).
// 프리캐시(next.config.mjs 의 publicEntries)는 icons/·images/ 만 훑으므로 여기엔 안 들어간다 — 들어갈 필요도 없다.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const PUBLIC = new URL('../public/', import.meta.url);
await mkdir(new URL('icons/', PUBLIC), { recursive: true });

const BG = '#2e2327'; // 잉크 (theme.css --color-ink)
const FG = '#fe9bbd'; // 핑크 (theme.css --color-brand-300)

/**
 * 발자국. 네 개의 발가락과 하나의 발바닥, 전부 타원이다.
 * 좌우 대칭이라 작은 크기에서도 형태가 뭉개지지 않는다.
 * scale 은 중심(256, 256)을 기준으로 줄인다 — maskable 은 기기가 바깥을 잘라내므로 더 작게.
 */
const PAW_PARTS = [
  { cx: 138, cy: 214, rx: 42, ry: 54, rotate: -22 },
  { cx: 209, cy: 150, rx: 42, ry: 57, rotate: -8 },
  { cx: 303, cy: 150, rx: 42, ry: 57, rotate: 8 },
  { cx: 374, cy: 214, rx: 42, ry: 54, rotate: 22 },
  { cx: 256, cy: 336, rx: 110, ry: 88, rotate: 0 },
];

const paw = (scale) => {
  const c = 256;
  return PAW_PARTS.map(({ cx, cy, rx, ry, rotate }) => {
    const x = c + (cx - c) * scale;
    const y = c + (cy - c) * scale;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(rx * scale).toFixed(1)}" ry="${(ry * scale).toFixed(1)}" fill="${FG}" transform="rotate(${rotate} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('');
};

const svg = ({ radius, scale, bleed }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="${bleed}" y="${bleed}" width="${512 - bleed * 2}" height="${512 - bleed * 2}" rx="${radius}" fill="${BG}"/>
  ${paw(scale)}
</svg>`;

const standard = Buffer.from(svg({ radius: 112, scale: 0.86, bleed: 0 }));
// maskable 은 기기가 바깥을 잘라내므로 배경을 꽉 채우고 발자국을 안쪽으로 모은다.
const maskable = Buffer.from(svg({ radius: 0, scale: 0.62, bleed: 0 }));

const targets = [
  { name: 'icons/icon-180.png', source: standard, size: 180 },
  { name: 'icons/icon-192.png', source: standard, size: 192 },
  { name: 'icons/icon-512.png', source: standard, size: 512 },
  { name: 'icons/icon-maskable-512.png', source: maskable, size: 512 },
  { name: 'apple-touch-icon.png', source: standard, size: 180 },
];

const toPng = (source, size) => sharp(source).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

for (const target of targets) {
  await writeFile(new URL(target.name, PUBLIC), await toPng(target.source, target.size));
  console.log(`wrote ${target.name} (${target.size}px)`);
}

/**
 * favicon.ico — sharp 는 ICO 를 못 쓰므로 PNG 를 ICO 봉투에 그대로 담는다(Vista 이후 모든 브라우저가 PNG 든 ICO 를 읽는다).
 * 머리 6바이트 + 크기마다 목록 16바이트 + PNG 본문. 탭(16)과 고해상도 탭(32) 두 장.
 */
const ICO_SIZES = [16, 32];
const images = await Promise.all(ICO_SIZES.map((size) => toPng(standard, size)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // 예약
header.writeUInt16LE(1, 2); // 1 = 아이콘
header.writeUInt16LE(images.length, 4);
let offset = header.length + images.length * 16;
const entries = images.map((png, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(ICO_SIZES[i], 0); // 폭(256 이면 0)
  entry.writeUInt8(ICO_SIZES[i], 1); // 높이
  entry.writeUInt8(0, 2); // 팔레트 없음
  entry.writeUInt8(0, 3); // 예약
  entry.writeUInt16LE(1, 4); // 색 평면
  entry.writeUInt16LE(32, 6); // 픽셀당 비트
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});
await writeFile(new URL('favicon.ico', PUBLIC), Buffer.concat([header, ...entries, ...images]));
console.log(`wrote favicon.ico (${ICO_SIZES.join('·')}px)`);
