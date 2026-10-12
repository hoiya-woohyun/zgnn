/**
 * 122곳 × 강아지 5마리(`DOG_PROFILES`) × 실내 자리 필요 두 값의 판정 스냅숏(21 S8 준비) — 정책·배지·근거 칸·환경·판정·요금 단위까지.
 * 판정 입력을 어디서 만드느냐(런타임 ↔ 빌드)를 옮겨도 사용자가 보는 답이 그대로인지 이 파일 하나가 본다.
 *
 * `pnpm data pull`·판정 규칙 변경 때마다 바뀐다 → `pnpm test -u` 후 diff 를 커밋 메모에 요약한다.
 * 비공개 행 원문은 여기 들어가지 않는다(PUBLIC 레포) — `placesVerdictView` 가 인용·근거 문장을 뺀다.
 */

import { describe, expect, it } from 'vitest';

import { PLACES } from './places';
import { placesVerdictView } from './placesVerdictView';

describe('판정 스냅숏(122곳)', () => {
  it('장소마다 정책·배지·근거 칸·판정이 얼린 값과 같다', async () => {
    const text = [...PLACES]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(placesVerdictView)
      .join('\n\n');
    await expect(`${text}\n`).toMatchFileSnapshot('./__snapshots__/placesVerdicts.txt');
  });
});
