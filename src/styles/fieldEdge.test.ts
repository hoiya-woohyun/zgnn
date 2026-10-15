import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 입력칸 테두리 3:1(14 W261013.14f)은 globals.css 가 base Input 래퍼의 클래스 이름(`group/input`)을 잡아 거는 규칙이다.
 * base 를 Untitled UI 에서 다시 복사해 그 이름이 바뀌면 빌드·화면은 멀쩡한 채 테두리만 옅은 값(1.54:1)으로 조용히 돌아간다 — 그 짝을 여기서 지킨다.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('입력칸 테두리 — globals.css 의 규칙과 base Input 래퍼의 짝', () => {
  const input = read('../components/base/input.tsx');
  const globals = read('./globals.css');
  const theme = read('./theme.css');

  it('base Input 래퍼가 group/input 과 ring-primary 를 함께 쓴다 — 규칙이 바꾸는 변수가 그 테두리다', () => {
    const wrapper = input.split('\n').find((line) => line.includes('"group/input '));
    expect(wrapper).toBeDefined();
    expect(wrapper).toContain(' ring-primary ');
  });

  it('globals.css 가 그 래퍼와 field-edge 에서 ring-primary 의 변수를 border-field 로 돌린다', () => {
    expect(globals).toMatch(/\.group\\\/input \{\s*--ring-color-primary: var\(--color-border-field\);/);
    expect(globals).toMatch(/@utility field-edge \{\s*--ring-color-primary: var\(--color-border-field\);/);
  });

  it('border-field 토큰이 있다', () => {
    expect(theme).toContain('--color-border-field:');
  });
});
