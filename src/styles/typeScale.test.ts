import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 글자 단계표(ADR-006 v10): 크기 20·16·14·12 네 단(+ 상세 업체명 24 하나), 굵기 700·600·400 세 단.
 * 단 밖의 클래스는 빌드·화면을 깨지 않고 조용히 돌아온다 — 18/700 섹션 머리 하나가 다시 "같은 사다리" 를 만든다
 * (design-audit 2026-10-26 B-26). 그래서 클래스를 글자로 대 본다.
 *
 * 빼는 곳: `components/base/`(Untitled UI 복사본 — 고치지 않는다, `label.tsx` 의 500 이 남는다) ·
 * `/admin`(운영자 PC 밀도 예외, ADR-018 결정 10).
 */
const SRC = new URL('..', import.meta.url).pathname;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

const EXCLUDED = /^(components\/base\/|screens\/admin|app\/admin\/)/;
const screens = files(SRC)
  .map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }))
  .filter(({ path }) => !EXCLUDED.test(path));

const hits = (re: RegExp, allow: string[] = []) =>
  screens.flatMap(({ path, text }) =>
    allow.includes(path) ? [] : [...text.matchAll(re)].map((m) => `${path}: ${m[0]}`),
  );

describe('글자 단계표 — 단 밖의 크기·굵기를 쓰지 않는다', () => {
  it('화면 파일을 실제로 읽는다(경로가 틀려 0개면 아래가 전부 헛통과한다)', () => {
    expect(screens.length).toBeGreaterThan(100);
    expect(screens.some(({ path }) => path === 'screens/placeDetailHeader.tsx')).toBe(true);
  });

  it('18px(text-lg) 단이 없다 — 섹션 머리는 text-md font-bold', () => {
    expect(hits(/(?<![\w-])text-lg(?![\w-])/g)).toEqual([]);
  });

  it('500(font-medium) 굵기가 없다 — 400 아니면 600', () => {
    expect(hits(/(?<![\w-])font-medium(?![\w-])/g)).toEqual([]);
  });

  it('display 단은 상세 업체명 하나뿐이다(24/700)', () => {
    expect(hits(/(?<![\w-])text-display-[a-z0-9]+(?![\w-])/g, ['screens/placeDetailHeader.tsx'])).toEqual([]);
    const header = screens.find(({ path }) => path === 'screens/placeDetailHeader.tsx')!.text;
    expect(header.match(/(?<![\w-])text-display-[a-z0-9]+/g)).toEqual(['text-display-xs']);
  });

  it('브레이크포인트별 글자 크기 보정이 없다 — 크기는 --spacing 한 축으로 커진다(ADR-006)', () => {
    expect(hits(/(?<![\w-])(?:sm|md|lg|xl):text-(?:xs|sm|md|lg|xl|display-[a-z0-9]+)(?![\w-])/g)).toEqual([]);
  });
});
