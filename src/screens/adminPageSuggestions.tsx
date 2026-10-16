'use client';

import { Button } from '../components/base/button';
import { NaverLinkButton } from '../components/naverLinkButton';
import { COLLECT_REQUESTS_UNAVAILABLE_TEXT, collectView, type TCollectRequestsLoad } from '../lib/adminCollectRequest';
import { reportDay, suggestionSearchName, type TReportRow } from '../lib/adminReports';
import { naverMapSearchUrl } from '../lib/naverPlaceLink';
import { cx } from '../utils/cx';

type TAdminPageSuggestionsProps = {
  suggestions: TReportRow[];
  /** 지금 쓰는 중인 제안과 그 일. */
  busy?: { id: string; what: 'close' | 'collect' };
  /** 추가 수집 요청 목록(검수 대기와 같은 것). 못 읽었으면 `이 이름으로 수집` 버튼이 안 선다 — 닫기는 그대로 된다. */
  collect?: TCollectRequestsLoad;
  onCollect: (name: string, row: TReportRow) => void;
  onClose: (row: TReportRow, status: 'handled' | 'dismissed') => void;
};

/**
 * 사용자가 알려 준 곳(장소 제안, docs/todo/10 F8) — **등록 완료 칸에서 `제보 있는 곳` 을 켜면 목록 위**(14 W261010.13).
 * 수집 완료 칸 맨 아래(약 5,900px)에 있던 동안 머리글 "열린 제보 9건 — 등록 완료 칸에서 봐요" 를 따라가면 6 만 보였다 — 사용자 말은 한곳에서 본다.
 *
 * 여기서 장소를 만들지 않는다. 동반 근거는 **글**이 있어야 하고(ADR-017 — 조건은 원문에서 뽑는다), 사용자의 한 줄은 근거가 아니라 단서다.
 * 운영자는 이름으로 네이버를 찾아보고, 그럴듯하면 `이 이름으로 수집` — 검수 대기의 추가 수집과 같은 표(`collect_requests`)에 후보 없이 한 줄을 넣어
 * 워커가 블로그를 찾고, 동반 근거가 있으면 다음 분석이 검수 대기에 후보로 세운다. 요청 줄이 이 줄에 서므로 결과를 보고 `찾아봤어요` 로 닫는다.
 */
export function AdminPageSuggestions({ suggestions, busy, collect, onCollect, onClose }: TAdminPageSuggestionsProps) {
  if (suggestions.length === 0) return null;
  return (
    <section className="mt-3 px-4 md:px-6" aria-labelledby="admin-suggestions-title">
      <h2 id="admin-suggestions-title" className="text-sm font-bold text-primary">
        사용자가 알려 준 곳 {suggestions.length}
      </h2>
      <p className="mt-0.5 text-xs text-tertiary">
        네이버에서 찾아보고 그럴듯하면 ‘이 이름으로 수집’ — 그 이름으로 블로그 글을 찾아, 동반 근거가 있으면 검수 대기에 후보로 올라와요.
        찾는 이름은 한 줄의 첫 쉼표·대시 앞이에요. 한 줄은 근거가 아니라 단서예요.
      </p>
      <ul className="mt-2 divide-y divide-secondary rounded-xl border border-secondary bg-primary">
        {suggestions.map((row) => {
          const note = row.note ?? '';
          const name = suggestionSearchName(note);
          const view = collectView(collect, { name });
          const closing = busy?.id === row.id && busy.what === 'close';
          const collecting = busy?.id === row.id && busy.what === 'collect';
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
              {/*
                * 이름 칸은 **0 이 아닌 최소 폭**(`min-w-48`)을 갖는다. `min-w-0 flex-1` 이던 동안 기준 폭이 0 이라 `flex-wrap` 이 버튼을
                * 다음 줄로 넘길 일이 없었고, 폰에서는 버튼 넷이 남긴 몇 px 에 문장이 한 글자씩 꺾였다(14 W261010.8 · parttime-17).
                * 사용자가 쓴 한 줄이라 공백 없는 주소도 온다 — `break-words` 로 칸 안에서 끊는다.
                */}
              <span className="min-w-48 flex-1 break-words text-secondary">{note}</span>
              <span className="text-quaternary">{reportDay(row.created_at)}</span>
              <NaverLinkButton href={naverMapSearchUrl(name)}>네이버에서 찾기</NaverLinkButton>
              {view && !view.queued ? (
                <Button
                  color="secondary"
                  size="sm"
                  isDisabled={Boolean(busy) || view.unavailable}
                  isLoading={collecting}
                  onClick={() => onCollect(name, row)}
                >
                  이 이름으로 수집
                </Button>
              ) : null}
              <Button color="secondary" size="sm" isDisabled={Boolean(busy)} isLoading={closing} onClick={() => onClose(row, 'handled')}>
                찾아봤어요
              </Button>
              <Button color="link-gray" size="sm" isDisabled={Boolean(busy)} onClick={() => onClose(row, 'dismissed')}>
                아니에요
              </Button>
              {/* 요청이 있으면 그 상태 — 검수 대기 카드와 같은 문장(`collectRequestLine`). 줄 전체 폭으로 버튼 밑에. 표가 없으면 왜 꺼졌는지. */}
              {view?.line ? <span className={cx('basis-full', view.queued ? 'text-tertiary' : 'text-secondary')}>{view.line}</span> : null}
              {view?.unavailable ? <span className="basis-full text-tertiary">{COLLECT_REQUESTS_UNAVAILABLE_TEXT}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
