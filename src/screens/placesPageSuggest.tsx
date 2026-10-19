'use client';

import { ReportSheet } from '../components/reportSheet';
import { suggestTraceText } from '../lib/placeReport';
import { TYPE_META } from '../lib/places';
import type { TPlaceType } from '../types';

/**
 * 목록 맨 아래 "여기도 강아지랑 갈 수 있어요" — 장소 제안(docs/todo/10 F8, 민지 "다른 카페에서 반려견을 봤는데 알려 줄 길이 없다").
 *
 * 운영자는 블로그만 긁는다(ADR-019) — 블로그를 쓸 생각이 없는 사람의 "되던데요" 는 지금까지 어디에도 닿지 않았다.
 * 받은 이름은 `/admin` 등록 완료 칸의 `제보 있는 곳` 위 제안 목록에 쌓이고, 운영자가 `이 이름으로 수집` 으로 그 이름의 블로그 수집을 건다
 * (검수 대기 추가 수집과 같은 `collect_requests` — 14 W261010.13).
 * 장소 id 가 없는 유일한 제보라 하루 한도를 걸지 않는다(`canReportNow`).
 *
 * 스와이프 엿보기(`placesPageSwipePeek`)가 그리는 목록(`PlacesPageResults`) 밖에 둔다 — 안에 두면 시트가 두 벌 생긴다.
 *
 * 열림은 위(`placesPage`)가 쥔다 — 검색만으로 0곳일 때 빈 상태의 "알려 주기" 버튼(`PlacesPageResults.onSuggest`)도 같은 시트를 열어야 하는데,
 * 시트를 결과 안에 두면 엿보기와 두 벌이 된다.
 *
 * 방금 친 검색어를 한 줄 칸에 미리 채운다 — 찾다가 없어서 누른 사람이 같은 이름을 두 번 치지 않게(14 W261007.19).
 *
 * 보낸 뒤에는 이 자리가 "알려 주셨어요 — ‘…’" 와 '한 곳 더 알려 주기' 로 바뀐다(14 W261019.16) — 토스트가 걷히면 화면이 보내기 전과 같아
 * 또 누를 것 같았다(haeun-18b). 보낸 이름은 위(`placesPage`)가 쥔다 — 0곳 안내도 같은 값으로 '알려 주기' 를 거둔다.
 */
export function PlacesPageSuggest({
  type,
  query = '',
  open,
  onOpenChange,
  sentName,
  onSent,
}: {
  type: TPlaceType;
  query?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 이 화면에서 마지막으로 알려 준 이름. */
  sentName?: string;
  onSent?: (name: string) => void;
}) {
  return (
    <div className="mt-8 px-4 text-center md:px-6">
      <p className="text-sm text-tertiary">
        {sentName ? suggestTraceText(sentName) : `여기 없는 ${TYPE_META[type].label}에서도 강아지와 함께했나요?`}
      </p>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        data-ev="places.suggest"
        className="mt-1 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-secondary underline underline-offset-2"
      >
        {sentName ? '한 곳 더 알려 주기' : '여기도 갈 수 있어요 — 알려 주기'}
      </button>
      <ReportSheet
        isOpen={open}
        onOpenChange={onOpenChange}
        title="여기도 강아지랑 갈 수 있어요"
        lead="가게 이름과 동네를 적어 주세요. 운영자가 찾아보고 확인되면 올릴게요."
        placeId={null}
        kinds={['suggest']}
        noteRequired
        notePlaceholder="예: 카페 바당, 애월읍"
        initialNote={query}
        onSent={(row) => onSent?.(row.note ?? '')}
      />
    </div>
  );
}
