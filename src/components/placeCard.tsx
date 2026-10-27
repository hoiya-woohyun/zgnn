import Link from 'next/link';
import type { ReactNode } from 'react';
import { SaveButton } from './saveButton';
import { SavedNoteLine } from './savedNoteLine';
import { VerdictLine } from './verdictLine';
import { cardReasons, verdictHidesBadge, verdictLeadBadges } from '../lib/eligibility';
import { formatStayPrice } from '../lib/format';
import { freshnessShortLabel } from '../lib/placeFreshness';
import { placeMetaLine } from '../lib/placeMetaLine';
import type { TPlaceEntry } from '../lib/places';
import { useToday } from '../hooks/useToday';
import { useDogCount, useDogMaxWeightKg, useEligibility } from '../store/useDogEligibility';
import { cx } from '../utils/cx';

type TPlaceCardProps = {
  place: TPlaceEntry;
  /** 가까운 순일 때 내 위치에서의 거리(km). 있으면 종류 옆에 붙는다(10 F7). */
  distanceKm?: number;
  /**
   * 목록 머리가 이미 한 번 말한 근거 문장(`placesPageRepeatedReason`). 이 행의 근거가 그 문장과 같으면 줄을 뺀다 —
   * 식당 34곳 중 29곳이 같은 문장을 되풀이했다(14 W261006.5). 판정 글자와 원문 조건("케이지 필요")은 그대로 남는다.
   */
  hideReasonText?: string;
  /** 하트 **왼쪽**에 함께 서는 버튼(저장 화면의 메모 연필). 이름 줄 오른쪽 여백이 그만큼 넓어진다. */
  actions?: ReactNode;
  /**
   * 있으면 메모 줄 자리에 이것(입력 폼)을 그리고, 행은 그동안 **링크가 아니다** — 링크 안의 입력 칸은 누르는 것이
   * 상세로 가는 것이 된다(a 안의 input 도 HTML 위반). 닫히면 다시 링크다.
   */
  noteEditor?: ReactNode;
  /**
   * 행 **안** 오른쪽 아래, 마지막 줄(가격 또는 메타) 끝에 서는 것(저장 화면의 길찾기 S 버튼). 행이 링크라 그 안에 링크를 넣을 수 없어
   * 하트처럼 행 위에 겹쳐 세우고, 마지막 줄은 그만큼 오른쪽을 비우고 버튼 높이(h-8)를 바닥으로 갖는다.
   */
  cornerAction?: ReactNode;
  /** 행 **밖** 바로 밑 한 줄. 행은 링크라 그 안에 컨트롤을 못 넣는다. */
  footer?: ReactNode;
};

/**
 * 목록 행 — 둘러보기·저장 목록의 장소 한 곳. 면(흰 카드)·종류 아이콘 상자·소개 문단이 없다(22 G3.1 · design-audit B-2·B-5):
 * 한 장 224px 카드로는 390 한 화면에 2.5곳이었다. 행은 크림 위에 서고 구분선은 목록(`ul` 의 `divide-y`)이 긋는다.
 *
 * 줄 순서: 이름 + 하트 / (내 메모) / 판정 글자 · 원문 조건 / (왜 확인·어려움인지 한 줄) / '펜션 · 구좌읍 · 10월 확인' / 가격(숙소만).
 * 종류 탭 안 목록이라 종류는 메타 글자가 말한다 — 아이콘을 앞에 세우지 않는다(ADR-002 v9).
 * 우리 강아지 요금('두부는 1만원')은 따로 세우지 않는다 — 판정 줄의 요금 조건이 그 아이의 몸무게 구간으로 골라져 선다(`cardConditions`).
 *
 * 우리 강아지 프로필이 있으면(`useEligibility`) 판정 글자를 판정 줄 맨 앞에 얹고, 조건은 그만큼 줄인다.
 * 프로필이 없으면 이 훅은 null 을 돌려주므로 조건 글자만 선다.
 */
