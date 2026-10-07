import { useRouter } from 'next/navigation';
import { FilterChip } from '../components/filterChip';
import { LANDMARKS } from '../lib/landmarks';
import { usePlacesPageFilterStore } from '../store/usePlacesPageFilterStore';

/**
 * 홈의 「지역으로 찾기」 — 관광지 이름 칩(18 T2).
 *
 * 예전엔 종류 카드마다 읍면 칩이 있었는데, 읍면(`town`)은 **퍼시스트** 필터라 "구좌읍 숙소" 를 한 번 누르면
 * 카페 탭에도, 다음 방문에도 남았다(ux-expert M-5). 관광지는 검색어(`usePlacesPageFilterStore`, 비퍼시스트)라
 * 검색칸에 글자로 보이고 새로고침하면 풀린다. 홈은 이제 퍼시스트 필터를 걸지 않는다.
 *
 * 순서는 `LANDMARKS_BY_AREA` 의 권역 순서(서쪽 애월부터 시계 방향) 그대로. 가로 스크롤이 아니라 줄바꿈 —
 * 가로로 끌면 둘러보기 스와이프(ADR-013)와 손가락이 겹친다.
 */
export function HomePageLandmarkChips() {
  const router = useRouter();
  const setQuery = usePlacesPageFilterStore((state) => state.setQuery);

  // 검색어는 덧붙이지 않고 바꾼다. `name` 은 "협재·금능" 처럼 합친 표기라 검색어로는 안 읽힌다 — 별칭 첫 말을 넣는다.
  // 숙소가 첫 종류라 숙소로 간다. 그 종류에 0곳이면 빈 상태가 다른 종류의 수를 안내한다(07 U3).
  // 전에 걸어 둔 읍면(퍼시스트)은 여기서 풀지 않는다 — 겹쳐서 0곳이면 빈 상태가 "읍면을 풀면 N곳" 과 푸는 버튼을 준다(T2.1).
  const goToLandmark = (word: string) => {
    setQuery(word);
    router.push('/places/stay');
  };

  return (
    <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="관광지 근처 찾기">
      {LANDMARKS.map((landmark) => (
        <FilterChip
          key={landmark.name}
          pressed={false}
          toggle={false}
          onClick={() => goToLandmark(landmark.aliases[0])}
          aria-label={`${landmark.name} 근처 둘러보기`}
        >
          {landmark.name}
        </FilterChip>
      ))}
    </div>
  );
}
