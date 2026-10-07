import type { ReactElement } from 'react';
import { PLACES, TYPE_COLOR, TYPE_COLOR_DEEP, TYPE_META, type TPlaceEntry } from '@/lib/places';
import { PLACE_TYPE_GLYPH } from '@/lib/placeTypeGlyph';

/*
 * 미리보기 카드 그림. satori(next/og)가 그리므로 flex 만 되고 CSS 변수·Tailwind 는 못 쓴다 —
 * 색은 theme.css 의 원시값을 여기 한 번 더 적는다(종류 색은 places.ts 에서 가져온다).
 *
 * 사진은 없다(ADR-002) — 화면의 사진 자리처럼 종류 색 + 아이콘이 대신한다.
 * 가운데 정렬인 것은 카톡이 넓은 이미지를 가운데 기준으로 잘라 보여줄 때가 있어서다.
 */
const CREAM = '#faf8f4'; // --color-neutral-50 (페이지 바탕)
const INK = '#2e2327'; // --color-ink
const MUTED = '#605953'; // --color-neutral-600 (text-tertiary)
const BRAND = '#cd2a77'; // --color-brand-600

const frame = (children: ReactElement[]): ReactElement => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: CREAM,
      color: INK,
      fontFamily: 'Zgnn Sans',
      padding: '56px 96px',
      textAlign: 'center',
    }}
  >
    {children}
  </div>
);

// satori 는 next/image 를 모른다 — 맨 <img> 에 data URI 를 넣는다.
const siteMark = (icon: string, size: number): ReactElement => (
  <img src={icon} width={size} height={size} alt="" style={{ borderRadius: size * 0.22 }} />
);

/** 홈·목록 등 사이트 공통 카드 — 앱 아이콘 + 이름 + 한 줄 소개. */
export const ogImageSiteCard = (icon: string): ReactElement =>
  frame([
    <div key="mark" style={{ display: 'flex' }}>
      {siteMark(icon, 168)}
    </div>,
    <div key="name" style={{ marginTop: 44, fontSize: 96, fontWeight: 600, letterSpacing: -2 }}>
      강아지랑 제주
    </div>,
    <div key="blurb" style={{ marginTop: 20, fontSize: 40, fontWeight: 400, color: MUTED }}>
      {`반려견 동반 숙소·식당·카페 ${PLACES.length}곳`}
    </div>,
    <div key="pitch" style={{ marginTop: 10, fontSize: 40, fontWeight: 600, color: BRAND }}>
      우리 강아지가 갈 수 있는지 바로 봐요
    </div>,
  ]);

/** 장소 상세 카드 — 종류 색 판 + 아이콘, 이름, 종류·읍면, 아래에 사이트 표지. */
export const ogImagePlaceCard = (place: TPlaceEntry, icon: string): ReactElement =>
  frame([
    <div
      key="glyph"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 136,
        height: 136,
        borderRadius: 36,
        background: TYPE_COLOR[place.type],
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={80}
        height={80}
        stroke="#ffffff"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PLACE_TYPE_GLYPH[place.type].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>,
    <div
      key="kind"
      style={{ marginTop: 32, fontSize: 40, fontWeight: 600, color: TYPE_COLOR_DEEP[place.type] }}
    >
      {`${TYPE_META[place.type].label} · ${place.region.town}`}
    </div>,
    <div
      key="name"
      style={{
        marginTop: 12,
        maxWidth: 1000,
        fontSize: 84,
        fontWeight: 600,
        lineHeight: 1.15,
        letterSpacing: -2,
        wordBreak: 'keep-all',
        justifyContent: 'center',
      }}
    >
      {place.name}
    </div>,
    <div key="site" style={{ display: 'flex', alignItems: 'center', marginTop: 44 }}>
      {siteMark(icon, 52)}
      <div style={{ marginLeft: 16, fontSize: 34, fontWeight: 600, color: MUTED }}>강아지랑 제주</div>
    </div>,
  ]);
