import { cx } from '@/utils/cx';
import type { Props as TButtonProps } from './base/button';
import { Button } from './base/button';

/**
 * 주 행동 채움 — 잉크 면 + 흰 글자(ADR-003 v31 · 22 G6.0).
 *
 * **핑크는 선택·상태 신호에만 앉는다**(켠 라디오·스위치 · '갈 수 있어요' 판정 · 장소 수 · 저장 하트). 주 버튼까지 핑크면 시트 하나에서
 * 켠 지역 점·스위치·'N곳 보기' 가 같은 색이라 "골랐다" 와 "눌러라" 가 한 신호가 됐다(결과 버튼 propose 4a63fce).
 * 눌림은 새 색 없이 같은 면의 opacity 90. 막힘·0곳은 부르는 쪽이 `bg-tertiary text-quaternary` 를 그대로 쓴다.
 *
 * base `Button` 의 `primary` 는 복사본이라 핑크 그대로 두고(`/admin` 이 쓴다), 여기서 덮는다 — `cx`(tailwind-merge)가
 * `bg-brand-solid`·`hover:`·`data-loading:` 변형을 지우는 것까지 테스트가 본다. raw `<button>`·`<Link>` 는 `INK_ACTION` 을 쓴다.
 */
export const INK_ACTION =
  'bg-primary-solid text-white hover:bg-primary-solid hover:opacity-90 active:opacity-90 data-loading:bg-primary-solid';

/** 버튼·링크 두 갈래(`href`)를 그대로 받되 색만 뺀다 — 유니언에 `Omit` 을 바로 걸면 공통 키만 남아 `href` 가 빠진다. */
type TInkButtonProps = TButtonProps extends infer P ? (P extends unknown ? Omit<P, 'color'> : never) : never;

export function InkButton({ className, ...props }: TInkButtonProps) {
  return <Button {...(props as TButtonProps)} color="primary" className={cx(INK_ACTION, className)} />;
}
