'use client';

import { Heart, MarkerPin01 } from '@untitledui/icons';
import { Button } from '../components/base/button';
import { PageHeader } from '../components/layout/pageHeader';
import { EmptyState } from '../components/layout/emptyState';
import { PlaceCard } from '../components/placeCard';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { PLACE_TYPES, TYPE_COLOR, TYPE_META, typeTint } from '../lib/places';
import { useSavedPlaces, useUnlistedSavedCount } from '../store/useAppStore';
import { SavedPageNote } from './savedPageNote';

export function SavedPage() {
  const saved = useSavedPlaces();
  const unlisted = useUnlistedSavedCount();

  return (
    <div>
      <PageHeader
        title="저장한 곳"
        description={saved.length > 0 ? `${saved.length}곳을 모아뒀어요` : '아직 저장한 곳이 없어요'}
      />

      {/* 운영자가 내린 곳은 하트를 지우지 않고 감춘다 — 되살리면 메모와 함께 돌아온다(12 U2.3). */}
      {unlisted > 0 && (
        <p className="px-4 pt-3 text-sm text-tertiary md:px-6">
          더 이상 안내하지 않는 곳 {unlisted}곳은 빼고 보여 드려요.
        </p>
      )}

      {saved.length === 0 ? (
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            Icon={Heart}
            title="하트를 눌러 모아보세요"
            description="저장한 곳은 지도에서 한 번에 확인할 수 있어요."
            action={
              <Button color="primary" size="md" href="/places/stay/">
                장소 둘러보기
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="px-4 pt-4 md:px-6">
            <Button color="primary" size="lg" iconLeading={MarkerPin01} href="/map/?saved=1" className="w-full">
              지도에서 보기
            </Button>
          </div>

          {PLACE_TYPES.map((type) => {
            const group = saved.filter((place) => place.type === type);
            if (group.length === 0) return null;
            const Icon = PLACE_TYPE_ICON[type];
            return (
              <section key={type} className="mt-7 px-4 md:px-6">
                {/* 그룹 제목은 Section 컴포넌트를 못 쓴다 — title 이 문자열만 받아
                    아이콘을 함께 넣을 수 없어서 같은 스타일을 여기서 직접 맞췄다. */}
                <h2 className="flex items-center gap-2 text-lg font-bold text-primary">
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-lg"
                    style={{ background: typeTint(type, 14), color: TYPE_COLOR[type] }}
                  >
                    <Icon size={16} />
                  </span>
                  {TYPE_META[type].label} {group.length}곳
                </h2>
                <ul className="mt-3 space-y-3">
                  {group.map((place) => (
                    <PlaceCard key={place.id} place={place} footer={<SavedPageNote id={place.id} name={place.name} />} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
