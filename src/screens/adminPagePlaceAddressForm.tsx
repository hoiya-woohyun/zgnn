'use client';

import { useState } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import type { TPlaceRow } from '../lib/adminCandidates';
import {
  placeAddressDraft,
  placeAddressPatch,
  placeAddressProblem,
  type TPlaceAddressPatch,
} from '../lib/adminPlaces';
import { naverMapSearchUrl, naverPlacePhotoUrl } from '../lib/naverPlaceLink';
import { cx } from '../utils/cx';
import { ADMIN_PANEL_DIVIDER } from './adminTable';

/**
 * 올린 장소의 주소·좌표 고치기 패널. 쓰기는 소유자(`adminPagePlaceList`)가 하고 여기는 초안과 검사만 든다 —
 * 내리기 패널과 같은 나눔이다.
 *
 * 사실을 확인하러 갈 곳(네이버 플레이스·지도 검색)을 **폼 안에** 둔다. 이 폼을 여는 이유가 "실제로 보니 다르다" 라서,
 * 그 실제를 보는 길이 옆에 없으면 운영자가 기억으로 적는다.
 */
export function AdminPagePlaceAddressForm({
  place,
  busy,
  onSave,
  onCancel,
}: {
  place: TPlaceRow;
  busy: boolean;
  onSave: (patch: TPlaceAddressPatch) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => placeAddressDraft(place));
  const set = (patch: Partial<typeof draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const problem = placeAddressProblem(draft);
  const patch = problem ? null : placeAddressPatch(place, draft);
  const placeHref = place.naver_url || naverPlacePhotoUrl(place.naver_place_id ?? undefined);

  return (
    <div className={cx(ADMIN_PANEL_DIVIDER, 'px-4 py-3')}>
      <p className="text-xs font-semibold text-secondary">주소·좌표 고치기</p>
      <p className="mt-1 text-xs text-tertiary">
        확인하러 가기:{' '}
        {placeHref && (
          <>
            <a href={placeHref} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
              네이버 플레이스
            </a>
            {' · '}
          </>
        )}
        <a href={naverMapSearchUrl(place.name)} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
          네이버 지도에서 찾기
        </a>
      </p>

      <div className="mt-2 flex max-w-xl flex-col gap-2">
        <Input
          aria-label="주소"
          placeholder="주소 (예: 제주특별자치도 서귀포시 안덕면 …)"
          size="sm"
          value={draft.address}
          onChange={(value) => set({ address: value })}
          isDisabled={busy}
        />
        <div className="flex gap-2">
          <Input aria-label="위도" placeholder="위도 (33.xx)" size="sm" value={draft.lat} onChange={(value) => set({ lat: value })} isDisabled={busy} />
          <Input aria-label="경도" placeholder="경도 (126.xx)" size="sm" value={draft.lng} onChange={(value) => set({ lng: value })} isDisabled={busy} />
        </div>
      </div>

      {/* 주소만 고쳐도 된다 — 다만 지도 핀은 좌표로만 선다. 그걸 숨기면 "고쳤는데 지도에 없다" 가 된다. */}
      <p className="mt-2 text-xs text-tertiary">
        좌표는 비워도 저장돼요. 지도에 핀이 서려면 위도·경도가 둘 다 있어야 해요.
        {place.status === 'published' && ' 저장하면 다음 빌드부터 사이트에 반영돼요.'}
      </p>
      {problem && <p className="mt-1 text-xs text-error-primary">{problem}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          color="primary"
          size="sm"
          isDisabled={busy || !patch}
          isLoading={busy}
          onClick={() => patch && onSave(patch)}
        >
          {busy ? '저장하고 있어요…' : '저장'}
        </Button>
        <Button color="secondary" size="sm" isDisabled={busy} onClick={onCancel}>
          취소
        </Button>
      </div>
      {!problem && !patch && <p className="mt-2 text-xs text-tertiary">바뀐 것이 없어요.</p>}
    </div>
  );
}
