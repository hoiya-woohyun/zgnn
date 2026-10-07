/**
 * 저장 목록을 통째로 보내는 링크(07 P1 · 10 F10) — `/saved/?ids=a,b,c`.
 *
 * 서버가 없어 목록을 어디 맡길 수 없으니 **id 를 주소에 그대로 싣는다.** 받는 쪽은 그 id 로 빌드에 묶인 장소를 찾아 읽기 전용으로 보여 주고,
 * "내 저장에 담기" 로 자기 목록에 합친다. 메모는 싣지 않는다 — 사적인 한 줄이다(10 F5).
 *
 * id 는 줄이지 않고 전부 싣는다. 앞뒤 몇 자로 줄이면 링크는 짧아지지만, 보낸 사람과 받는 사람의 빌드가 다를 수 있어(장소가 늘어난다)
 * 언젠가 다른 곳을 가리킨다. 틀린 장소를 보여 주는 것보다 긴 링크가 낫다.
 */

/** 공유 링크. 쉼표는 이스케이프하지 않는다 — `URLSearchParams` 로 만들면 `%2C` 가 되어 링크가 길어진다(읽을 때는 둘 다 받는다). */
export const sharedSavedUrl = (origin: string, ids: readonly string[]): string =>
  `${origin}/saved/?ids=${ids.map(encodeURIComponent).join(',')}`;

export type TSharedIds = {
  /** 지금 데이터에 있는 id, 보낸 순서 그대로 · 중복 없이. */
  ids: string[];
  /** 링크에는 있지만 지금 안내하지 않는 곳(내린 곳·다른 빌드)의 수. 받는 쪽에 "N곳은 빼고" 로 말한다. */
  unknownCount: number;
};

/**
 * `?ids=` 값을 읽는다. 값이 없거나 읽을 수 있는 id 가 하나도 없으면 `null` — 그때 화면은 그냥 내 목록이다.
 * 모르는 id 는 버리고 수만 센다: 퍼시스트에 URL 에서 온 쓰레기를 넣지 않기 위해서다(담기는 `ids` 만 받는다).
 */
export const parseSharedIds = (param: string | null, knownIds: ReadonlySet<string>): TSharedIds | null => {
  if (!param) return null;
  const seen = new Set<string>();
  const ids: string[] = [];
  let unknownCount = 0;
  for (const raw of param.split(',')) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (knownIds.has(id)) ids.push(id);
    else unknownCount += 1;
  }
  return ids.length > 0 || unknownCount > 0 ? { ids, unknownCount } : null;
};
