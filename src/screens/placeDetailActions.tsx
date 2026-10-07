'use client';

import { Heart, Image01, Map01, MessageTextSquare01, NavigationPointer01, Share01 } from '@untitledui/icons';
import { ActionTile } from '../components/actionTile';
import { NaverActionTile } from '../components/naverLinkButton';
import { SaveBurst, saveHeartMotion, useSaveToggle } from '../components/saveButton';
import { showAppStatus } from '../lib/appStatus';
import { naverDirectionsUrl, naverPlacePhotoUrl } from '../lib/naverPlaceLink';
import { shareMethodOf, shareTextFor } from '../lib/placeShare';
import type { TPlaceEntry } from '../lib/places';
import { useDog } from '../store/useAppStore';
import { useEligibility } from '../store/useDogEligibility';

/**
 * 상세 제목 바로 밑의 액션 줄 — 이 가게로 **할 수 있는 일**을 한 줄에 모은다.
 *
 * 예전에는 저장(특징 옆 하트)·네이버 지도·사진(판정 카드 밑 초록 알약)·후기·공유(홈페이지 밑 회색 풀버튼)가
 * 세 군데에 세 가지 모양으로 흩어져 있었다. 지도 앱 상세의 "저장·공유·길찾기" 줄처럼 제목 밑에 두면
 * 스크롤 없이 다 보이고, 숙소의 요금 절이 네이버 버튼을 화면 아래로 미는 일(2026-09-15 리뷰 §2③)도 사라진다.
 *
 * - 순서는 앱 안 동작(저장·공유) → 앱을 떠나는 것(네이버 지도·사진 → 후기). 초록 원은 네이버로 나가는 칸에만.
 * - 데이터가 없는 칸은 **안 그린다**(자리를 비워 두지 않는다). 칸 폭은 남은 칸끼리 나눈다.
 * - 전화는 없다 — 전화번호 데이터가 아직 없다. 네이버 지도 칸이 그 역할을 대신한다.
 * - 미니 지도·홈페이지 카드는 여기로 오지 않는다. 버튼이 아니라 내용이다.
 */
export function PlaceDetailActions({ place }: { place: TPlaceEntry }) {
  const dog = useDog();
  const eligibility = useEligibility(place);
  const { saved, toggle, burst } = useSaveToggle(place.id);
  const photoUrl = naverPlacePhotoUrl(place.naverPlaceId);
  /*
   * 지도 칸은 **길찾기**가 먼저다 — 플레이스 페이지로 보내면 거기서 한 번 더 눌러야 길이 나온다. 좌표가 없는 곳(5곳)만
   * 예전처럼 플레이스 페이지(`naverUrl`)로. 둘 다 없으면 칸이 없다.
   */
  const directionsUrl = naverDirectionsUrl(place);

  /*
   * 공유 칸은 **늘 그린다**(지수 ⑤ — 카톡 인앱·데스크톱엔 Web Share 가 없어 버튼이 아예 없었다).
   * 화면은 빌드 때 미리 그려지므로 렌더 중에 navigator 를 보면 하이드레이션이 어긋난다. 그래서
   * 칸의 존재는 서버·클라가 같고(항상 있음), 공유냐 복사냐는 누른 순간에만 가른다.
   */
  const share = () => {
    const url = window.location.href;
    const method = shareMethodOf(navigator);
    if (method === 'share') {
      const text = shareTextFor(place.features, dog?.dogs.map((d) => d.name) ?? null, eligibility);
      // 사용자가 공유 시트를 닫아도 reject 된다 — 실패가 아니라 취소라 조용히 넘긴다.
      void navigator.share({ title: `${place.name} | 강아지랑 제주`, text, url }).catch(() => undefined);
      return;
    }
    if (method === 'copy') {
      navigator.clipboard.writeText(url).then(
        () => showAppStatus('링크를 복사했어요'),
        () => showAppStatus('링크를 복사하지 못했어요. 주소창의 주소를 보내 주세요'),
      );
      return;
    }
    showAppStatus('이 브라우저에서는 공유할 수 없어요. 주소창의 주소를 보내 주세요');
  };

  return (
    <div role="group" aria-label={`${place.name}에서 할 수 있는 일`} className="mt-4 grid max-w-lg auto-cols-fr grid-flow-col gap-1 px-4 md:px-6">
      {/* 이름표는 `${name} 저장` 으로 고정하고 상태는 aria-pressed 만 말한다(SaveButton 과 같은 D9). */}
      <ActionTile
        icon={Heart}
        label={saved ? '저장함' : '저장'}
        tone={saved ? 'active' : 'neutral'}
        onClick={toggle}
        iconMotion={saveHeartMotion(burst)}
        effect={<SaveBurst burst={burst} />}
        aria-label={`${place.name} 저장`}
        aria-pressed={saved}
      />
      <ActionTile icon={Share01} label="공유" onClick={share} aria-label={`${place.name} 공유하기`} />
      {directionsUrl ? (
        <NaverActionTile href={directionsUrl} icon={NavigationPointer01} label="길찾기" />
      ) : (
        place.naverUrl && <NaverActionTile href={place.naverUrl} icon={Map01} label="네이버 지도" />
      )}
      {photoUrl && <NaverActionTile href={photoUrl} icon={Image01} label="네이버 사진" />}
      {place.reviewUrl && <ActionTile href={place.reviewUrl} icon={MessageTextSquare01} label="후기" />}
    </div>
  );
}
