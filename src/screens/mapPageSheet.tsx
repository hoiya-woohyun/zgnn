import { NavigationPointer01 } from '@untitledui/icons';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { NaverLinkButton } from '../components/naverLinkButton';
import { PlaceItemsNote } from '../components/placeItemsNote';
import { PlaceTypeMark } from '../components/placeTypeMark';
import { SaveButton } from '../components/saveButton';
import { SavedNoteLine } from '../components/savedNoteLine';
import { VerdictText } from '../components/verdictLine';
import { InkButton } from '@/components/inkButton';
import { distanceLabel } from '../lib/distanceSort';
import { primaryReason } from '../lib/eligibility';
import { naverDirectionsUrl } from '../lib/naverPlaceLink';
import { freshnessShortLabel } from '../lib/placeFreshness';
import { placeMetaLine } from '../lib/placeMetaLine';
import { distanceKm, type TPlaceEntry } from '../lib/places';
import { useToday } from '../hooks/useToday';
import { useEligibility } from '../store/useDogEligibility';

type TMapPageSheetCardProps = {
  place: TPlaceEntry;
  /** '내 위치' 로 받은 좌표. 있으면 주소 줄 앞에 거리를 붙인다(둘러보기 '가까운 순' 카드와 같은 표기). 지도 화면 state 에만 있다. */
  origin?: { lat: number; lng: number } | null;
  /**
   * 이 카드를 품은 시트(`role="dialog"`)의 높이를 알린다 — 지도가 고른 핀을 시트 밑에서 꺼내려고 쓴다(14 W261019.14a).
   * 시트는 포털이라 지도 화면이 직접 못 잰다. 카드가 사라지면 0. 높이는 레이아웃 높이라 올라오는 애니메이션에 흔들리지 않는다.
   */
  onSheetHeight?: (height: number) => void;
};

/**
 * 지도에서 고른 장소의 미니 카드.
 *
 * 모바일에서는 하단 시트 안에, 데스크톱에서는 좌측 결과 패널 아래에 같은 카드가 들어간다.
 * 두 곳이 같은 컴포넌트를 쓰는 이유는, 화면 폭에 따라 보이는 정보가 달라지면
 * "지도에서 고른 것" 과 "목록에서 고른 것" 이 다른 장소처럼 느껴지기 때문이다.
 *
 * 닫기 버튼은 여기 없다 — 시트 껍데기(BottomSheet)가 자기 닫기 버튼을 갖고 있고,
 * 데스크톱 패널에는 닫을 것이 없다.
 *
 * **훑어보는 카드다 — 판정·거리·주소·길찾기만**(14 W261013.6). 마커 하나에 시트가 화면 3/4~80% 를 덮었고 그 대부분이
 * 준비물 칩 7개였다(도넛 카페에도 기저귀) — 지도를 보려고 연 것인데 지도가 안 보였다. 그래서 목록 카드와 일부러 갈린다:
 * 소개 두 줄과 조건 칩은 상세의 몫으로 넘기고(대표 근거 한 줄 `primaryReason` 은 목록과 같은 말로 남긴다 — 12 U1.7),
 * 목록 카드엔 없는 주소·거리를 더하고, 준비물은 머리 줄로 접는다. 데스크톱 패널도 같은 카드라 고른 카드가 패널 절반을 먹던 것이 함께 준다(ADR-008 v24).
 */
