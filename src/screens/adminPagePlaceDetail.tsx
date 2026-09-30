'use client';

import type { ReactNode } from 'react';
import { NaverLinkButton } from '../components/naverLinkButton';
import type { TPlaceRow } from '../lib/adminCandidates';
import { noteHistory, PLACE_STATUS_LABEL } from '../lib/adminPlaces';
import { naverMapSearchUrl, naverPlacePhotoUrl } from '../lib/naverPlaceLink';
import type { TPetBadge } from '../lib/petPolicy';
import { cx } from '../utils/cx';
import { ADMIN_PANEL_DIVIDER, ADMIN_POLICY_TONE } from './adminTable';

/**
 * '올린 장소' 한 줄의 펼친 상세 — **지금 사이트에 나가 있는 값을 전부** 한 판에 보여 준다. 읽기만 한다.
 *
 * 후보 상세(`adminPageGroupDetail`)처럼 원문 ↔ AI 비교표로 짜지 않는다. 이미 올라간 곳에는 견줄 두 값이 없고,
 * 여기서 하는 일은 "이 가게 정보가 아직 맞나 · 내려야 하나" 를 정하는 것이라 필요한 것은 **값 하나씩과 그 출처로 가는 링크**다.
 *
 * 빈 칸을 숨기지 않고 `없음` 으로 적는다 — 빠진 것을 찾는 것이 이 판을 여는 이유 중 하나라서다.
 * 숙소 칸(가격·편의)만 숙소일 때 나온다(다른 종류에는 원래 없는 칸이다).
 */
export function AdminPagePlaceDetail({ place, badges }: { place: TPlaceRow; badges: TPetBadge[] }) {
  const history = noteHistory(place.archive_note);
  const hasGeo = place.lat != null && place.lng != null;
  /* 사이트 상세와 같은 우선순위 — 링크가 있으면 그것, 없으면 플레이스 id 로 만든 주소(`naverPlaceLink.ts`). */
  const naverHref = place.naver_url || naverPlacePhotoUrl(place.naver_place_id ?? undefined);

  return (
    <div className={cx(ADMIN_PANEL_DIVIDER, 'px-4 py-3')}>
      <dl className="grid gap-x-4 gap-y-2 text-xs md:grid-cols-[7rem_minmax(0,1fr)]">
        <Field label="동반 조건 원문">
          {place.pet_policy_text ? (
            <span className="whitespace-pre-line text-secondary">{place.pet_policy_text}</span>
          ) : (
            <Empty />
          )}
        </Field>
        <Field label="사이트 배지">
          <span className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span key={badge.label} className={cx('rounded px-1.5 py-px font-medium', ADMIN_POLICY_TONE[badge.tone])}>
                {badge.label}
              </span>
            ))}
          </span>
        </Field>
        <Field label="소개">{place.features ? <span className="text-secondary">{place.features}</span> : <Empty />}</Field>
        {place.type === 'stay' && (
          <>
            <Field label="숙소 가격">{place.stay_price_text || <Empty />}</Field>
            <Field label="숙소 편의">{place.stay_amenities_text || <Empty />}</Field>
          </>
        )}
        <Field label="지역">{place.region_raw || <Empty />}</Field>
        <Field label="주소">{place.address || <Empty />}</Field>
        <Field label="좌표">
          {hasGeo ? (
            `${place.lat}, ${place.lng}`
          ) : (
            <span className="text-warning-primary">없음 — 지도에 핀이 안 서요</span>
          )}
        </Field>
        <Field label="카테고리">{place.category || <Empty />}</Field>
        <Field label="링크">
          <span className="flex flex-wrap items-center gap-2">
            {place.status === 'published' && (
              <a href={`/place/${place.id}/`} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
                사이트 상세
              </a>
            )}
            {place.review_url && (
              <a href={place.review_url} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
                후기 원글
              </a>
            )}
            {place.homepage_url && (
              <a href={place.homepage_url} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
                홈페이지{place.homepage_name ? ` · ${place.homepage_name}` : ''}
              </a>
            )}
            {naverHref ? (
              <NaverLinkButton href={naverHref}>네이버</NaverLinkButton>
            ) : (
              /* 빠진 링크를 채우러 갈 곳 — 후보 편집의 '네이버에서 찾기' 와 같은 검색 주소다. */
              <a href={naverMapSearchUrl(place.name)} target="_blank" rel="noopener noreferrer" className="text-warning-primary underline">
                네이버 링크 없음 · 네이버에서 찾기
              </a>
            )}
          </span>
        </Field>
        <Field label="상태">
          {PLACE_STATUS_LABEL[place.status]} · 출처 {place.source}
        </Field>
        <Field label="상태 기록">
          {history.length ? (
            <ol className="flex flex-col gap-0.5">
              {history.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ol>
          ) : (
            <span className="text-quaternary">내리거나 되살린 적 없어요</span>
          )}
        </Field>
      </dl>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-tertiary max-md:mt-1">{label}</dt>
      <dd className="min-w-0 break-words text-tertiary">{children}</dd>
    </>
  );
}

function Empty() {
  return <span className="text-quaternary">없음</span>;
}
