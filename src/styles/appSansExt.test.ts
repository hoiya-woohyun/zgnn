import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extRangeBlocks, inRanges } from '../../scripts/lib/bundleSwPrecache.mjs';

/**
 * 본문 글꼴은 Core(layout.tsx 의 next/font, 프리로드)와 Ext(appSansExt.css, unicode-range) 두 조각이다(ADR-006 v7).
 * 조각을 잘못 나눠도 빌드·화면은 멀쩡하다 — 데이터 글자가 Ext 범위에 들면 그 화면이 Ext 를 통째로(약 910KB) 받고,
 * `--font-app-core` 이름이 어긋나면 `--font-app` 이 무효가 되어 글꼴 전체가 시스템 폰트로 떨어진다. 그 짝을 여기서 지킨다.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const css = read('./appSansExt.css');

/** 경계는 빌드 경고(`check-bundle.mjs`)와 **같은 파서**로 읽는다 — 각자 읽으면 둘이 다른 글자를 말한다(14 W261010.33t). */
const extRanges = extRangeBlocks(css);
const inExt = (char: string) => inRanges(char.codePointAt(0)!, extRanges[0]);

/** KS X 1001 의 한글 2,350자 — EUC-KR 의 B0A1~C8FE 칸을 풀어 얻는다. */
const ksx1001 = (() => {
  const decoder = new TextDecoder('euc-kr');
  const set = new Set<string>();
  for (let lead = 0xb0; lead <= 0xc8; lead++) {
    for (let trail = 0xa1; trail <= 0xfe; trail++) set.add(decoder.decode(new Uint8Array([lead, trail])));
  }
  return set;
})();

const HANGUL = /[가-힣]/g;

describe('본문 글꼴 두 조각 — Core 와 Ext 의 경계', () => {
  it('Ext 는 변수 글꼴 한 face 가 굵기 축 400–700 을 다 맡는다(ADR-006 v10) — Core 도 같은 범위다', () => {
    expect(extRanges).toHaveLength(1);
    expect(css).toContain('font-weight: 400 700;');
    expect(read('../app/layout.tsx')).toContain("weight: '400 700'");
  });

  it('Ext 범위에 상용 2,350자가 하나도 없다 — 흔한 글자가 Ext 를 받게 하지 않는다', () => {
    expect(ksx1001.size).toBe(2350);
    expect([...ksx1001].filter(inExt)).toEqual([]);
  });

  it('데이터(src/data/*.json)에 나오는 한글이 Ext 범위에 없다 — 실패하면 python3 scripts/split-fonts.py 로 다시 쪼갠다', () => {
    const dataDir = new URL('../data/', import.meta.url);
    const chars = new Set(
      readdirSync(dataDir)
        .filter((name) => name.endsWith('.json'))
        .flatMap((name) => readFileSync(new URL(name, dataDir), 'utf8').match(HANGUL) ?? []),
    );
    expect([...chars].filter(inExt)).toEqual([]);
  });

  it('Ext 는 KS X 1001 밖 음절을 맡는다 — 사용자가 친 "똠" 은 대체 글꼴이 아니라 Ext 로 그린다', () => {
    expect(inExt('똠')).toBe(true);
  });

  it('@font-face 가 가리키는 woff2 가 있다', () => {
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map(([, url]) => url);
    expect(urls).toHaveLength(1);
    for (const url of urls) expect(existsSync(new URL(url, import.meta.url))).toBe(true);
  });

  it('--font-app 이 layout.tsx 의 next/font 변수(Core) 뒤에 Ext 를 잇는다', () => {
    const layout = read('../app/layout.tsx');
    expect(layout).toContain("variable: '--font-app-core'");
    expect(css).toMatch(/--font-app:\s*var\(--font-app-core\),\s*'Zgnn Sans Ext';/);
    expect(css).toContain("font-family: 'Zgnn Sans Ext';");
  });

  it('Ext CSS 는 globals.css 가 @import 한다 — layout.tsx 가 따로 import 하면 렌더를 막는 stylesheet 가 하나 더 생긴다', () => {
    expect(read('./globals.css')).toContain("@import './appSansExt.css';");
    expect(read('../app/layout.tsx')).not.toMatch(/^import\s+['"]@\/styles\/appSansExt\.css['"]/m);
  });
});
