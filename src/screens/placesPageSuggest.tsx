'use client';

import { useState } from 'react';
import { ReportSheet } from '../components/reportSheet';
import { TYPE_META } from '../lib/places';
import type { TPlaceType } from '../types';

/**
 * 목록 맨 아래 "여기도 강아지랑 갈 수 있어요" — 장소 제안(docs/todo/10 F8, 민지 "다른 카페에서 반려견을 봤는데 알려 줄 길이 없다").
 *
 * 운영자는 블로그만 긁는다(ADR-019) — 블로그를 쓸 생각이 없는 사람의 "되던데요" 는 지금까지 어디에도 닿지 않았다.
 * 받은 이름은 `/admin` 의 수집 완료 칸에 쌓이고, 운영자가 그 이름으로 블로그를 찾아 수집한다(재검색 큐가 생기면 그리로).
 * 장소 id 가 없는 유일한 제보라 하루 한도를 걸지 않는다(`canReportNow`).
 *
 * 스와이프 엿보기(`placesPageSwipePeek`)가 그리는 목록(`PlacesPageResults`) 밖에 둔다 — 안에 두면 시트가 두 벌 생긴다.
 */
export function PlacesPageSuggest({ type }: { type: TPlaceType }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-8 px-4 text-center md:px-6">
      <p className="text-sm text-tertiary">여기 없는 {TYPE_META[type].label}에서도 강아지와 함께했나요?</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-secondary underline underline-offset-2"
      >
        여기도 갈 수 있어요 — 알려 주기
      </button>
      <ReportSheet
        isOpen={open}
        onOpenChange={setOpen}
        title="여기도 강아지랑 갈 수 있어요"
        lead="가게 이름과 동네를 적어 주세요. 운영자가 찾아보고 확인되면 올릴게요."
        placeId={null}
        kinds={['suggest']}
        noteRequired
        notePlaceholder="예: 카페 바당, 애월읍"
      />
    </div>
  );
}
