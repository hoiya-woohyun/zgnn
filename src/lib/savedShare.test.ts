import { describe, expect, it } from 'vitest';
import { parseSharedIds, sharedSavedUrl } from './savedShare';

const A = '278ddc10-ceae-81e3-a299-fd3f2515be4f';
const B = '278ddc10-ceae-811f-bcee-d05a31480417';
const C = '27bddc10-ceae-8081-b9c2-f20b8d3ea045';
const KNOWN = new Set([A, B, C]);

const paramOf = (url: string) => new URL(url).searchParams.get('ids');

describe('저장 목록 공유 링크 (07 P1)', () => {
  it('보낸 순서 그대로 왕복한다', () => {
    const url = sharedSavedUrl('https://zgnn.vercel.app', [C, A, B]);
    expect(url).toBe(`https://zgnn.vercel.app/saved/?ids=${C},${A},${B}`);
    expect(parseSharedIds(paramOf(url), KNOWN)).toEqual({ ids: [C, A, B], unknownCount: 0 });
  });

  it('쉼표가 %2C 로 이스케이프돼 와도 읽는다', () => {
    expect(parseSharedIds(paramOf(`https://x.app/saved/?ids=${A}%2C${B}`), KNOWN)).toEqual({ ids: [A, B], unknownCount: 0 });
  });

  it('중복은 한 번만, 빈 칸·공백은 건너뛴다', () => {
    expect(parseSharedIds(`${A},,${A}, ${B} ,`, KNOWN)).toEqual({ ids: [A, B], unknownCount: 0 });
  });

  it('지금 데이터에 없는 id 는 빼고 수만 센다', () => {
    expect(parseSharedIds(`${A},gone-1,${B},gone-1,gone-2`, KNOWN)).toEqual({ ids: [A, B], unknownCount: 2 });
    expect(parseSharedIds('gone-1', KNOWN)).toEqual({ ids: [], unknownCount: 1 });
  });

  it('값이 없거나 비었으면 공유 보기가 아니다', () => {
    expect(parseSharedIds(null, KNOWN)).toBeNull();
    expect(parseSharedIds('', KNOWN)).toBeNull();
    expect(parseSharedIds(' , ,', KNOWN)).toBeNull();
  });
});
