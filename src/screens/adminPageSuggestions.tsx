'use client';

import { Button } from '../components/base/button';
import { NaverLinkButton } from '../components/naverLinkButton';
import { reportDay, suggestionSearchName, type TReportRow } from '../lib/adminReports';
import { naverMapSearchUrl } from '../lib/naverPlaceLink';

type TAdminPageSuggestionsProps = {
  suggestions: TReportRow[];
  /** 지금 쓰는 중인 제안 id. */
  busyId?: string;
  onClose: (row: TReportRow, status: 'handled' | 'dismissed') => void;
};

/**
 * 사용자가 알려 준 곳(장소 제안, docs/todo/10 F8) — 수집 완료 칸 아래.
 *
 * 여기서 장소를 만들지 않는다. 동반 근거는 **글**이 있어야 하고(ADR-017 — 조건은 원문에서 뽑는다), 사용자의 한 줄은 근거가 아니라 단서다.
 * 운영자는 이름으로 네이버를 찾아보고, 블로그 글이 있으면 그 이름을 수집 키워드로 돌린다 — ADR-019 결정 7(업체명 블로그 재검색)이 생기면 그 큐로 넘긴다.
 * 그래서 버튼은 `찾아봤어요`(handled) · `아니에요`(dismissed) 둘뿐이다.
 */
export function AdminPageSuggestions({ suggestions, busyId, onClose }: TAdminPageSuggestionsProps) {
  if (suggestions.length === 0) return null;
  return (
    <section className="mt-6 px-4 md:px-6" aria-labelledby="admin-suggestions-title">
      <h2 id="admin-suggestions-title" className="text-sm font-bold text-primary">
        사용자가 알려 준 곳 {suggestions.length}
      </h2>
      <p className="mt-0.5 text-xs text-tertiary">
        이름으로 찾아보고, 블로그 글이 있으면 그 이름으로 수집해요(<code>pnpm data collect</code>). 한 줄은 근거가 아니라 단서예요.
      </p>
      <ul className="mt-2 divide-y divide-secondary rounded-xl border border-secondary bg-primary">
        {suggestions.map((row) => {
          const name = row.note ?? '';
          const busy = busyId === row.id;
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 text-secondary">{name}</span>
              <span className="text-quaternary">{reportDay(row.created_at)}</span>
              <NaverLinkButton href={naverMapSearchUrl(suggestionSearchName(name))}>네이버에서 찾기</NaverLinkButton>
              <Button color="secondary" size="sm" isDisabled={Boolean(busyId)} isLoading={busy} onClick={() => onClose(row, 'handled')}>
                찾아봤어요
              </Button>
              <Button color="link-gray" size="sm" isDisabled={Boolean(busyId)} onClick={() => onClose(row, 'dismissed')}>
                아니에요
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
