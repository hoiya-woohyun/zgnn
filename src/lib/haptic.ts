/**
 * iOS 햅틱 한 번 — 정식 API 가 없어 **숨은 스위치**를 대신 누른다.
 *
 * iOS Safari(홈 화면 PWA 포함)는 `navigator.vibrate` 가 없다. 유일하게 시스템 햅틱이 나는 길은
 * Safari 17.4 부터 생긴 `<input type="checkbox" switch>` 로, 사용자의 탭이 `<label>` 을 거쳐 값을 뒤집을 때
 * 네이티브 토글과 같은 진동이 한 번 울린다. 탭 핸들러 안에서 `label.click()` 을 부르는 것도 같은 사용자
 * 활성화 안이라 통하므로, 보이는 버튼은 그대로 두고 화면 밖에 둔 스위치 하나를 모두가 나눠 쓴다.
 *
 * - **장식이다.** 시스템 햅틱을 끈 기기, 17.4 미만, Android 에서는 조용히 아무 일도 없다. 핵심 동작을 여기에
 *   기대지 않는다. Apple 이 의도한 용도도 아니라 어느 버전에서 막혀도 기능은 그대로여야 한다.
 * - 사용자 제스처 **밖**(타이머·네트워크 응답)에서 부르면 울리지 않는다. 클릭 핸들러의 동기 구간에서만 부른다.
 * - `display: none` 이면 클릭이 안 먹어 화면 밖에 두고, 스크린리더엔 숨긴다.
 */

let label: HTMLLabelElement | null = null;

/** 17.4 미만은 `switch` 를 몰라 보통 체크박스가 된다 — 그러면 만들지 않는다. */
const supportsSwitch = () => typeof document !== 'undefined' && 'switch' in document.createElement('input');

const ensureSwitch = (): HTMLLabelElement | null => {
  if (label) return label;
  if (!supportsSwitch()) return null;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0';
  label.append(input);
  document.body.append(label);
  return label;
};

/** 클릭 핸들러 안에서 부른다. 지원하지 않으면 아무 일도 없다. */
export function triggerHaptic(): void {
  ensureSwitch()?.click();
}
