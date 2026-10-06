/** 접을 만큼 겹쳤다고 볼 최소 곳 수. 두 곳이 같은 말을 하는 것은 목록을 훑는 데 방해가 안 된다. */
export const REPEATED_REASON_MIN = 3;

export type TRepeatedReason = { text: string; count: number };

/**
 * 목록 카드 대부분이 **같은 근거 문장**을 말하는가(14 W261006.5) — 식당 34곳 중 28~29곳이
 * "케이지 동반시에만 가능해요" 를 한 줄씩 되풀이해, 목록이 걸러 주는 게 없어 보였다(6/6).
 *
 * 그런 문장이 있으면 목록 머리가 **한 번** 말하고 카드는 그 줄을 뺀다 — 카드에는 판정 배지와
 * 원문 칩("케이지 필요")이 남아 등급과 이유의 갈래는 그대로 읽힌다. 문장이 다른 카드(야외만·전화 확인)는
 * 줄을 그대로 두어, **다른 것만 눈에 띄게** 된다.
 *
 * 접는 기준은 둘 다다: `REPEATED_REASON_MIN` 곳 이상, 그리고 목록의 과반. 과반이 아니면 머리의 한 줄이
 * "이 목록의 이야기" 가 아니라 여러 이유 중 하나일 뿐이라, 카드마다 읽는 편이 낫다.
 * 동점이면 먼저 나온 문장(목록 순서) — 정렬이 판정순이라 더 무거운 이유가 앞선다.
 *
 * @param reasons 카드마다의 첫 근거 문장(`primaryReason`). 근거가 없으면(갈 수 있어요) undefined.
 */
export const placesPageRepeatedReason = (reasons: readonly (string | undefined)[]): TRepeatedReason | null => {
  const counts = new Map<string, number>();
  for (const text of reasons) if (text !== undefined) counts.set(text, (counts.get(text) ?? 0) + 1);
  let best: TRepeatedReason | null = null;
  for (const [text, count] of counts) if (!best || count > best.count) best = { text, count };
  if (!best || best.count < REPEATED_REASON_MIN || best.count * 2 <= reasons.length) return null;
  return best;
};
