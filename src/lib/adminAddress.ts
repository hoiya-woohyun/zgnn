/**
 * 후보의 주소가 **어디서 왔고 검증됐는가** — 검수 화면이 주소 한 줄에 무엇을 적을지 정한다.
 *
 * 왜 있나 — 후보에는 주소가 둘 실리고(`extracted.address` · `extracted.addressAi`) 화면은 앞의 것만 '주소' 로
 * 적었다. 그런데 그 한 칸의 뜻이 축마다 다르다(`analyzeCandidates.mjs` 의 `toCandidateRow`):
 *
 * | `geoSource` | `address` 가 무엇인가 | 원글 주소와 대조하면 |
 * |---|---|---|
 * | `'local'`   | **상호 검색이 준 주소** — 이름이 정규화 후 완전 일치한 업체의 등록 주소 | 뜻이 있다 |
 * | `'geocode'` | 원글 주소를 좌표로 바꾼 뒤 그 표준 표기 | **순환이다** — 원본이 원글 주소다 |
 * | 없음        | 상호 검색·주소 축이 둘 다 실패해 남은 **원글 주소 그대로** | 순환이다(같은 값이다) |
 *
 * 가운데 줄이 이 파일을 만든 이유다. `geocode` 축의 주소는 원글 주소에서 나왔으므로 둘을 견줘 '같다' 가 나와도
 * 아무것도 확인한 것이 아닌데, 화면은 그 '같다' 를 **경보가 없는 상태**로 그려 왔다 — 확인된 주소와 구별되지 않는다.
 * 검증(`verified`)은 **상호 검색 축 하나만** 참이고, 나머지는 "확인 못 했다" 로 말한다. ADR-019 의 `verify: null` 과
 * 같은 규칙이다: 안 본 것을 봤다고 하지 않는다.
 *
 * 대조는 여기서 하지 않고 `sameAddress`(addressMatch.ts) 가 한다 — 표기 차이를 걷어 내는 규칙은 그 파일이 정본이다.
 * 이 파일이 정하는 것은 **대조에 뜻이 있는 축인가**와 화면에 적을 말이다.
 *
 * 앱 런타임(`src/lib/`)에 두는 이유도 `addressMatch` 와 같다 — 이미 쌓인 후보가 다음 분석을 기다리지 않는다.
 */
import { sameAddress } from './addressMatch';

/**
 * 주소가 온 축.
 *  `naverLocal`   상호 검색(이름 → 업체). **이것만 검증된 주소다.**
 *  `naverGeocode` 원글 주소 → 좌표(NCP Geocoding). 표기는 표준이지만 출처는 원글이다.
 *  `blogOnly`     두 축이 다 실패해 원글 주소가 그대로 남았다.
 *  `operator`     운영자가 고쳐 넣었다 — 네이버가 무엇을 줬는지는 덮여서 이제 알 수 없다.
 *  `missing`      주소가 없다.
 */
export type TAddressAxis = 'naverLocal' | 'naverGeocode' | 'blogOnly' | 'operator' | 'missing';

/** 원글 주소 대조 한 줄. `warn` 은 동명 오채택 의심이고, `quiet` 는 참고다(경보로 그리지 않는다). */
export type TAddressCross = { tone: 'warn' | 'quiet'; text: string };

export type TAddressView = {
  axis: TAddressAxis;
  address: string | null;
  /** 상호 검색이 확인해 준 주소인가. 화면의 '확인' 표식은 **이 값만** 본다. */
  verified: boolean;
  /** 어디서 온 주소인지 한 줄. 접힌 줄의 짧은 표식은 `shortLabel`. */
  sourceText: string;
  /** 접힌 줄에 붙일 한 단어. 검증됐으면 null — 줄마다 뱃지를 달면 아무것도 눈에 안 띈다. */
  shortLabel: string | null;
  /** 원글 주소 대조. 대조가 순환인 축(`naverGeocode`·`blogOnly`)에서는 null. */
  cross: TAddressCross | null;
  /** 사람이 직접 확인하는 유일한 길 — 브라우저에는 네이버 키가 없다(ADR-016). */
  mapUrl: string | null;
};

/**
 * `pickNaverPlace` 가 쓴 것과 같은 검색어로 네이버 지도를 연다(`toNaverQuery` 와 같은 규칙) — 사람이 같은 것을 보게.
 * **주소를 검색어에 붙이지 않는다**: 주소가 틀렸을 때 그 주소로 찾으면 틀린 곳이 그대로 나와 확인이 되지 않는다.
 */
