// PWA 아이콘 생성: SVG(둥근 사각 배경 + 발자국) → sharp 로 PNG.
// 실행: pnpm icons  → public/icons/{icon-180,icon-192,icon-512,icon-maskable-512}.png
// 결과 PNG 는 커밋해 두고, 팔레트가 바뀔 때만 다시 실행한다.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = new URL('../public/icons/', import.meta.url);
await mkdir(OUT, { recursive: true });

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
  { name: 'icon-180.png', source: standard, size: 180 },
  { name: 'icon-192.png', source: standard, size: 192 },
  { name: 'icon-512.png', source: standard, size: 512 },
  { name: 'icon-maskable-512.png', source: maskable, size: 512 },
];

for (const target of targets) {
  const png = await sharp(target.source).resize(target.size, target.size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(target.name, OUT), png);
  console.log(`wrote icons/${target.name} (${target.size}px)`);
}
