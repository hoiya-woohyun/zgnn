/**
 * 두 주소가 **같은 곳을 가리키는가** — 정본은 `scripts/lib/addressMatch.mjs` 이고 여기는 타입만 입힌다.
 *
 * 2026-10-04 에 규칙을 .mjs 로 옮겼다. 분석(`pnpm data analyze`, plain node)이 "같은 자리의 신규 후보" 를 묶는 데
 * 같은 판정을 쓰기 시작해서다 — TS 와 .mjs 두 벌이면 분석과 화면이 같은 두 주소를 다르게 부르는 날이 온다.
 * 왜 AI 가 아니라 규칙인지, 왜 지번↔도로명은 `'unknown'` 인지는 그 파일 머리 주석에 있다.
 */

import { addressKey as addressKeyJs, sameAddress as sameAddressJs } from '../../scripts/lib/addressMatch.mjs';

export type TAddressMatch = 'same' | 'different' | 'unknown';

/** 주소 한 줄을 비교용 조각으로. 못 읽으면 null — 그때 판정은 `'unknown'` 이다. */
export type TAddressKey = {
  /** 시·군 하나(`제주시`). 본문 주소가 생략하는 일이 흔해 `null` 이 정상값이다. */
  city: string | null;
  /** 읍·면 하나(`애월읍`). 시내(동 단위) 주소는 `null`. */
  town: string | null;
  /** 도로명 또는 지번 이름. */
  base: string;
  /** 그 뒤의 번호. */
  number: string;
  /** 도로명주소인가 지번주소인가 — 종류가 갈리면 비교하지 않는다. */
  kind: 'road' | 'lot';
};

export function addressKey(address: string | null | undefined): TAddressKey | null {
  return addressKeyJs(address) as TAddressKey | null;
}

/** `'same'` 표기만 달랐다 · `'different'` 다른 가게일 수 있다 · `'unknown'` 못 읽었거나 지번↔도로명이라 비교 불가. */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): TAddressMatch {
  return sameAddressJs(a, b) as TAddressMatch;
}
