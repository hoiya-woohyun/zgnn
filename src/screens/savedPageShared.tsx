'use client';

import { useMemo } from 'react';
import { Heart } from '@untitledui/icons';
import { Button } from '../components/base/button';
import { CARD_SURFACE } from '../components/cardSurface';
import { PageHeader } from '../components/layout/pageHeader';
import { showAppStatus } from '../lib/appStatus';
import { isInAppBrowser } from '../lib/installGuide';
import { PLACES_BY_ID, type TPlaceEntry } from '../lib/places';
import type { TSharedIds } from '../lib/savedShare';
import { useAppStore } from '../store/useAppStore';
import { SavedPageGroups } from './savedPageGroups';

type TSavedPageSharedProps = {
  shared: TSharedIds;
  /** 담은 뒤 내 목록 보기로 돌아간다(주소의 `?ids=` 를 지운다). */
  onDone: () => void;
};

/**
 * 공유받은 저장 목록(07 P1) — 읽기 전용 보기 + "내 저장에 담기".
 *
 * 부르는 쪽(`SavedPage`)이 저장값 읽기가 끝난 뒤에만 그린다: "이미 저장한 곳 N" 은 내 저장을 봐야 세고,
 * 인앱 판정은 `navigator` 를 본다(미리 그린 HTML 에는 없다).
 */
export function SavedPageShared({ shared, onDone }: TSavedPageSharedProps) {
  const savedIds = useAppStore((state) => state.savedIds);
  const addSaved = useAppStore((state) => state.addSaved);
  const places = useMemo(
    () => shared.ids.map((id) => PLACES_BY_ID.get(id)).filter((place): place is TPlaceEntry => place !== undefined),
    [shared.ids],
  );
  const fresh = shared.ids.filter((id) => !savedIds.includes(id));
  const already = shared.ids.length - fresh.length;
  // 카톡·네이버 인앱 웹뷰의 저장소는 Safari·홈 화면 앱과 따로다 — 거기서 담으면 그 안에만 남는다. 막지는 않고 말만 한다(07 U9 후속).
  const inApp = isInAppBrowser(navigator.userAgent);

  const add = () => {
    addSaved(fresh);
    showAppStatus(`${fresh.length}곳을 내 저장에 담았어요`);
    onDone();
  };

  return (
    <div>
      <PageHeader
        title="공유받은 목록"
        description={places.length > 0 ? `${places.length}곳을 보내 왔어요` : '보내 온 곳을 지금은 안내하지 않아요'}
      />

      {shared.unknownCount > 0 && places.length > 0 && (
        <p className="px-4 pt-3 text-sm text-tertiary md:px-6">
          더 이상 안내하지 않는 곳 {shared.unknownCount}곳은 빼고 보여 드려요.
        </p>
      )}

      <div className="px-4 pt-4 md:px-6">
        <div className={`${CARD_SURFACE} p-4`}>
          {fresh.length > 0 ? (
            <Button color="primary" size="lg" iconLeading={Heart} onClick={add} className="w-full">
              내 저장에 담기 {fresh.length}곳
            </Button>
          ) : (
            <Button color="secondary" size="lg" onClick={onDone} className="w-full">
              {places.length > 0 ? '모두 저장돼 있어요 · 내 목록 보기' : '내 목록 보기'}
            </Button>
          )}
          {(already > 0 && fresh.length > 0) || inApp ? (
            <div className="mt-3 space-y-1 text-sm text-tertiary">
              {already > 0 && fresh.length > 0 && <p>{already}곳은 이미 저장돼 있어 그대로 둬요.</p>}
              {inApp && <p>카카오톡·네이버 앱 안에서 담으면 그 앱 안에만 남아요. Safari·Chrome 으로 열어 담아 주세요.</p>}
            </div>
          ) : null}
        </div>
      </div>

      <SavedPageGroups places={places} withNotes={false} />
    </div>
  );
}
