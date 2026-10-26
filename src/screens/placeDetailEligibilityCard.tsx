import type { ReactNode } from 'react';
import Link from 'next/link';
import { MessageAlertSquare } from '@untitledui/icons';
import { Button } from '../components/base/button';
import { feeUnitNote } from '../lib/dogFee';
import { dogSubsetLead, dogSubsetWhatIf } from '../lib/dogSubsetWhatIf';
import { headlineFor, verdictFor } from '../lib/eligibility';
import { needsIndoorChangedLevel } from '../lib/needsIndoorWhatIf';
import type { TPlaceEntry } from '../lib/places';
import { useAppStore, useDog } from '../store/useAppStore';
import { verdictTone, VERDICT_TEXT_CLASS } from '../lib/verdictLine';
import { useEligibility } from '../store/useDogEligibility';
import { CARD_SURFACE } from '../components/cardSurface';

/**
 * 상세 화면의 판정 카드. 원문 카드("반려동물 이용") 바로 위에 얹는다.
 *
 * 머리글은 "악동이는 갈 수 있어요" 처럼 애칭 + 은/는 + 판정으로 읽힌다(`verdictFor`) — 근거가 하나뿐이면
 * 근거를 따르는 규칙, 정보 없음(unknown)이면 이름을 빼고 장소를 주어로 삼는 규칙이 lib 에 있어 테스트로 묶인다.
 * unknown 의 U1 근거("동반 조건이 적혀 있지 않아요")는 머리글과 같은 말이라 목록에서 뺀다.
 *
 * 강아지가 없으면 강제 등록 없이 조용한 배너 한 줄만(2026-09-15 리뷰 §1② — 첫 진입 강제
 * 등록은 이탈). 있으면 판정 글자색 머리글 + 근거(심각도순, `useEligibility` 가 이미 정렬해 준다).
 * 요금(`I1`)은 판정 근거가 아니라 참고 정보라 아래에 작게 따로 둔다. 같은 info 라도 몸무게 문턱(`I2`)은 근거 목록에 선다.
 *
 * **근거(`evidence`)는 따로 상자를 갖지 않고 이 면 안에 구분선으로 딸린다**(ADR-003 v15). 예전에는 판정·원문이
 * 같은 모양의 상자 둘로 쌓여 답과 근거가 같은 무게로 보였다. 강아지가 없으면 답이 없으므로 근거가 혼자 면을 갖는다.
 * 근거의 이름표(`evidenceLabel`)는 원문을 그리는 곳만 「원문」 이다 — 블로그 출처는 원문 대신 정리한 문장을 그린다(21 S5).
 */