export function PlaceCard({ place, distanceKm, hideReasonText, actions, noteEditor, cornerAction, footer }: TPlaceCardProps) {
  const eligibility = useEligibility(place);
  // 목록 머리가 같은 문장을 이미 말했으면 행은 그 줄을 뺀다. 조건 거르기(`verdictHidesBadge`)도 **그린 줄**을 본다.
  const reasons = eligibility ? cardReasons(eligibility).filter((r) => r.text !== hideReasonText) : [];
  const weightKg = useDogMaxWeightKg();
  const dogCount = useDogCount();
  const verified = freshnessShortLabel(place, useToday());
  // 블로그에서 들어온 신규 숙소는 요금 원문이 비어 있을 수 있다 — 빈 굵은 줄을 그리지 않는다.
  const price = place.stay && place.stay.price.text !== '' ? formatStayPrice(place.stay.price) : undefined;
  // 오른쪽 아래 버튼(저장 화면의 길찾기)은 행의 마지막 줄과 한 줄에 선다 — 그 줄이 버튼 폭(`pr-25`)과 높이(h-8)를 비운다.
  // 비우는 폭은 '네이버 길찾기' S 버튼(아이콘 없이 390 에서 96px) + 간격 4px 다 — 버튼이 넓어지면 이 값도 같이 올린다.
  const cornerRoom = cornerAction ? 'flex min-h-8 items-center pr-25' : undefined;

  const body = (
    <>
      <p className={cx('text-md font-semibold text-primary', actions ? 'pr-22' : 'pr-9')}>{place.name}</p>

      {/* 내 메모는 이름 바로 밑 — 이 장소에 대한 내 표시라 판정보다 먼저. 저장 화면만이 아니라 행이 보이는 모든 자리에. */}
      {noteEditor ? <div className="mt-2">{noteEditor}</div> : <SavedNoteLine id={place.id} className="mt-2" />}

      {/* 판정 줄 — 판정 글자 + 원문 조건 글자 한 줄(22 G3.0). 조건은 판정과 반대로 읽히는 것을 빼고(14 W261013.1),
          어려움·확인 필요면 이유 줄과 같은 조건이 판정 바로 옆에 먼저 선다 — 그 자리의 칩은 이유로 읽힌다(14 W261027.1). */}
      <VerdictLine
        eligibility={eligibility}
        policy={place.policy}
        limit={eligibility ? 2 : 3}
        hide={eligibility ? verdictHidesBadge(eligibility, place.policy, reasons[0]) : undefined}
        lead={eligibility ? verdictLeadBadges(eligibility, place.policy) : undefined}
        weightKg={weightKg}
        dogCount={dogCount}
        className="mt-1"
      />

      {/* 왜 "확인"·"어려움" 인지 — 7곳을 다 눌러 봐야 알던 것을 목록에서 읽게(민준 N1). 판정을 정한 근거의 문장이다(`cardReasons`) —
          보통 한 줄, 어려움 근거가 둘이면 두 줄(무게도 마릿수도 넘는다, 14 W261027.1). 목록 머리가 같은 문장을 이미 말했으면 빼서,
          다른 이유를 가진 행만 줄이 남게 한다. */}
      {reasons.map((r) => (
        <p key={r.text} className="clamp-1 mt-0.5 text-sm text-tertiary">
          {r.text}
        </p>
      ))}

      {/* 메타는 색 없는 글자 한 줄 — 확인 날짜도 이 줄 끝(14 C2610.3 · 22 G3.0a). */}
      <p className={cx('mt-0.5 truncate text-sm text-tertiary', !price && cornerRoom)}>
        <span className="min-w-0 truncate">{placeMetaLine(place, { distanceKm, verified })}</span>
      </p>

      {/* brand-700 은 CTA 색이라 26개 숙소 가격이 전부 그 색이면 "눌러야 할 것"과 "읽을 것"이 섞인다(2026-09-15 디자인 리뷰 ①) — 본문 색 + bold. */}
      {price && <p className={cx('mt-1 text-md font-bold text-primary', cornerRoom)}>{price}</p>}
    </>
  );

  // 눌림 판은 좌우 8px 밖으로 나가고(-mx-2 · r8) 구분선은 판이 아니라 목록이 긋는다 — 판에 그으면 r8 모서리를 따라 선 끝이 휜다(22 G2.0a).
  const rowClass = '-mx-2 block rounded-lg px-2 py-4';
  return (
    <li data-ev="card">
      <div className="relative">
        {noteEditor ? (
          <div className={rowClass}>{body}</div>
        ) : (
          <Link href={`/place/${place.id}`} className={`${rowClass} transition-colors hover:bg-tertiary active:bg-tertiary`}>
            {body}
          </Link>
        )}

        {/* 하트는 이름 줄 오른쪽 끝 — 보이는 20px 의 오른쪽 끝이 글자 끝선에 맞게 44 칸을 12px 밖으로 뺀다.
            연필과 하트 사이 8px — 붙어 있으면 연필을 노리다 하트를 눌러 저장(과 메모)이 풀렸다(14 W261010.3). 이름 줄 여백(`pr-22`)도 그만큼 넓다.
            하트의 누르는 칸은 보이는 44px 보다 넓다(`before:`) — 위는 행 윗선까지, 아래는 이름 옆 빈 칸으로. 하트 둘레를
            빗나가면 행 링크라 상세가 열렸다(14 W261010.5). 연필이 있으면 왼쪽은 넓히지 않는다(위의 8px 를 지킨다). */}
        <div className="absolute top-1.5 -right-3 flex gap-2">
          {actions}
          <SaveButton
            id={place.id}
            name={place.name}
            className={cx(
              'before:absolute before:-top-1.5 before:right-0 before:-bottom-3 before:content-[""]',
              actions ? 'before:left-0' : 'before:-left-2',
            )}
          />
        </div>
        {cornerAction && <div className="absolute right-0 bottom-4">{cornerAction}</div>}
      </div>
      {footer}
    </li>
  );
}
