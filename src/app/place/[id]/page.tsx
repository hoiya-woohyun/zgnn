import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PLACES, getPlace } from '@/lib/places';
import { PlaceDetailPage } from '@/screens/placeDetailPage';

/** 장소는 데이터에 있는 86곳뿐이다. 없는 id 는 404 로 둔다. */
export const dynamicParams = false;

export function generateStaticParams() {
  return PLACES.map((place) => ({ id: place.id }));
}

type TPlaceRouteProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: TPlaceRouteProps): Promise<Metadata> {
  const { id } = await params;
  const place = getPlace(id);
  if (!place) return {};

  return {
    title: place.name,
    description: place.features,
  };
}

export default async function Page({ params }: TPlaceRouteProps) {
  const { id } = await params;
  if (!getPlace(id)) notFound();

  return <PlaceDetailPage id={id} />;
}
