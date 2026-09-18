import { beforeEach, describe, expect, it } from 'vitest';
import { arrivalScrollOf, forgetScrollMemory, rememberScroll } from './appScroll';

describe('appScroll', () => {
  beforeEach(forgetScrollMemory);

  it('처음 가는 화면은 맨 위에서 시작한다', () => {
    expect(arrivalScrollOf('/checklist')).toBe(0);
  });

  it('탭바 화면은 떠날 때의 자리로 돌아온다', () => {
    rememberScroll('/checklist', 640);
    expect(arrivalScrollOf('/checklist')).toBe(640);
  });

  it('주소 끝의 슬래시는 같은 화면으로 본다 — 정적 내보내기라 둘 다 들어온다', () => {
    rememberScroll('/checklist/', 320);
    expect(arrivalScrollOf('/checklist')).toBe(320);
  });

  it('하위 화면도 제자리를 지킨다 — 목록에서 상세를 들렀다 나오면 보던 항목이 다시 보인다', () => {
    rememberScroll('/saved', 480);
    expect(arrivalScrollOf('/saved')).toBe(480);
  });

  it('상세는 장소마다 따로 기억한다 — 한 곳을 내려 봐도 다른 곳은 맨 위에서 시작한다', () => {
    rememberScroll('/place/aaa', 500);
    expect(arrivalScrollOf('/place/aaa')).toBe(500);
    expect(arrivalScrollOf('/place/bbb')).toBe(0);
  });

  it('음수는 0 으로 — iOS 의 고무줄 스크롤이 그대로 기억되면 도착이 튄다', () => {
    rememberScroll('/settings', -120);
    expect(arrivalScrollOf('/settings')).toBe(0);
  });

  /*
   * 맨 위에서 시작해야 하는 이동은 이제 **이동하는 쪽만** 말할 수 있다 — 여기에 주소로 된
   * 예외가 하나도 없기 때문이다. 아래는 그 약속의 모양만 확인한다: 도착점을 0 으로 적어 두면
   * 도착은 맨 위다.
   *
   * **이 테스트는 `placesPageSwipe` 가 실제로 그 write 를 한다는 것을 확인하지 못한다.**
   * 그쪽 코드(`settle` 안의 `rememberScroll(..., 0)`)를 지워도 이 파일은 초록색으로 남고
   * 종류 전환만 조용히 어긋난다. 그 한 줄이 load-bearing 이라는 사실은 지금 주석으로만 지켜진다.
   */
  it('도착점을 0 으로 적어 두면 맨 위에서 시작한다 — 둘러보기 종류 전환이 쓰는 약속', () => {
    rememberScroll('/places/stay', 100);
    expect(arrivalScrollOf('/places/stay')).toBe(100);

    rememberScroll('/places/stay', 0);
    expect(arrivalScrollOf('/places/stay')).toBe(0);
  });
});
