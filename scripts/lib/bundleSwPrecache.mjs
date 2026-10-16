// `out/sw.js` 프리캐시 목록 판정 + 글꼴 Core 밖 글자 세기 — check-bundle.mjs 가 부르는 순수 함수들.
//
// 왜 있나(14 W261010.33o): next.config.mjs 의 `dontCacheBustURLsMatching: /^\/_next\/+static\//` 한 줄이 지워지면
// 해시 이름 파일(글꼴 포함)에 revision 이 붙어 서비스워커가 설치하며 같은 파일을 `cache: 'reload'` 로 한 번 더 받는다.
// 빌드·테스트는 그대로 초록이라 눈에 안 띈다 — 첫 방문 글꼴이 1,284 → 2,464KB 로 되돌아간다.

// serwist 가 minify 된 sw.js 에 `{'revision':<null|'해시'>,'url':'/_next/static/…'}` 로 적는다(따옴표·순서가 바뀌어도 읽게 느슨하게).
const ENTRY_RE = /\{[^{}]*?['"]url['"]\s*:\s*['"](\/_next\/+static\/[^'"]+)['"][^{}]*\}/g;
const REVISION_RE = /['"]revision['"]\s*:\s*(null|['"][^'"]*['"])/;

export function readStaticPrecache(sw) {
  const entries = [];
  for (const m of sw.matchAll(ENTRY_RE)) {
    const rev = REVISION_RE.exec(m[0]);
    entries.push({ url: m[1], revision: rev ? (rev[1] === 'null' ? null : rev[1].slice(1, -1)) : undefined });
  }
  return entries;
}

// 문제 문구 배열을 돌려준다(비면 통과). 못 읽은 것(0건·woff2 0건)도 실패다 — 비어서 통과하는 검사를 막는다.
export function judgeSwPrecache(sw) {
  const entries = readStaticPrecache(sw);
  const fonts = entries.filter((e) => e.url.endsWith('.woff2'));
  if (entries.length === 0 || fonts.length === 0) {
    return [
      `sw.js 에서 /_next/static/ 프리캐시 항목을 못 읽었다(항목 ${entries.length}건 · woff2 ${fonts.length}건) — serwist 출력 모양이 바뀌었을 수 있다. scripts/lib/bundleSwPrecache.mjs 의 정규식을 고쳐라.`,
    ];
  }
  const stamped = entries.filter((e) => e.revision !== null);
  if (stamped.length === 0) return [];
  return [
    `/_next/static/ 프리캐시 ${stamped.length}건에 revision 이 붙었다(글꼴 ${stamped.filter((e) => e.url.endsWith('.woff2')).length}건) — 서비스워커가 설치하며 해시 이름 파일을 cache:'reload' 로 한 번 더 받는다. ` +
      `next.config.mjs 의 serwist 옵션에 \`dontCacheBustURLsMatching: /^\\/_next\\/+static\\//\` 가 있는지 봐라.\n` +
      stamped.slice(0, 5).map((e) => `  - ${e.url}`).join('\n'),
  ];
}

// appSansExt.css 의 unicode-range 들(= Core 에 없는 글자)을 [시작, 끝] 쌍으로.
export function extRanges(css) {
  const ranges = [];
  for (const line of css.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const part of line[1].split(',')) {
      const m = /U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/.exec(part);
      if (m) ranges.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)]);
    }
  }
  return ranges;
}

// 데이터 글자 중 Ext 범위에 드는(= Core 밖) 글자들. 범위가 하나도 없으면 null(읽지 못함).
export function glyphsOutsideCore(text, ranges) {
  if (ranges.length === 0) return null;
  const found = new Set();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xac00 && ranges.some(([a, b]) => cp >= a && cp <= b)) found.add(ch);
  }
  return [...found];
}
