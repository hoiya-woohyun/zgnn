import { showAppStatus } from '../lib/appStatus';
import { shareMethodOf, shareTextFor } from '../lib/placeShare';
import type { TPlaceEntry } from '../lib/places';
import { useDog } from '../store/useAppStore';
import { useEligibility } from '../store/useDogEligibility';

/**
 * 상세의 공유 동작 — 액션 줄(`placeDetailActions`)과 붙는 헤더의 버튼(`placeDetailAppBarActions`)이 **같은 함수**를 부른다.
 * 둘이 따로 갖으면 한쪽만 복사 폴백이 빠지는 식으로 갈린다.
 *
 * 칸은 **늘 그린다**(카톡 인앱·데스크톱엔 Web Share 가 없어 버튼이 아예 없었다). 화면은 빌드 때 미리 그려지므로 렌더 중에
 * navigator 를 보면 하이드레이션이 어긋난다 — 공유냐 복사냐는 누른 순간에만 가른다.
 */
export function usePlaceShare(place: TPlaceEntry): () => void {
  const dog = useDog();
  const eligibility = useEligibility(place);
  return () => {
    const url = window.location.href;
    const method = shareMethodOf(navigator);
    if (method === 'share') {
      const text = shareTextFor(place.features, dog?.dogs.map((d) => d.name) ?? null, eligibility);
      // 사용자가 공유 시트를 닫아도 reject 된다 — 실패가 아니라 취소라 조용히 넘긴다.
      // 소개가 없고 강아지도 없으면 글이 비어(21 S7) 빈 text 를 싣지 않는다 — 제목·주소만 간다.
      void navigator.share({ title: `${place.name} | 강아지랑 제주`, text: text || undefined, url }).catch(() => undefined);
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
}
