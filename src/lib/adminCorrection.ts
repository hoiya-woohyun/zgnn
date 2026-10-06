/**
 * 보정이 뺀 AI 판단을 **원문의 어느 말과 대 봤는지**(06 G) — 펼친 카드의 동반 조건 원문 인용에 칠할 구간과, 보정 줄마다
 * 붙일 한마디를 정한다. 무엇을 칠할지의 정규식은 `CORRECTION_CUES`(petPolicyFacts.mjs) 하나가 정본이다.
 *
 * 근거 단어 판단을 뺐다는 것은 그 말이 원문에 **없다**는 뜻이라 칠할 것이 0개다. 그때 칠하지 않은 인용만 남으면
 * "원문에 문제가 없다" 로 읽히므로 줄이 `원문에 없는 말: 대형` 을 글로 적는다. 숫자는 원문에 실제로 있는 숫자를 칠한다.
 */

import { CORRECTION_CUES, type TCorrectionDrop } from '../../scripts/lib/petPolicyFacts.mjs';
import { spansOf, type TTextRange, type TTextSpan } from './textSpans';

export type TCorrectionLine = {
  note: string;
  /** 원문에서 칠한 말(중복 제거, 나온 순). 비었으면 `missing` 이 원문에 없는 말을 말한다. */
  found: string[];
  missing: string | null;
};

export type TCorrectionView = { spans: TTextSpan[]; lines: TCorrectionLine[] };

/** 원문의 모든 자리 — `lastIndex` 가 남지 않게 매번 새로 만든다. */
function matchesOf(text: string, pattern: RegExp): TTextRange[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))]
    .filter((match) => match[0].length > 0)
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

export function correctionView(text: string | null | undefined, dropped: readonly TCorrectionDrop[]): TCorrectionView {
  const source = text ?? '';
  const ranges: TTextRange[] = [];
  const lines = dropped.map(({ note, cue }): TCorrectionLine => {
    const rule = CORRECTION_CUES[cue];
    const hits = rule ? matchesOf(source, rule.near) : [];
    ranges.push(...hits);
    const found = [...new Set(hits.map(({ start, end }) => source.slice(start, end)))];
    return { note, found, missing: found.length || !rule ? null : rule.words };
  });
  return { spans: spansOf(source, ranges), lines };
}
