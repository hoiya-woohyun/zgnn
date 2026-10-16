import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Checkbox } from '@/components/base/checkbox';

/**
 * 입력칸 테두리 3:1(14 W261013.14f)은 globals.css 가 base Input 래퍼의 클래스 이름(`group/input`)을 잡아 거는 규칙이다.
 * base 를 Untitled UI 에서 다시 복사해 그 이름이 바뀌면 빌드·화면은 멀쩡한 채 테두리만 옅은 값(1.54:1)으로 조용히 돌아간다 — 그 짝을 여기서 지킨다.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** 라벨 달린 체크박스 규칙(14 W261013.14j) — 라벨 속성 · input 종류 · 뺀 role 을 잡아 마크업 쪽 검사가 같은 값을 쓴다. */
const CHECKBOX_RULE =
  /\nlabel\[([\w-]+)\]:has\(input\[type='(\w+)'\]:not\(\[role='(\w+)'\]\)\) \{\s*--ring-color-primary: var\(--color-border-field\);/;

describe('입력칸 테두리 — globals.css 의 규칙과 base Input 래퍼의 짝', () => {
  const input = read('../components/base/input.tsx');
  const globals = read('./globals.css');
  const theme = read('./theme.css');

  it('base Input 래퍼가 group/input 과 ring-primary 를 함께 쓴다 — 규칙이 바꾸는 변수가 그 테두리다', () => {
    const wrapper = input.split('\n').find((line) => line.includes('"group/input '));
    expect(wrapper).toBeDefined();
    expect(wrapper).toContain(' ring-primary ');
  });

  it('globals.css 가 그 래퍼·체크박스 라벨·field-edge 에서 ring-primary 의 변수를 border-field 로 돌린다', () => {
    expect(globals).toMatch(/\.group\\\/input \{\s*--ring-color-primary: var\(--color-border-field\);/);
    expect(globals).toMatch(CHECKBOX_RULE);
    expect(globals).toMatch(/@utility field-edge \{\s*--ring-color-primary: var\(--color-border-field\);/);
  });

  /*
   * 라벨 달린 base Checkbox(14 W261013.14j)는 react-aria 의 마크업 모양에 기대는 규칙이다 — 상자가 라벨 **안**에 있어야 변수를 물려받고,
   * 라벨에 `data-rac`·안에 체크박스 input 이 있어야 규칙이 잡는다. react-aria 를 올리거나 base 를 다시 복사해 모양이 바뀌면 테두리만 1.54:1 로 돌아간다.
   */
  it('base Checkbox 는 규칙의 선택자가 잡는 모양이다 — 그 라벨 안에 체크박스 input 과 ring-primary 상자', () => {
    // 선택자를 globals.css 에서 꺼내 그 조각마다 마크업에 대 본다 — 선택자만 고치고 마크업과 어긋나는 것을 막는다(jsdom 이 없어 querySelector 대신).
    const [, attr, inputType, notRole] = CHECKBOX_RULE.exec(globals) ?? [];
    expect([attr, inputType, notRole]).toEqual(['data-rac', 'checkbox', 'switch']);
    const html = renderToStaticMarkup(createElement(Checkbox, { size: 'sm', 'aria-label': '고르기' }));
    const label = /^<label\b([^>]*)>([\s\S]*)<\/label>$/.exec(html);
    expect(label?.[1]).toMatch(new RegExp(`\\b${attr}=`));
    expect(label?.[2]).toMatch(new RegExp(`<input\\b[^>]*type="${inputType}"`));
    expect(label?.[2]).not.toContain(`role="${notRole}"`);
    expect(label?.[2]).toMatch(/<div class="[^"]* ring-primary /);
  });

  it('border-field 토큰이 있다', () => {
    expect(theme).toContain('--color-border-field:');
  });
});
