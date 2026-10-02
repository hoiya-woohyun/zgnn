import { describe, expect, it } from 'vitest';
import { isChunkLoadError, shouldReloadForChunk } from './appUpdate';

const named = (name: string, message: string) => Object.assign(new Error(message), { name });

describe('isChunkLoadError', () => {
  it('webpack · 크롬 · 사파리 · 파이어폭스의 청크 실패를 알아본다', () => {
    expect(isChunkLoadError(named('ChunkLoadError', 'Loading chunk 123 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk app-map failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/_next/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
  });

  it('다른 오류는 아니다', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isChunkLoadError('Loading chunk 1 failed')).toBe(false);
  });
});

describe('shouldReloadForChunk', () => {
  const chunk = named('ChunkLoadError', 'Loading chunk 1 failed.');
  it('이 배포에서 처음이면 새로고침, 두 번째면 안 한다', () => {
    expect(shouldReloadForChunk(chunk, null, 'abc1234')).toBe(true);
    expect(shouldReloadForChunk(chunk, 'abc1234', 'abc1234')).toBe(false);
  });
  it('다른 배포에서 남긴 표시면 다시 한 번 허용한다', () => {
    expect(shouldReloadForChunk(chunk, 'old0000', 'abc1234')).toBe(true);
  });
  it('청크 오류가 아니면 새로고침하지 않는다', () => {
    expect(shouldReloadForChunk(new Error('boom'), null, 'abc1234')).toBe(false);
  });
});
