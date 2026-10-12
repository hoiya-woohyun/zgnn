import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { siteOpenGraph } from '@/lib/ogImage';
import { PLACES, TYPE_META, getPlace } from '@/lib/places';
import { PlaceDetailPage } from '@/screens/placeDetailPage';

/** 장소는 빌드 시점 데이터에 있는 곳뿐이다. 없는 id 는 404 로 둔다. */
export const dynamicParams = false;

export function generateStaticParams() {
  return PLACES.map((place) => ({ id: place.id }));
}

type TPlaceRouteProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: TPlaceRouteProps): Promise<Metadata> {
  const { id } = await params;
  const place = getPlace(id);
  if (!place) return {};

  const alt = `${TYPE_META[place.type].label} ${place.name}`;
  // 소개가 없는 곳(21 S7)은 빈 설명을 싣지 않는다 — undefined 면 description 은 레이아웃 것을 물려받고 og:description 은 빠진다.
  const description = place.features || undefined;
  return {
    title: place.name,
    description,
    // 레이아웃의 openGraph 를 통째로 대체한다 — 공통 칸에 이 장소의 카드를 얹는다.
    openGraph: { ...siteOpenGraph(alt, place.id), title: place.name, description },
  };
}

export default async function Page({ params }: TPlaceRouteProps) {
  const { id } = await params;
  if (!getPlace(id)) notFound();

  return <PlaceDetailPage id={id} />;
}
