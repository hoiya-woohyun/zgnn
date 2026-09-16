import { describe, expect, it } from 'vitest';
import { checklistPageStayIdFromKey, checklistPageStayKey, checklistPageStaySections } from './checklistPageStayPicker';
import { placesOfType } from './places';

const stays = placesOfType('stay');
const [first, second] = stays;

describe('checklistPageStaySections — 저장한 숙소는 위에 한 번 더, 전체 목록은 그대로', () => {
  it('저장한 숙소가 없으면 "모든 숙소" 하나뿐이다', () => {
    const sections = checklistPageStaySections(stays, []);
    expect(sections.map((section) => section.title)).toEqual(['모든 숙소']);
    expect(sections[0].options).toHaveLength(stays.length);
  });

  it('저장한 숙소가 있으면 앞에 섹션이 붙고, 전체 목록에서는 빠지지 않는다', () => {
    const sections = checklistPageStaySections(stays, [first]);
    expect(sections.map((section) => section.title)).toEqual(['저장한 숙소', '모든 숙소']);
    expect(sections[1].options).toHaveLength(stays.length);
  });

  it('같은 숙소가 두 번 나와도 키는 전부 다르다 — react-aria 컬렉션 제약', () => {
    const keys = checklistPageStaySections(stays, [first, second]).flatMap((section) =>
      section.options.map((option) => option.id),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('키 ↔ 숙소 id 왕복', () => {
  it('어느 섹션의 키든 같은 숙소 id 로 돌아온다', () => {
    const [saved, all] = checklistPageStaySections(stays, [first]);
    expect(checklistPageStayIdFromKey(saved.options[0].id)).toBe(first.id);
    expect(checklistPageStayIdFromKey(all.options[0].id)).toBe(first.id);
    expect(checklistPageStayIdFromKey(null)).toBeNull();
  });

  it('저장한 숙소를 골랐으면 체크는 위쪽(저장한 숙소) 사본에 붙는다', () => {
    const [saved] = checklistPageStaySections(stays, [first]);
    expect(checklistPageStayKey(first.id, [first])).toBe(saved.options[0].id);
    expect(checklistPageStayKey(second.id, [first])).toBe(second.id);
    expect(checklistPageStayKey(null, [first])).toBeNull();
  });
});
