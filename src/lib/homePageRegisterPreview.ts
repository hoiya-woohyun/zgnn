import type { TDogProfile } from '../types';
import { countByLevel } from './eligibilityCounts';
import type { TPetPolicy } from './petPolicy';

/** 미리보기의 두 예시 몸무게 — 소형견 하나, 대형견 하나. 숫자가 갈리는 것이 곧 등록할 이유다. */
export const PREVIEW_WEIGHTS_KG = [7, 25] as const;

export type THomePageRegisterPreview = {
  total: number;
  /** 예시 몸무게마다 '갈 수 있어요'(ok) 수. `PREVIEW_WEIGHTS_KG` 순서. */
  byWeight: { kg: number; ok: number }[];
};

/**
 * 홈 등록 카드의 등록 전 미리보기(14 C2610.2) — "숙소 26곳 중 7kg 아이는 18곳, 25kg 아이는 6곳".
 *
 * **숙소로 센다.** 숙소 판정은 몸무게·마릿수로 갈리고 이동 수단이 거의 끼지 않아, 예시 프로필의
 * 이동 수단(`none`)이 숫자를 지어내지 않는다. 식당은 반대로 이동 수단 하나로 결판나서(08 §2) 예시로
 * 고른 가방 유무가 곧 숫자가 된다 — 사람이 아직 말하지 않은 것을 가정하는 셈이라 쓰지 않는다.
 * 목록 머리·홈 종류 카드와 같은 `countByLevel` 로 세어, 등록 뒤 보게 될 숫자와 어긋나지 않는다.
 *
 * 두 수가 같으면 null — "아이마다 다르다" 가 이 줄의 말인데 같은 숫자 둘은 그 반대를 말한다.
 */
export const homePageRegisterPreview = (stays: readonly { policy: TPetPolicy }[]): THomePageRegisterPreview | null => {
  if (stays.length === 0) return null;
  const byWeight = PREVIEW_WEIGHTS_KG.map((kg) => {
    const sample: TDogProfile = { dogs: [{ name: '예시', weightKg: kg }], carrier: 'none' };
    return { kg, ok: countByLevel(stays, sample).ok };
  });
  if (byWeight.every((w) => w.ok === byWeight[0].ok)) return null;
  return { total: stays.length, byWeight };
};

/** "숙소 26곳 중 7kg 아이는 18곳, 25kg 아이는 6곳 갈 수 있어요" */
export const homePageRegisterPreviewText = (preview: THomePageRegisterPreview): string =>
  `숙소 ${preview.total}곳 중 ${preview.byWeight.map((w) => `${w.kg}kg 아이는 ${w.ok}곳`).join(', ')} 갈 수 있어요`;
