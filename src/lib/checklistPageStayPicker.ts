import type { TPlace } from '@/types';

type TStayPickerOption = { id: string; label: string; supportingText: string };
export type TStayPickerSection = { title: string; options: TStayPickerOption[] };

/**
 * 저장한 숙소 섹션의 키 접두어.
 *
 * 저장한 숙소는 위에 따로 묶어 주되 전체 목록에서도 빼지 않는다(useChecklistAmenities 참조).
 * 그러면 같은 숙소가 두 번 나오는데 react-aria 컬렉션은 키가 겹치면 안 되므로, 위쪽 사본에만
 * 접두어를 붙여 구분하고 값으로 쓸 때는 도로 떼어 낸다.
 */
const SAVED_PREFIX = 'saved:';

const toOption = (stay: TPlace, id = stay.id): TStayPickerOption => ({
  id,
  label: stay.name,
  supportingText: stay.region.town,
});

/** 피커에 넣을 섹션. 저장한 숙소가 없으면 "모든 숙소" 하나뿐이다. */
export const checklistPageStaySections = (allStays: TPlace[], savedStays: TPlace[]): TStayPickerSection[] => {
  const sections: TStayPickerSection[] = [];
  if (savedStays.length > 0) {
    sections.push({
      title: '저장한 숙소',
      options: savedStays.map((stay) => toOption(stay, SAVED_PREFIX + stay.id)),
    });
  }
  sections.push({ title: '모든 숙소', options: allStays.map((stay) => toOption(stay)) });
  return sections;
};

/** 피커가 돌려준 키 → 숙소 id. 어느 섹션에서 골랐든 같은 숙소다. */
export const checklistPageStayIdFromKey = (key: string | null): string | null =>
  key?.startsWith(SAVED_PREFIX) ? key.slice(SAVED_PREFIX.length) : key;

/**
 * 숙소 id → 피커에 표시할 키. 저장한 숙소면 위쪽 사본을 가리켜, 다시 열었을 때 체크가
 * 화면 첫머리(저장한 숙소 섹션)에 보이게 한다.
 */
export const checklistPageStayKey = (stayId: string | null, savedStays: TPlace[]): string | null =>
  stayId && savedStays.some((stay) => stay.id === stayId) ? SAVED_PREFIX + stayId : stayId;