export function MapPageSheetCard({ place, origin, onSheetHeight }: TMapPageSheetCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = rootRef.current?.closest('[role="dialog"]');
    if (!onSheetHeight || !(dialog instanceof HTMLElement)) return;
    const report = () => onSheetHeight(dialog.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(dialog);
    return () => {
      observer.disconnect();
      onSheetHeight(0);
    };
  }, [onSheetHeight]);

  const eligibility = useEligibility(place);
  const reason = eligibility ? primaryReason(eligibility) : undefined;
  const verified = freshnessShortLabel(place, useToday());
  const directions = naverDirectionsUrl(place);
  const distance = origin && place.geo ? distanceLabel(distanceKm(origin, place.geo)) : null;
  // 주소가 없는 곳(8곳)은 비었다고 말한다 — 다른 카드엔 다 있는 줄이 말없이 빠지면 "여기만 왜" 가 된다(14 W261013.7).
  const address = place.address || '주소는 아직 확인하지 못했어요';

  return (
    /*
     * `data-focus-return` — 셸이 이 안의 링크도 "연 링크" 로 적고 돌아와 다시 찾는다(`appShellFocus`, 14 W261019.15b). 모바일 시트는 body 로
     * 포털해 `<main>` 밖이라, 표지가 없으면 상세에서 뒤로 온 포커스가 h1 '지도' 로 갔다. 데스크톱 패널(`<main>` 안)에선 아무 일도 안 한다.
     */
    <div ref={rootRef} data-focus-return="">
      <Link href={`/place/${place.id}`} className="block">
        <div className="min-w-0 pr-8">
          {/* 종류는 이름 앞 16px 선 아이콘 하나(22 G3.1b) — 44px 색 상자는 걷었다. */}
          <p className="flex items-start gap-1.5 text-md font-semibold text-primary">
            <PlaceTypeMark type={place.type} className="mt-1" />
            <span className="min-w-0">{place.name}</span>
          </p>
        </div>

        {/* 목록 카드와 같은 자리의 내 메모(저장 화면에서 적은 것) — 이름 바로 밑. */}
        <SavedNoteLine id={place.id} className="mt-2" />

        {/* 줄 순서는 목록 행과 같다 — 이름 → 판정 → (이유) → 메타 → 주소(22 R27.3 · design-audit D-4). 시트만 판정이 메타·주소 밑 넷째 줄이었다. */}
        {eligibility && (
          <div className="mt-1">
            <p className="text-sm">
              <VerdictText eligibility={eligibility} />
            </p>
            {/*
              목록 카드와 같은 대표 근거(`primaryReason`) — `reasons[0]` 이면 같은 장소를 두 화면이 다른 말로 설명한다(12 U1.7).
              판정 옆 한 줄(`truncate`)이 아니라 **판정 밑 줄 + 두 줄까지**(14 W261010.33u): 320px 에서 판정 옆 칸이 좁아
              "두부(12.5kg)는 13kg 미만까지 0…." 는 숫자가, "…이동가방도 되는지 확인해 주세요" 는 할 일이 잘려 나갔다.
            */}
            {reason && <p className="clamp-2 mt-0.5 text-sm text-secondary">{reason.text}</p>}
          </div>
        )}

        {/* 목록 카드와 같은 메타 한 줄(22 G3.0) — 거리는 밑 주소 줄이 말한다. 주소는 목록 카드에 없는 시트 몫이라 맨 끝. */}
        <p className="mt-1 truncate text-sm text-tertiary">{placeMetaLine(place, { verified })}</p>
        <p className="mt-0.5 truncate text-sm text-secondary">
          {distance && <span className="text-primary">{distance} · </span>}
          {address}
        </p>
      </Link>

      {/* 카드 본문 바깥에 둔다 — 자기도 링크라서 위 <Link> 안에 넣으면 a 안에 a 가 된다. */}
      {/* 접어 둔다 — 머리 줄(몇 가지 중 몇 챙김)만. 마커를 바꾸면 접힘·누른 흔적이 다음 곳으로 새지 않게 장소마다 새로 단다. */}
      <PlaceItemsNote key={place.id} place={place} folded className="mt-3" />

      {/*
        지도에서 고른 곳은 "지금 여기로" 가 가장 잦은 동작(16 T1.5) — 저장 카드·상세와 같은 한 곳짜리 길찾기. 버튼 줄에 세 번째로 넣으면 좁아 따로 한 줄.
        L 전폭 중립 테두리(22 D-14) — 밑의 '자세히 보기'(주 버튼)와 같은 높이·폭이라 두 줄이 한 덩어리로 읽힌다. 글자 폭 S 는 줄 왼쪽에 떠 있었다.
        D-14 의 나머지([길찾기][자세히 보기] 한 줄 · 저장을 머리 하트로)는 하지 않았다 — 머리 오른쪽은 시트 닫기 자리이고, 시트 높이가 핀 꺼내기(14a·14b)에 물린다.
      */}
      {directions && (
        <NaverLinkButton href={directions} size="lg" icon={NavigationPointer01} className="mt-3 w-full">
          네이버 길찾기
        </NaverLinkButton>
      )}

      <div className="mt-4 flex gap-2">
        <InkButton size="lg" href={`/place/${place.id}/`} className="flex-1">
          자세히 보기
        </InkButton>
        <SaveButton id={place.id} name={place.name} variant="full" className="w-24 shrink-0" />
      </div>
    </div>
  );
}
