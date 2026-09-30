import { describe, expect, it } from 'vitest';
import { titleFlight } from './titleFlight';

// 390 폭 폰: 본문 줄은 왼쪽 16 에서 44 타일(글리프 22) + 12 간격 + 24px 상호명. 헤더는 뒤로가기(4 + 44) 뒤 20px 아이콘 + 8 + 16px 상호명.
const BASE = {
  rowCenter: 150,
  barCenter: 75,
  thumbLeft: 16,
  thumbWidth: 44,
  glyphRatio: 0.5,
  barIconCenterX: 62,
  barIconWidth: 20,
  titleLeft: 72,
  titleFontSize: 24,
  barTitleLeft: 80,
  barTitleFontSize: 16,
};

describe('titleFlight — 본문 제목 줄이 헤더의 제자리로', () => {
  it('구간은 스크롤 0 에서 시작해, 줄의 세로 중심이 헤더 가운데에 닿는 스크롤에서 끝난다', () => {
    expect(titleFlight(BASE).range).toEqual({ from: 0, to: 75 });
  });

  it('타일은 글리프가 헤더 아이콘 크기가 되게 줄고, 줄어든 타일의 가운데가 헤더 아이콘의 가운데에 온다', () => {
    const { thumb } = titleFlight(BASE);
    expect(thumb.scale).toBeCloseTo(20 / 22);
    const center = BASE.thumbLeft + thumb.tx + (thumb.scale * BASE.thumbWidth) / 2;
    expect(center).toBeCloseTo(BASE.barIconCenterX);
  });

  it('상호명은 글자 크기 비로 줄고 왼쪽 변이 헤더 상호명의 왼쪽 변에 온다', () => {
    const { title } = titleFlight(BASE);
    expect(title.scale).toBeCloseTo(16 / 24);
    expect(BASE.titleLeft + title.tx).toBe(BASE.barTitleLeft);
  });

  it('줄이 이미 헤더보다 위에 있으면(잘못 잰 경우) 길이 0 구간을 만들지 않는다', () => {
    expect(titleFlight({ ...BASE, rowCenter: 40 }).range.to).toBeGreaterThan(0);
  });

  it('크기를 못 쟀으면(0) 배율 1 — 0 으로 나누지 않는다', () => {
    const flight = titleFlight({ ...BASE, thumbWidth: 0, titleFontSize: 0 });
    expect(flight.thumb.scale).toBe(1);
    expect(flight.title.scale).toBe(1);
  });
});
