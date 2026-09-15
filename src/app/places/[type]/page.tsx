import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PLACE_TYPES, TYPE_META, countByType, isPlaceType } from '@/lib/places';
import { PlacesPage } from '@/screens/placesPage';

/** 종류는 셋뿐이다. 그 밖의 주소는 빌드에서 만들지도, 실행 중에 받지도 않는다. */
export const dynamicParams = false;

export function generateStaticParams() {
  return PLACE_TYPES.map((type) => ({ type }));
}

type TPlacesRouteProps = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: TPlacesRouteProps): Promise<Metadata> {
  const { type } = await params;
  if (!isPlaceType(type)) return {};

  const meta = TYPE_META[type];
  return {
    title: `${meta.label} 둘러보기`,
    description: `${meta.blurb} ${countByType[type]}곳. 방향과 반려동물 조건으로 골라보세요.`,
  };
}

export default async function Page({ params }: TPlacesRouteProps) {
  const { type } = await params;
  if (!isPlaceType(type)) notFound();

  return <PlacesPage type={type} />;
}
