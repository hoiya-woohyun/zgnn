'use client';

import { Badge } from '../components/base/badges';

/**
 * 검수 화면의 **두 목소리** — 블로그에서 수집한 원문과 AI 가 정리한 값(2026-09-30).
 *
 * 펼친 줄에서 이 둘이 같은 회색 글자로 섞여 있어 "어디까지가 블로그에 적힌 말이고 어디부터가 AI 가 쓴 말인가" 가 안 읽혔다
 * (사용자 지적). 그래서 **바탕색 하나와 칩 하나**를 목소리마다 정하고, 비교표·블로그 글·전후 목록이 전부 이 표를 쓴다.
 * 자리마다 색을 따로 적으면 한 곳만 바뀌어 같은 목소리가 두 색이 된다 — 그러면 색이 뜻을 잃는다.
 *
 * - 블로그 원문 = **흰 종이**(`bg-primary`). 사람이 쓴 글을 그대로 옮긴 것.
 * - AI 정리 = **옅은 하늘색**(`utility-sky`). 분홍(주 버튼)·노랑(주의)·초록(확인)·파랑(`신규` 뱃지)과 겹치지 않아
 *   "이건 기계가 만든 값이다" 외의 뜻을 싣지 않는다. 승인하면 사이트에 나갈 값이 전부 이쪽이다.
 *   ⚠️ `indigo` 를 쓰지 않는다 — 이 팔레트는 indigo 를 산호색으로 바꿔 두어(`theme.css`) 분홍 주 버튼과 같은 계열로 보인다.
 */
export const SOURCE_TONE = {
  blog: { surface: 'bg-primary', border: 'border-secondary', label: '블로그 원문', badge: 'gray' },
  ai: { surface: 'bg-utility-sky-50', border: 'border-utility-sky-200', label: 'AI 정리', badge: 'sky' },
} as const;

export type TSource = keyof typeof SOURCE_TONE;

/** 목소리 칩 — 영역 머리에 붙어 "여기부터 누구의 말" 을 말한다. */
export function AdminSourceChip({ source, suffix }: { source: TSource; suffix?: string }) {
  const tone = SOURCE_TONE[source];
  return (
    <Badge type="color" size="sm" color={tone.badge}>
      {tone.label}
      {suffix ? ` · ${suffix}` : ''}
    </Badge>
  );
}