export function PlaceDetailEligibilityCard({
  place,
  evidenceLabel,
  evidence,
  onReportVerdict,
}: {
  place: TPlaceEntry;
  evidenceLabel: string;
  evidence: ReactNode;
  /** 카드 바로 밑 '판정이 틀렸어요' 를 누르면 — 판정이 있을 때만 그린다(14 W261010.29a). */
  onReportVerdict?: () => void;
}) {
  const dog = useDog();
  const eligibility = useEligibility(place);
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const setNeedsIndoor = useAppStore((state) => state.setNeedsIndoor);

  if (!dog || !eligibility) {
    return (
      <>
        <Link
          href="/dog"
          className="mb-3 flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-secondary bg-secondary px-4 py-3 text-sm font-semibold text-secondary transition-colors hover:bg-tertiary"
        >
          우리 강아지를 등록하면 여기서 갈 수 있는지 바로 알려 드려요
          <span aria-hidden="true" className="text-tertiary">
            ›
          </span>
        </Link>
        <div className={`${CARD_SURFACE} p-4`}>{evidence}</div>
      </>
    );
  }

  // 몸무게 문턱(I2)은 info 지만 근거 목록에 선다 — 카드·지도 시트의 이유 줄(`primaryReason`)과 같은 말이다(14 W261010.33r).
  const mainReasons = eligibility.reasons.filter((r) => r.rule !== 'I1' && r.rule !== 'U1');
  // 다두 what-if(10 F11) — 어려움일 때만, 가장 많이 데려갈 수 있는 조합(누구로도 되면 "… 중 한 마리만", 14 W261019.9). 판정을 다시 돌릴 뿐 규칙을 새로 쓰지 않는다.
  const subset = dogSubsetWhatIf(dog, place.policy, eligibility, { needsIndoor });
  const infoReasons = eligibility.reasons.filter((r) => r.rule === 'I1');
  // 요금이 1박마다인지 원문이 말하지 않으면 한 줄 밑에 그렇다고 적는다(08 T5.1). 카드엔 붙이지 않는다 — 숙소 거의 전부라 소음이다.
  const feeNote = feeUnitNote(place.type, place.feeUnitStated, place.policy, eligibility.fee);
  /*
   * '실내 자리 필요' 는 식당·카페 목록에서만 보이는 전역 값이라, 켜 둔 걸 잊으면 판정이 이유 없이 달라진다(12 U0.3).
   * 그 값이 **등급을 바꾼 곳**에서만 말한다 — 등급이 같으면 소음이다. 끄면 이 화면과 목록·지도·홈이 함께 바뀐다.
   */
  const indoorChanged = needsIndoorChangedLevel(dog, place.policy, eligibility, needsIndoor);

  return (
    <>
      <div className={CARD_SURFACE} data-ev="detail.verdict">
        <div className="p-4">
          {/*
           * 판정 문장은 상세에서 가장 큰 본문 글자다 — 절 제목(text-lg)·1박 요금(text-lg)보다 크다. 이 화면이 답하는 것이 이것이다.
           * 앞의 레벨 색 점을 걷고 문장을 판정 글자색으로 칠한다 — 목록·근처·지도와 같은 색 표(`VERDICT_TEXT_CLASS`, 22 G3.0).
           * 야외 자리만 되는 곳은 '갈 수 있어요' 색이다(목록의 '갈 수 있어요 · 야외 자리만').
           */}
          <p className={`text-xl font-bold ${VERDICT_TEXT_CLASS[verdictTone(eligibility)]}`}>
            {verdictFor(dog.dogs.map((d) => d.name), eligibility)}
          </p>

          {mainReasons.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {mainReasons.map((reason, index) => (
                <li key={index} className="flex gap-1.5 text-sm text-secondary">
                  <span aria-hidden="true" className="text-tertiary">
                    ·
                  </span>
                  {reason.text}
                </li>
              ))}
            </ul>
          )}

          {indoorChanged && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-tertiary">
              실내 자리 필요로 설정돼 있어요
              <Button color="link-color" size="sm" className="min-h-11" onClick={() => setNeedsIndoor(false)}>
                끄기
              </Button>
            </p>
          )}

          {subset && (
            <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary">
              {dogSubsetLead(subset, dog.dogs.map((d) => d.name))} {headlineFor(subset.eligibility)}
            </p>
          )}

          {infoReasons.length > 0 && (
            <p className="mt-2 text-sm text-tertiary">{infoReasons.map((reason) => reason.text).join(' · ')}</p>
          )}
          {feeNote && <p className="mt-0.5 text-xs text-tertiary">{feeNote}</p>}
        </div>

        {/* 근거 — 판정과 같은 면, 구분선 아래. 이름표가 있어야 판정의 "원문을 확인해 주세요"(C7)가 가리키는 곳이 보인다. */}
        <div className="border-t border-secondary p-4">
          <p className="mb-2 text-xs font-semibold text-tertiary">{evidenceLabel}</p>
          {evidence}
        </div>
      </div>
      {/*
        판정이 틀렸다는 말은 판정을 읽는 **그 자리**에서 나온다(14 W261010.29a) — 상세 맨 아래 '다녀오셨나요?' 는 2018px 아래라
        화가 났을 때 못 찾았다(ferry-13 · tremor). 등급은 가리지 않는다 — 틀린 '갈 수 있어요' 가 가장 비싸다(헛걸음).
        카드 **밖**이다: 판정과 근거 사이에 끼우면 근거가 같은 면에 딸리는 짜임이 깨진다(ADR-003 v15). 조용한 회색 링크라
        첫 화면의 말이 되지 않는다. 밑의 준비물 줄과는 16px 띄운다(상세 쪽 `mt-4`, 7a 의 교훈).
      */}
      {onReportVerdict && (
        <div className="mt-1 flex justify-end">
          <Button
            color="link-gray"
            size="sm"
            iconLeading={MessageAlertSquare}
            className="min-h-11 px-1"
            onClick={onReportVerdict}
          >
            판정이 틀렸어요
          </Button>
        </div>
      )}
    </>
  );
}
