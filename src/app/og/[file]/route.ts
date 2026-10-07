import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { decompress } from 'wawoff2';
import { PLACES, getPlace } from '@/lib/places';
import { OG_IMAGE_SIZE, ogImageFile, placeIdOfOgImageFile } from '@/lib/ogImage';
import { ogImagePlaceCard, ogImageSiteCard } from './ogImageCard';

/*
 * 링크 미리보기 이미지 — `/og/site.png` 하나와 장소마다 `/og/<id>.png`(07 P1).
 * 정적 내보내기라 빌드 때 전부 구워 `out/og/` 에 파일로 남는다. 요청 때 그리는 서버는 없다.
 * 왜 `opengraph-image` 관례가 아니라 이 라우트인지는 `lib/ogImage.ts` 머리 주석.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return [ogImageFile(), ...PLACES.map((place) => ogImageFile(place.id))].map((file) => ({ file }));
}

/*
 * 글꼴은 화면과 같은 Zgnn Sans(Pretendard 서브셋)를 쓴다. satori 는 woff2 를 못 읽어서(TTF·OTF·WOFF 만)
 * 빌드 때 풀어 넘긴다 — TTF 사본을 레포에 하나 더 두면 서브셋을 다시 만들 때 둘이 갈라진다.
 * 서브셋 밖 글자(이모지 등)가 이름에 들어오면 satori 가 대체 글꼴을 **네트워크로** 받으러 간다.
 */
const FONT_DIR = path.join(process.cwd(), 'src/app/fonts');
const loadFont = async (file: string) => Buffer.from(await decompress(await readFile(path.join(FONT_DIR, file))));

/** 장소 85장이 한 번만 읽게 모듈에 묶어 둔다. */
const assets = (async () => {
  const [regular, semiBold, icon] = await Promise.all([
    loadFont('ZgnnSans-Regular.woff2'),
    loadFont('ZgnnSans-SemiBold.woff2'),
    readFile(path.join(process.cwd(), 'public/icons/icon-512.png')),
  ]);
  return {
    fonts: [
      { name: 'Zgnn Sans', data: regular, weight: 400 as const, style: 'normal' as const },
      { name: 'Zgnn Sans', data: semiBold, weight: 600 as const, style: 'normal' as const },
    ],
    icon: `data:image/png;base64,${icon.toString('base64')}`,
  };
})();

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const placeId = placeIdOfOgImageFile(file);
  const place = placeId ? getPlace(placeId) : undefined;
  if (placeId === undefined || (placeId && !place)) return new Response('Not found', { status: 404 });

  const { fonts, icon } = await assets;
  return new ImageResponse(place ? ogImagePlaceCard(place, icon) : ogImageSiteCard(icon), {
    ...OG_IMAGE_SIZE,
    fonts,
  });
}
