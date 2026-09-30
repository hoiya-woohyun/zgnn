'use client';

import { LinkExternal01 } from '@untitledui/icons';
import { useState } from 'react';
import { homepageHost } from '../lib/placeHomepage';
import type { TPlaceHomepage } from '../types';

/**
 * 공식 홈페이지 **링크 카드**(ADR-002 v2). 사진은 업체가 공유 미리보기용으로 내놓은 `og:image` 를 **그 사이트에서 그대로** 띄운다 —
 * 파일을 갖고 있지 않다. 그래서 모양이 갤러리가 아니라 카톡 링크 미리보기와 같은 카드다: 사진 · 이름 · 출처 도메인이 한 덩어리로
 * 홈페이지를 가리킨다. 그 용도 그대로 쓰는 것이 이 사진을 쓸 수 있는 근거라, 사진만 떼어 헤더에 올리지 않는다.
 *
 * 사진은 남의 서버라 언제든 사라질 수 있다 — 못 받으면(`onError`) 사진 자리를 접고 이름·출처만 남긴다.
 * `referrerPolicy="no-referrer"` 는 핫링크를 리퍼러로 막는 사이트에서도 뜨게 하려는 것이다.
 */
export function PlaceDetailHomepage({ homepage }: { homepage: TPlaceHomepage }) {
  const [imageFailed, setImageFailed] = useState(false);
  const host = homepageHost(homepage.url);
  const showImage = Boolean(homepage.image) && !imageFailed;

  return (
    <a
      href={homepage.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-2xl border border-secondary bg-primary"
    >
      {showImage && (
        <img
          src={homepage.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          /*
           * 정적 HTML 이라 사진 요청이 하이드레이션보다 먼저 끝날 수 있고, 그때 난 실패는 `onError` 가 못 듣는다 —
           * 붙는 순간 한 번 더 본다(끝났는데 크기가 0 이면 실패다).
           */
          ref={(img) => {
            if (img?.complete && img.naturalWidth === 0) setImageFailed(true);
          }}
          className="aspect-[1.91/1] w-full bg-secondary object-cover"
        />
      )}
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          {/* 이름이 없으면 도메인을 두 번 적지 않는다 — 윗줄은 할 일, 아랫줄은 어디인지. */}
          <p className="truncate text-sm font-semibold text-primary">{homepage.name ?? '홈페이지 가기'}</p>
          <p className="mt-0.5 truncate text-xs text-tertiary">
            {showImage ? `사진·정보 출처 ${host}` : host}
          </p>
        </div>
        <LinkExternal01 aria-hidden="true" className="size-5 shrink-0 text-fg-quaternary" />
      </div>
    </a>
  );
}
