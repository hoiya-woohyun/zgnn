'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** 종류가 빠진 `/places` 의 기본 도착점. 둘러보기 탭과 같은 곳이다(`navItems`). */
const DEFAULT_PLACES_ROUTE = '/places/stay';

/**
 * `/places` 를 둘러보기로 보낸다(D5 — 예전엔 404 였다). 정적 HTML 이라 리다이렉트는 브라우저에서만
 * 일어난다 — 스크립트가 늦거나 막혀도 갈 곳이 보이도록 링크를 **처음부터** 그려 둔다.
 * `replace` 라 뒤로가기가 이 중간 화면에 걸리지 않는다.
 */
export function PlacesIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(DEFAULT_PLACES_ROUTE);
  }, [router]);

  return (
    <div className="px-4 pt-20 text-center md:px-6">
      <p className="text-sm text-tertiary">둘러보기로 가는 중이에요…</p>
      <Link
        href={DEFAULT_PLACES_ROUTE}
        replace
        className="mt-3 inline-flex min-h-11 items-center px-3 text-sm font-semibold text-brand-secondary underline underline-offset-4"
      >
        둘러보기로 가기
      </Link>
    </div>
  );
}
