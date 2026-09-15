# 강아지랑 제주

짱구누나의 반려견 동반 제주 가이드. 강아지와 함께 갈 수 있는 제주 숙소·식당·카페 86곳과
여행 준비물을 모바일에서 보는 PWA 입니다.

## 실행

Node 22, pnpm 이 필요합니다.

```bash
pnpm i
pnpm dev      # 개발 서버
pnpm build    # 타입 검사 + 프로덕션 빌드 → dist/
pnpm preview  # 빌드 결과 확인
pnpm test     # 반려동물 이용 조건 파서 테스트
pnpm lint     # eslint
pnpm icons    # PWA 아이콘 재생성 (팔레트가 바뀔 때만)
```

## 화면

| 경로 | 화면 |
|---|---|
| `/` | 홈. 인사말, 숙소·식당·카페 요약, 준비물과 저장한 곳 진입 |
| `/places/:type` | 둘러보기. 이름·특징·읍면 검색, 방향·반려동물 조건 필터, 숙소는 가격 정렬 |
| `/place/:id` | 상세. 사진, 반려동물 이용 조건(원문 포함), 요금, 근처 장소 |
| `/map` | 지도. 타입·방향 필터, 마커를 누르면 미니 카드(모바일은 하단 시트, ≥1024px 은 좌측 목록 패널). `?saved=1` 은 저장한 곳만 |
| `/checklist` | 준비물. 계절별 목록, 체크 상태 저장, 숙소 구비 용품 반영 |
| `/saved` | 저장한 곳. 타입별 묶음 |

저장한 곳, 준비물 체크, 계절 선택은 `localStorage` 에 남습니다(zustand persist).

화면 틀은 폭에 따라 갈립니다. 768px 미만은 상단 앱바 + 하단 탭바, 768px 이상은 좌측 고정
사이드바입니다. 지도만 1024px 이상에서 목록 패널과 지도의 2단이 됩니다.

## 데이터

`src/data/` 의 세 JSON 이 앱이 읽는 전부입니다. 원본은 짱구누나의 Notion 자료
(`src/data/meta.json` 의 `sourceUrl`) 이고, 아래 순서로 만들어집니다.

```bash
pnpm data:fetch-images     # 블로그 후기에서 장소 사진 수집 → data/raw/places/
pnpm data:optimize-images  # webp 변환 → public/images/places/ + data/place-images.json
pnpm data:normalize        # Notion export + 이미지 매니페스트 → src/data/*.json
```

### 장소 사진은 없습니다

후기 포스트 대부분이 작성자 본인이 아닌 타인의 블로그라, 저작권 문제로 사진을 모두 뺐습니다.
`public/images/` 디렉터리는 없고 86곳 전부 `cover` 가 없으며 `images` 는 빈 배열입니다.
이미지 수집 스크립트를 다시 돌려도 허용목록이 비어 있어 아무것도 받지 않습니다.

그래서 **사진 없는 상태가 이 앱의 기본 디자인**입니다. 사진 자리는 타입별 색과
종류 아이콘(숙소·식당·카페)이 대신하고, 장소 이름·읍면·특징 문장이 타이포그래피로 화면을 이끕니다.
`cover` 와 `images` 를 읽는 코드 경로는 그대로 남겨뒀으니, 나중에 직접 찍은 사진을
`src/data/places.json` 에 채우면 코드 수정 없이 사진이 나옵니다(불러오기에 실패하면 아이콘으로 되돌아갑니다).

사진이 다시 생기더라도 용량이 커서 PWA precache 에는 넣지 않습니다. 런타임 캐시로만
다루도록 workbox 설정(`globIgnores` 와 `/images/places/` CacheFirst 규칙)은 유지돼 있습니다.

## 손대게 될 만한 곳

- **`src/lib/petPolicy.ts`** — 손으로 쓴 `petPolicyText` 에서 실내 동반 여부, 무게 제한,
  마릿수, 요금 같은 조건을 뽑아냅니다. 판단 규칙이 파일 위쪽 테이블에 모여 있어서
  새로운 표현이 나오면 정규식 한 줄만 추가하면 됩니다. 규칙을 고치면 `pnpm test` 로 확인하세요.
  화면에는 항상 원문을 함께 보여주므로, 파서가 놓친 조건도 사용자가 읽을 수 있습니다.
- **`src/lib/category.ts`** — 네이버 카테고리 문자열을 화면 라벨로 다듬습니다.
  아이콘은 여기가 아니라 `src/components/icons/placeTypeIcon.ts` 의 종류별 3종을 씁니다.
- **`src/lib/amenities.ts`** — 숙소 구비 용품과 준비물을 잇는 매핑 테이블.
- **`src/lib/placeFilters.ts`** — 둘러보기 화면의 조건 필터.
- **`src/lib/mapTiles.ts`** — 지도 타일 출처.

## 지도 타일

CARTO Voyager 가 원래 선택이지만 CARTO 는 API 키 없이 받은 타일에 워터마크를 찍습니다.
그래서 키가 없으면 OpenStreetMap 기본 타일을 씁니다. CARTO 키가 있다면 `.env.local` 에
아래 한 줄을 넣으면 CARTO 로 바뀝니다.

```
VITE_CARTO_API_KEY=발급받은_키
```

## UI — Untitled UI

표현 계층은 [Untitled UI](https://www.untitledui.com/) 를 따릅니다. Untitled UI React 는 npm
패키지가 아니라 CLI 로 소스를 복사해 쓰는 방식이라, 필요한 것만 받아 레포 안에 두고 있습니다.

| 위치 | 무엇 |
|---|---|
| `src/components/base/` | Untitled UI 에서 가져온 컴포넌트. 원본 이름(kebab-case)을 그대로 씁니다. **직접 고치지 마세요** — 규칙도 eslint 에서 이 폴더만 따로 꺼 뒀습니다 |
| `src/styles/theme.css` | Untitled UI 토큰. 브랜드 스케일만 제주 귤로, 회색은 현무암·모래 웜 그레이로 바꿔 끼웠습니다 |
| `src/components/layout/` | 앱 셸(사이드바·탭바·앱바)과 `PageHeader` / `Section` / `EmptyState` |
| `src/components/icons/` | `@untitledui/icons` 에 없는 숙소·식당·카페 아이콘 3종(24×24, stroke 2) |

색은 `bg-primary` · `text-secondary` · `bg-brand-solid` 같은 시맨틱 토큰으로만 씁니다.
종류 색(숙소=바다 / 식당=귤 / 카페=현무암)만 브랜드와 별개 토큰으로 남아 있습니다 —
사진이 없는 화면에서 종류를 가르는 주된 신호라 브랜드 색에 흡수시키지 않았습니다.

`@/` 는 `src/` 를 가리킵니다(`vite.config.ts` 의 `resolve.alias` 와 `tsconfig.json` 의 `paths`).
Untitled UI 컴포넌트끼리 이 경로로 서로를 참조하므로 둘을 같은 값으로 유지해야 합니다.

## 스택

Vite · React 19 · TypeScript · Tailwind CSS v4 · react-router v7 · zustand ·
react-aria-components + Untitled UI · leaflet + react-leaflet · vite-plugin-pwa · vitest
