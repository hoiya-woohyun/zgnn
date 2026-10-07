import type { TCandidateGroup } from './adminCandidates';

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * 접힌 줄에 세울 **블로그 인용 한 줄**(todo/09 T6.6).
 *
 * 접힌 줄의 이름·지역·칩·요약은 전부 AI 가 낸 값이라, 운영자는 "글이 정말 그렇게 말했나" 를 보려고 매 줄을 펼쳤다.
 * 사람이 쓴 문장 한 조각을 줄에 남겨 펼치지 않고도 판단의 절반이 서게 한다. 화면은 한 줄로 자르므로(`truncate`) 길이는 신경 쓰지 않는다.
 *
 * **조건 문장이 먼저**다 — 검수의 핵심은 "사이트에 나갈 동반 조건이 맞나" 이고, 바로 옆 칸이 그 조건(AI 해석)이라 둘을 눈으로 맞춘다.
 * 조건 문장이 없는 줄(칩 칸이 "조건 문장 없음")은 본문 인용이 대신한다 — 강아지가 정말 갔다는 정황이라도 보이게.
 * 대표 글(`lead`)을 먼저, 없으면 같은 가게로 묶인 다른 글을 훑는다. 둘 다 없으면 `null` — 화면은 그 줄을 안 그린다.
 */
export function groupQuote(group: TCandidateGroup): string | null {
  const policy = squash(group.lead.extracted.petPolicyText ?? '');
  if (policy) return policy;
  for (const row of [group.lead, ...group.rows]) {
    const quote = (row.extracted.evidence ?? []).map(squash).find(Boolean);
    if (quote) return quote;
  }
  return null;
}
