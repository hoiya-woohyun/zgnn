import { describe, expect, it } from 'vitest';
import { cleanSavedNote, SAVED_NOTE_MAX, sanitizeSavedNotes, withSavedNote } from './savedNotes';

describe('cleanSavedNote', () => {
  it('공백을 걷고 줄바꿈을 한 칸으로, 길면 자른다', () => {
    expect(cleanSavedNote('  1일차\n 아내가 고름 ')).toBe('1일차 아내가 고름');
    expect(cleanSavedNote('   ')).toBeNull();
    expect([...(cleanSavedNote('가'.repeat(100)) ?? '')].length).toBe(SAVED_NOTE_MAX);
  });
});

describe('sanitizeSavedNotes', () => {
  it('저장한 곳의 메모만 남긴다', () => {
    expect(sanitizeSavedNotes({ a: '전화함', b: '지운 곳', c: 3, d: ' ' }, ['a', 'c', 'd'])).toEqual({ a: '전화함' });
    expect(sanitizeSavedNotes(null, ['a'])).toEqual({});
    expect(sanitizeSavedNotes(['x'], ['0'])).toEqual({});
  });
});

describe('withSavedNote', () => {
  it('비우면 지운다', () => {
    expect(withSavedNote({ a: 'x' }, 'a', ' ')).toEqual({});
    expect(withSavedNote({}, 'a', '2마리 OK')).toEqual({ a: '2마리 OK' });
  });
});
