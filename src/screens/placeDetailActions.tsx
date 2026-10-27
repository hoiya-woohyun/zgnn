'use client';

import { Heart, MarkerPin02, MessageTextSquare01, NavigationPointer01, SearchLg, Share01 } from '@untitledui/icons';
import { ActionTile } from '../components/actionTile';
import { SaveBurst, saveHeartMotion, useSaveToggle } from '../components/saveButton';
import { naverDirectionsUrl, naverPlaceFindUrl, naverPlaceUrlOf } from '../lib/naverPlaceLink';
import type { TPlaceEntry } from '../lib/places';
import { usePlaceShare } from './placeDetailShare';

/**
 * 상세 제목 바로 밑의 액션 줄 — 이 가게로 **할 수 있는 일**을 한 줄에 모은다.
 *
 * 예전에는 저장(특징 옆 하트)·네이버 지도·사진(판정 카드 밑 초록 알약)·후기·공유(홈페이지 밑 회색 풀버튼)가
 * 세 군데에 세 가지 모양으로 흩어져 있었다. 지도 앱 상세의 "저장·공유·길찾기" 줄처럼 제목 밑에 두면
 * 스크롤 없이 다 보이고, 숙소의 요금 절이 네이버 버튼을 화면 아래로 미는 일(2026-09-15 리뷰 §2③)도 사라진다.
 *
 * - 순서는 앱 안 동작(저장·공유) → 앱을 떠나는 것(길찾기·네이버 플레이스 → 후기). 원은 다섯 다 같은 모양이고(저장 켜짐만 채운 하트),
 *   떠나는 칸은 이름 밑 둘째 줄이 목적지를 말한다('네이버 지도' · '네이버' · '블로그'). 예전엔 네이버 칸만 초록 원이었는데 색 하나에 기대
 *   "무슨 초록인가" 를 읽게 했다 — 실서비스는 떠남을 색이 아니라 앱 이름으로 말한다(22 D-15).
 * - **칸은 다섯으로 고정**이다. 데이터가 없는 칸(좌표 없는 곳의 길찾기 · 후기 주소가 없는 곳)은 지우지 않고 같은 자리에 흐리게 세운다 —
 *   칸 수가 갈리면 같은 동작의 자리가 장소마다 바뀌어 눌러 둔 손이 빗나간다(14 W261010.6). 이유는 둘째 줄이 말한다.
 * - 이 줄이 스크롤로 사라진 뒤에도 저장·공유는 붙는 헤더 오른쪽에 남는다(`placeDetailAppBarActions`).
 * - 전화는 없다 — 전화번호 데이터가 아직 없다. 네이버 플레이스 칸(홈 탭에 전화가 있다)이 그 역할을 대신한다.
 * - 미니 지도·홈페이지 카드는 여기로 오지 않는다. 버튼이 아니라 내용이다.
 */
export function PlaceDetailActions({ place }: { place: TPlaceEntry }) {
  const { saved, toggle, burst } = useSaveToggle(place.id);
  /*
   * 네이버 칸은 둘 — **길찾기**와 **플레이스 홈**. 지도 칸이 길찾기인 이유: 플레이스로 보내면 거기서 한 번 더 눌러야 길이 나온다.
   * 플레이스 칸은 사진·전화·영업시간이 다 있는 홈 탭이다(ADR-002 v7 — 예전 '네이버 사진' 은 사진 탭이라 번호를 찾는 사람이 사진을 눌렀다).
   * 주소는 id 로 만든 홈이 먼저, id 가 없으면 `naverUrl`, 그것도 없으면(38곳) 칸째 비우지 않고 '네이버에서 찾기'(`naverPlaceFindUrl` — 가게 페이지가 아니라 검색이라 이름이 다르다). 좌표가 없는 곳(122곳 중 3곳)은 길찾기 칸이 없다 — 그 이유는 머리의 주소 줄이
   * 말한다(`placeDetailAddressNote`). 예전엔 그 자리에 '네이버 지도'(`naverUrl`)를 세웠는데 플레이스 칸과 같은 가게 페이지라 합쳤다.
   */
  const directionsUrl = naverDirectionsUrl(place);
  const placeUrl = naverPlaceUrlOf(place);

  // 공유 동작은 붙는 헤더의 공유 버튼과 같은 함수다(`placeDetailShare`) — 칸은 늘 그리고 공유냐 복사냐는 누른 순간에만 가른다.
  const share = usePlaceShare(place);

  return (
    <div role="group" aria-label={`${place.name}에서 할 수 있는 일`} data-ev="detail.actions" className="mt-4 grid max-w-lg auto-cols-fr grid-flow-col gap-1 px-4 md:px-6">
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
        data-ev="detail.save"
      />
      <ActionTile icon={Share01} label="공유" onClick={share} aria-label={`${place.name} 공유하기`} data-ev="detail.share" />
      {/* 좌표가 없는 곳(122곳 중 3곳)도 칸은 선다 — 칸 수가 4·5 로 갈리면 같은 동작의 자리가 장소마다 바뀐다(14 W261010.6). 이유는 머리의 주소 줄이 말한다. */}
      {directionsUrl ? (
        <ActionTile href={directionsUrl} icon={NavigationPointer01} label="길찾기" destination="네이버 지도" />
      ) : (
        <ActionTile disabled icon={NavigationPointer01} label="길찾기" destination="좌표 없음" />
      )}
      {/* 가게 페이지가 없는 곳(38곳)은 검색으로 간다 — 가게 페이지가 아니라서 이름이 '플레이스' 가 아니라 '검색'. '찾기' 였을 땐 옆 칸 '길찾기' 와
          "찾기" 를 나눠 가져 같은 동작이 두 번 든 것처럼 읽혔다(22 review R-4). 둘째 줄은 실제로 열리는 곳(네이버 지도 검색). */}
      {placeUrl ? (
        <ActionTile href={placeUrl} icon={MarkerPin02} label="플레이스" destination="네이버" />
      ) : (
        <ActionTile href={naverPlaceFindUrl(place)} icon={SearchLg} label="검색" destination="네이버 지도" />
      )}
      {/* 후기는 전부 네이버 블로그 글이다(122곳) — 목적지는 앱 이름이 아니라 글의 종류로 말한다. */}
      {place.reviewUrl ? (
        <ActionTile href={place.reviewUrl} icon={MessageTextSquare01} label="후기" destination="블로그" />
      ) : (
        <ActionTile disabled icon={MessageTextSquare01} label="후기" destination="없어요" />
      )}
    </div>
  );
}