function mapSearchUrl(name: string | null | undefined): string | null {
  const place = (name ?? '').trim();
  if (!place) return null;
  const query = place.startsWith('제주') ? place : `제주 ${place}`;
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

/** 원글 주소와 견준다. 대조에 뜻이 있는 축에서만 부른다. */
function crossCheck(address: string, addressAi: string | null): TAddressCross {
  if (!addressAi) return { tone: 'quiet', text: '원글에는 주소가 적혀 있지 않아 대조하지 못했어요' };
  switch (sameAddress(address, addressAi)) {
    case 'same':
      return { tone: 'quiet', text: '원글에 적힌 주소와 같은 곳이에요' };
    case 'different':
      return {
        tone: 'warn',
        text: `원글에는 다른 주소가 적혀 있어요 — ${addressAi} · 검색이 동명의 다른 가게를 집었을 수 있어요`,
      };
    /* 지번↔도로명은 조회해야 아는 것이라 판단하지 않는다(ADR-019 결정 4) — 색도 굵기도 주지 않는다. */
    default:
      return { tone: 'quiet', text: `원글 표기 — ${addressAi}` };
  }
}

/**
 * 주소 한 줄에 적을 것 전부.
 *
 * `addressOverride` 는 고치기 폼이 쓴다 — 저장 전 초안을 그대로 대조해 보게 한다. 넘기면 축은 `operator` 가
 * 되지만(네이버가 준 값이 아니다) **대조는 계속 돈다**: 이름·주소를 고치는 가장 흔한 이유가 "동명의 다른 가게를
 * 집었다" 이고, 그때 사람이 확인하려는 것이 정확히 "이제 원글과 맞나" 다.
 *
 * @param extracted 후보의 `extracted`
 * @param addressOverride 고치기 초안의 주소(있으면 이것을 본다)
 */
export function addressView(
  extracted: {
    name?: string | null;
    address?: string | null;
    addressAi?: string | null;
    geoSource?: string | null;
    /** 운영자가 주소를 고쳤다는 표식(`buildEdit`). `geoSource` 는 좌표의 출처라 주소를 고쳐도 남는다. */
    addressEdited?: boolean;
  },
  addressOverride?: string,
): TAddressView {
  const stored = (extracted.address ?? '').trim();
  const address = (addressOverride ?? stored).trim();
  const addressAi = (extracted.addressAi ?? '').trim() || null;
  /*
   * 저장된 표식이 **먼저다.** 초안만 보면 이미 고쳐진 후보에서 폼을 열기만 했을 때(주소를 안 건드렸을 때)
   * 축이 `naverLocal` 로 되돌아가, 손으로 적은 주소 밑에 초록 '상호 검색으로 확인된 주소' 가 다시 뜬다 —
   * 이 파일이 없애려던 거짓말이 폼 안에서 되살아나는 자리다.
   */
  const edited =
    Boolean(extracted.addressEdited) || (addressOverride !== undefined && addressOverride.trim() !== stored);
  const mapUrl = mapSearchUrl(extracted.name);

  if (!address) {
    return {
      axis: 'missing',
      address: null,
      verified: false,
      sourceText: '주소가 없어요 — 지도에 안 보이고, 합칠 곳을 찾는 대조도 약해져요',
      shortLabel: '주소 없음',
      cross: null,
      mapUrl,
    };
  }

  if (edited) {
    return {
      axis: 'operator',
      address,
      verified: false,
      sourceText: '운영자가 고친 주소예요 — 상호 검색이 준 값은 덮였어요',
      shortLabel: '직접 고침',
      cross: crossCheck(address, addressAi),
      mapUrl,
    };
  }

  if (extracted.geoSource === 'local') {
    return {
      axis: 'naverLocal',
      address,
      verified: true,
      sourceText: '상호 검색으로 확인된 주소예요 — 이름이 완전히 일치한 업체의 등록 주소',
      shortLabel: null,
      cross: crossCheck(address, addressAi),
      mapUrl,
    };
  }

  if (extracted.geoSource === 'geocode') {
    return {
      axis: 'naverGeocode',
      address,
      verified: false,
      /* 대조를 걸지 않는다 — 이 주소의 원본이 원글 주소라 '같다' 가 나와도 확인한 것이 없다. */
      sourceText: '원글에 적힌 주소를 표준 표기로 바꾼 것이에요 — 상호 검색으로는 확인하지 못했어요',
      shortLabel: '원글 주소',
      cross: null,
      mapUrl,
    };
  }

  /*
   * `geoSource` 가 없다. 지금은 두 축이 다 실패한 경우뿐이지만(2026-09-30 실측: pending 58건 중 6건, 전부 주소도 없다),
   * 이 칸이 생기기 전의 후보도 여기로 온다. 그때 "확인 못 했다" 는 **덜 말하는 쪽으로** 틀린다 —
   * 검증됐다고 말해 놓고 아닌 것보다 낫다.
   */
  return {
    axis: 'blogOnly',
    address,
    verified: false,
    sourceText: '원글에 적힌 주소 그대로예요 — 상호 검색으로는 확인하지 못했어요',
    shortLabel: '원글 주소',
    cross: null,
    mapUrl,
  };
}

/** 나갈 주소와 원글 주소가 정말 다르다 — 두 값. */
export type TAddressConflict = {
  address: string;
  sourceAddress: string;
  /** 나갈 주소를 운영자가 고쳤다 — 레일이 '네이버 주소' 라고 부르지 않게. */
  edited: boolean;
};

/**
 * 승인을 **멈춰야 하는** 주소 충돌인가 — 접힌 줄의 `주소 다름` 뱃지와 같은 판정(`cross.tone === 'warn'`)이다.
 *
 * 멈추는 이유: 이 경보가 뜨는 뜻은 보통 상호 검색이 동명의 다른 가게를 집었다는 것이고(실측: 엔젤하우스 `대포로 93` ↔
 * `신엄안3길 95`), 그대로 올리면 엉뚱한 주소·좌표·지역이 `places` 로 들어간다. 뱃지만 띄우고 승인 버튼을 그대로 두면
 * 한 번의 클릭(또는 일괄 올리기)이 그것을 지나간다. 판정을 따로 만들지 않고 `addressView` 를 부르는 이유 —
 * 뱃지와 가드가 서로 다른 규칙으로 갈리면 "뱃지는 떴는데 막히지 않는" 칸이 다시 생긴다.
 */
export function addressConflictOf(extracted: Parameters<typeof addressView>[0]): TAddressConflict | null {
  const view = addressView(extracted);
  if (view.cross?.tone !== 'warn' || !view.address) return null;
  const sourceAddress = (extracted.addressAi ?? '').trim();
  return sourceAddress ? { address: view.address, sourceAddress, edited: view.axis === 'operator' } : null;
}
