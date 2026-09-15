import Link from 'next/link';
import { PlaceThumb } from '../components/placeThumb';
import { TownChip } from '../components/townChip';
import { formatKm } from '../lib/format';
import { nearbyPlaces, type TPlaceEntry } from '../lib/places';

/** 근처 장소 3곳. 좌표가 있는 장소만 계산되므로(nearbyPlaces), 없으면 섹션째 숨긴다. */
export function PlaceDetailNearby({ place }: { place: TPlaceEntry }) {
  const nearby = nearbyPlaces(place, 3);
  if (nearby.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="px-4 text-lg font-bold text-primary md:px-6">근처 장소</h2>
      <ul className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 md:px-6">
        {nearby.map(({ place: other, km }) => (
          <li key={other.id} className="w-44 shrink-0">
            <Link
              href={`/place/${other.id}`}
              className="flex h-full flex-col rounded-2xl border border-secondary bg-primary p-3 transition-colors hover:bg-secondary"
            >
              <div className="flex items-center justify-between">
                <PlaceThumb src={other.cover ?? other.images[0]} type={other.type} size={40} />
                <span className="text-sm font-bold text-secondary">{formatKm(km)}</span>
              </div>
              <p className="clamp-2 mt-2 text-sm font-bold text-primary">{other.name}</p>
              <div className="mt-2">
                <TownChip town={other.region.town} type={other.type} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
