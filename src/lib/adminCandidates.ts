/**
 * 검수 화면이 보는 데이터 — `candidates` 행의 타입, 조회, 그리고 CLI 의 순수 함수에 얇은 타입 옷을 입힌 래퍼(ADR-018).
 *
 * 묶기·미리보기·표식 로직을 여기로 **옮기지 않는다.** `scripts/analyze/reviewCandidates.mjs` 가 정본이고 이 파일은
 * 그것을 부른다 — 터미널 검수 창(ADR-024 로 지웠다)과 화면이 같은 후보를 같게 묶으려고 둔 자리이고, 순수 함수와 테스트는 그 파일에 남았다. 그 모듈들이
 * JSDoc 타입만 들고 있어서 경계에서 한 번 캐스팅하고, 그 뒤는 여기 정의한 타입으로만 다룬다.
 *
 * 상대경로로 `../../scripts/...` 를 import 하는 것은 의도다. `@/` 별칭은 src 안만 가리키고,
 * tsconfig 의 `allowJs` 가 이 .mjs 들을 읽어 준다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { groupCandidates, groupFlags, independentPostCount, previewPolicy } from '../../scripts/analyze/reviewCandidates.mjs';
import { townOf } from '../../scripts/analyze/matchPlace.mjs';
import { canonicalRegionRaw, canonicalTown, regionFromBranchName } from '../../scripts/lib/jejuRegions.mjs';
import { parseRegion } from '../../scripts/lib/placeFields.mjs';
import { feeLinesOf, type TCorrectionDrop } from '../../scripts/lib/petPolicyFacts.mjs';
import { parsePetPolicy, toPetBadges, withPolicyFacts, type TPetBadge } from './petPolicy';
import { PLACES } from './places';
import type { TDirection, TPetPolicyFacts, TRegion, TStayEnvironment } from '../types';

export type TCandidateType = 'stay' | 'restaurant' | 'cafe' | 'other';
export type TCandidateTier = 'auto' | 'ask' | 'new';
/**
 * 종류(docs/todo/11 U2) — 승인하면 무슨 일이 일어나나. `tier`(짝이 맞나)와 다른 축이다.
 * 분석이 `extracted.match.kind` 로 싣고(`kindOf`, analyzeCandidates.mjs), 묶음은 `groupCandidates` 가 정한다(갱신이 하나라도 있으면 갱신).
 */
export type TCandidateKind = 'new' | 'fill' | 'update' | 'ask';
export type TCandidateStatus = 'pending' | 'approved' | 'rejected' | 'merged';
export type TPlaceStatus = 'draft' | 'published' | 'archived';

/**
 * `candidates.extracted` jsonb. AI 출력(extractPlaces.mjs)에 분석기·반영기가 얹은 필드까지 한 덩어리다.
 * 색인 시그니처를 남겨 두는 이유: 프롬프트가 바뀌면 새 키가 생기는데, 그때 이 타입이 화면을 막아서는 안 된다.
 * 2026-09-28 의 첫 160건은 `petPolicy`·`visited`·`geo` 가 없다 — 그래서 대부분이 선택 필드다(ADR-017).
 */
/** 두 번째 AI 패스의 판단 한 건. 모양의 정본은 `scripts/analyze/verifyPlaces.mjs` 의 `VERIFY_SCHEMA` 다. */
export type TCandidateVerify = {
  petAllowedHere: 'yes' | 'no' | 'unclear';
  dogWasThere: boolean;
  /** 판단의 근거가 된 본문 문장. 없으면 null — 그때 `petAllowedHere` 는 'yes' 일 수 없다(파서가 내린다). */
  quote: string | null;
  why: string | null;
  promptVersion?: string;
  model?: string;
};

export type TCandidateExtracted = {
  name: string;
  type: TCandidateType;
  regionRaw: string | null;
  regionRawAi?: string | null;
  address: string | null;
  addressAi?: string | null;
  /**
   * 운영자가 주소를 손으로 고쳤다(`buildEdit`). `geoSource` 로는 갈릴 수 없다 — 그 칸은 **좌표**가 어느 축에서
   * 왔는지이고 주소를 고쳐도 남는다. 검수 화면의 '상호 검색으로 확인된 주소' 가 이 칸을 먼저 본다(`adminAddress.ts`).
   */
  addressEdited?: boolean;
  petPolicyText: string | null;
  petPolicy: TPetPolicyFacts | null;
  features?: string | null;
  stayPriceText?: string | null;
  stayAmenitiesText?: string | null;
  /** 숙소 환경(10 F6). 원문 근거가 없는 true 는 추출 단계에서 이미 빠졌다(`correctStayEnvironment`). */
  stayEnvironment?: TStayEnvironment | null;
  visited?: boolean;
  petAllowed?: 'yes' | 'no' | 'unknown';
  evidence?: string[];
  confidence?: number;
  nameKey?: string;
  dupOf?: string | null;
  geo?: { lat: number; lng: number } | null;
  geoSource?: string | null;
  naverLink?: string | null;
  /** 사람이 검수 화면에서 넣은 네이버 플레이스 id(`adminEdit`). AI·검색은 채우지 않는다 — 반영기가 `naver_place_id` 로 옮긴다. */
  naverPlaceId?: string | null;
  /** 공식 홈페이지 카드(`scripts/analyze/homepageCard.mjs`). null 은 "없음 또는 안 읽음". 사진은 URL 뿐이다(ADR-002 v2). */
  homepage?: { url: string; siteName: string | null; image: string | null } | null;
  category?: string | null;
  /**
   * `kind`·`changes` 는 차이 게이트(11 T1.1) 뒤의 후보에만 있다. `changes` 는 갱신이 된 칸(덮어쓰기 칸 이름 —
   * `pet_policy_text`·`stay_price_text`·`stay_environment`).
   */
  match?: { confidence: number; reason: string; tier: TCandidateTier; kind?: TCandidateKind; changes?: string[] };
  /**
   * 교차점검 판단(`scripts/analyze/verifyPlaces.mjs`). **`null`·`undefined` 는 "점검하지 않았다" 다** —
   * 조건 문장이 있었거나, 그 패스가 꺼졌거나(`--no-verify`) 실패했거나, 이 패스가 생기기 전의 후보다.
   * "점검했는데 근거가 없었다" 는 값이 든 객체다. 둘을 섞으면 미점검 후보에 초록 표식이 붙는다.
   */
  verify?: TCandidateVerify | null;
  applied?: unknown;
  [key: string]: unknown;
};

export type TCandidateRow = {
  id: string;
  post_url: string | null;
  extracted: TCandidateExtracted;
  match_place_id: string | null;
  match_confidence: number | null;
  status: TCandidateStatus;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  /** PostgREST 임베딩(`candidates → blog_posts(url)`). 원글 제목·날짜·검색어를 한 번에 가져온다. */
  blog_posts: { title: string | null; posted_at: string; keyword: string; blog_id: string | null } | null;
  /** PostgREST 임베딩(`candidates → places(id)`). 짝지은 기존 장소의 이름·상태. */
  places: { id: string; name: string; status: TPlaceStatus } | null;
};

/** `places` 테이블 행(snake_case). 화면은 이 모양으로 들고 있다가 `fromPlaceRow` 로 앱 타입으로 바꾼다. */
export type TPlaceRow = {
  id: string;
  type: string;
  name: string;
  region_raw: string;
  features: string;
  pet_policy_text: string;
  pet_policy: TPetPolicyFacts | null;
  review_url: string | null;
  naver_url: string | null;
  naver_place_id: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  category: string | null;
  /** 마이그레이션 20260930120000 전의 행에는 칸이 없다 — 그래서 선택. */
  homepage_url?: string | null;
  homepage_name?: string | null;
  homepage_image?: string | null;
  stay_price_text: string | null;
  stay_amenities_text: string | null;
  /** 숙소 환경(마이그레이션 20261001160000 전에는 칸이 없다 — 선택). */
  stay_environment?: TStayEnvironment | null;
  sort: number | null;
  status: TPlaceStatus;
  source: string;
  /** 내린 시각. 트리거가 찍고 되살리면 null 로 돌아간다(`20260929120000_places_archive.sql`). */
  archived_at: string | null;
  /** 게시 상태를 사람이 바꾼 기록(한 줄씩 덧붙임). 쓰는 쪽은 `adminPlaces.ts`. */
  archive_note: string | null;
  /**
   * 사람이 마지막으로 확인한 시각(ADR-021 R5). 마이그레이션 `20261001140000` 전의 원격에는 **칸 자체가 없다** —
   * 그래서 선택이고, 쓰는 쪽은 `'verified_at' in row` 로 칸이 있는지 보고 나서만 쓴다(없는 칸을 쓰면 승인 전체가 실패한다).
   */
  verified_at?: string | null;
};

/**
 * 같은 가게로 묶인 후보들. 만드는 쪽은 `groupCandidates`(reviewCandidates.mjs) — 키(짝 id · 이름 키)로 묶고,
 * 키가 달라도 같은 자리인 신규 묶음끼리 합친다(`mergeSameSpotGroups`). 그래서 한 묶음의 행들이 **이름이 다를 수 있다**.
 */
export type TCandidateGroup = {
  key: string;
  rows: TCandidateRow[];
  lead: TCandidateRow;
  tier: TCandidateTier;
  kind: TCandidateKind;
  visited: boolean;
  hasPolicyText: boolean;
  confidence: number;
  posts: string[];
  /**
   * 독립 글 수 — 같은 블로그 · 같은 제목 틀(며칠 안)의 글을 하나로 센다(`postClusters`). `posts.length` 보다 작으면
   * "글 N건" 이 여러 사람의 말이 아니다(광고성 복제 글). `groupCandidates` 가 채운다 — 없는 손 fixture 는 `posts.length` 로 본다.
   */
  independentPosts?: number;
};

/** 앱이 이 후보의 조건 문장을 어떻게 읽을지(정규식 / AI / 병합 결과). `previewPolicy` 의 결과에 이름을 붙인 것. */
export type TPolicyPreview = {
  regexBadges: string[];
  mergedBadges: string[];
  /**
   * `mergedBadges` 와 **같은 것을 톤까지** 들고 있는 형태. 라벨만으로는 톤을 되찾을 수 없다 —
   * 요금 문장(`1마리당 2만원`)처럼 값 자체가 라벨인 것이 있어서다. 순서의 정본은 `toPetBadges` 하나다.
   */
  mergedBadgeList: TPetBadge[];
  facts: TPetPolicyFacts | null;
  /** AI 판단 중 원문에 근거가 없어 앱이 빼고 보는 것(한국어 한 줄씩). `facts` 는 모델이 낸 그대로다. */
  corrections: string[];
  /** 같은 줄에 원문의 무엇과 대 봤는지를 붙인 것 — `correctionView`(adminCorrection.ts)가 원문 인용에 칠한다. */
  dropped: TCorrectionDrop[];
  flags: string[];
  level: '정보없음' | '동반불가' | '못읽음' | '조건' | '자유';
};

/**
 * 한 번의 조회로 출처(blog_posts)와 짝지은 장소 이름(places)까지 받는다 — 화면이 목록을 그리려면 셋이 다 필요하고,
 * 따로 부르면 후보 160건에 조회가 세 번 난다. 임베딩 테이블에도 운영자 정책이 걸려 있어 권한은 같다.
 */
export const CANDIDATE_SELECT = '*, blog_posts(title,posted_at,keyword,blog_id), places(id,name,status)';

export async function fetchPendingCandidates(client: SupabaseClient): Promise<TCandidateRow[]> {
  // 지금 규모(160건)는 supabase-js 기본 1000행 제한에 못 미친다 — 넘으면 range() 로 페이지네이션(apply-approved.mjs:49 와 같은 주석).
  const { data, error } = await client
    .from('candidates')
    .select(CANDIDATE_SELECT)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw new Error(`후보 조회: ${error.message}`);
  return (data ?? []) as unknown as TCandidateRow[];
}

/**
 * 반영이 중간에 끊긴 후보(`approved`) 수 — 목록에는 `pending` 만 나오므로 이 수를 따로 세지 않으면 그 후보들이 **성공처럼** 사라진다.
 *
 * 쓰기 도중(예: `place_sources` upsert)에 실패하면 후보는 `approved` 로 남는다. 실패는 카드에 빨간 줄로 뜨지만 그 줄은 메모리에만 있어,
 * 새로고침 한 번에 목록에서도 사라지고 머리글은 여전히 "확인할 장소 N곳" 이다 — 사람은 승인이 통과한 줄 안다.
 * 되찾는 길은 터미널의 `pnpm data apply` 하나뿐이므로(ADR-018 "이어받기") 화면이 그 수를 말해 준다.
 */
export async function countStrandedCandidates(client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved');
  if (error) throw new Error(`반영 대기 후보 세기: ${error.message}`);
  return count ?? 0;
}

/**
 * 재대조·병합 대상이 되는 장소 — **상태를 가리지 않는다. 내린 곳(archived)도 포함한다.**
 *
 * 2026-09-29 까지는 `.neq('status','archived')` 였다. 소프트 삭제(`/admin` 의 '내리기')가 생기면서 그 한 줄이
 * **내린 곳을 되살아나게 하는 구멍**이 됐다. 경로가 이렇다 — 폐업한 카페를 내린다 → 다음 달 그 카페를 쓴 블로그 글이
 * 수집된다 → 대조 corpus 에 그 장소가 없으니 `matchPlace` 가 '신규' 로 판정한다 → 운영자 화면에 '신규 · 그 카페' 가
 * 뜬다 → 승인하면 **같은 가게가 새 id 로 다시 게시된다.** 내린 것이 되돌아온 게 아니라 복제본이 생기는 것이고,
 * 빌드·테스트는 전부 통과한다. 이 목록에 archived 를 넣어 두면 `matchPlace` 가 그 장소를 찾아내고,
 * `approveGroup` 의 `target.status === 'archived'` 가지가 사람에게 묻는다(그 가지는 이미 있었다 — 이 줄이 쓸 일을 만든다).
 *
 * `analyze-candidates.mjs:131` · `apply-approved.mjs:58` 도 같은 날 같은 이유로 함께 바꿨다. 세 곳이 같은 corpus 를
 * 봐야 CLI 와 화면이 같은 후보를 같게 판정한다(`adminApply.ts` 머리 주석의 규칙).
 *
 * 0행이면 던진다 — `apply-approved.mjs:61-64` 와 같은 보호다. RLS 나 프로젝트가 어긋나면 PostgREST 는 에러가 아니라
 * `[]` 를 주고, 그대로 가면 재대조가 무력화돼 이미 있는 가게가 전부 신규로 다시 만들어진다.
 */
export async function fetchMatchablePlaces(client: SupabaseClient): Promise<TPlaceRow[]> {
  // `.order('id')` 로 순서를 고정한다 — 없으면 점수가 같은 두 장소 중 승자가 PostgREST 가 돌려준 heap 순서로 정해지고,
  // UPDATE 한 번(내리기·보강)이 그 순서를 바꿔 같은 후보가 어제와 다른 짝을 얻는다(`pull-db.mjs` 와 같은 어법).
  const { data, error } = await client.from('places').select('*').order('id');
  if (error) throw new Error(`장소 조회: ${error.message}`);
  const rows = (data ?? []) as unknown as TPlaceRow[];
  if (rows.length === 0) {
    throw new Error('장소 목록이 비어서 멈췄어요 — 로그아웃하고 다시 로그인해 주세요. 아무것도 바꾸지 않았어요.');
  }
  return rows;
}

/** `groupCandidates` 래퍼. 정렬(검수 순서)까지 그 함수가 한다. */
export function groupPending(rows: TCandidateRow[]): TCandidateGroup[] {
  return groupCandidates(rows) as TCandidateGroup[];
}

/**
 * 독립 글 수(`independentPostCount`) 래퍼 — `urls` 를 주면 그 글만(제안의 근거 글 `basedOn`). 글 정보는 행의 `blog_posts` 임베딩에서 온다.
 */
export function independentPostsOf(rows: readonly TCandidateRow[], urls?: readonly string[]): number {
  return independentPostCount(rows, urls ?? null) as number;
}

/** `previewPolicy` 래퍼 — 앱 파서 세 함수를 주입한다. */
export function previewFor(extracted: TCandidateExtracted): TPolicyPreview {
  return previewPolicy(extracted, { parsePetPolicy, toPetBadges, withPolicyFacts }) as TPolicyPreview;
}

/** `groupFlags` 래퍼 — 표식 다섯 개를 그대로 돌려준다. 화면 표기(라벨·색·자리)는 `adminPreview.ts` 가 정한다. */
export function flagsFor(group: TCandidateGroup): string[] {
  return groupFlags(group) as string[];
}

/** 이 지역 문자열로 장소를 만들 수 있는가. `toNewPlaceRow` 가 같은 검사로 반영을 막는다(applyApproved.mjs:107). */
export function regionUsable(raw: string | null | undefined): boolean {
  if (!raw || raw.trim() === '') return false;
  return (parseRegion(raw) as TRegion).direction !== 'unknown';
}

const DIRECTION_ORDER: TDirection[] = ['east', 'west', 'south', 'north', 'udo', 'unknown'];

/**
 * '지역 고르기' 선택지 — 기존 86곳이 실제로 쓰는 **읍·면**이다. 새 읍·면을 만들지 않는 이유:
 * `region_raw` 는 읍·면 칩과 방향 필터의 유일한 입력이라, 데이터에 없는 읍·면을 넣으면 그 장소 혼자 다른 칩을 단다.
 *
 * 읍·면 하나당 **한 줄만**, 표기는 정본(`canonicalRegionRaw` — scripts/lib/jejuRegions.mjs)이다(2026-10-04). 그 전에는
 * `방향|읍·면` 문자열을 키로 모아 시드의 비정규 표기가 따로 섰다 — `서쪽 (안덕면)`/`남쪽 (안덕면)`(개떼목장 하나가 서쪽),
 * `남쪽 (서귀포)`/`남쪽 (서귀포시)`(그리너리빌리지 펜션 하나가 '서귀포'). 거리 이름이 붙은 raw(`남쪽 (서귀포시 월평로)`)도 읍·면으로 접힌다.
 * 정본 표에 없는 읍·면이 데이터에 생기면 그 표기를 그대로 둔다(가장 짧은 것) — 사라지는 것보다 낫다.
 * 이미 게시된 장소의 비정규 값은 DB 라 여기서 고치지 않는다(`regionCheck.mjs` 가 경고한다).
 */
const regionByTown = new Map<string, TRegion>();
for (const place of PLACES) {
  const town = canonicalTown(place.region.town) as string;
  const raw = (canonicalRegionRaw(town) as string | null) ?? place.region.raw;
  const region = parseRegion(raw) as TRegion;
  const seen = regionByTown.get(town);
  if (!seen || region.raw.length < seen.raw.length) regionByTown.set(town, region);
}

export const REGION_OPTIONS: string[] = [...regionByTown.values()]
  .sort(
    (a, b) =>
      DIRECTION_ORDER.indexOf(a.direction) - DIRECTION_ORDER.indexOf(b.direction) ||
      a.town.localeCompare(b.town, 'ko'),
  )
  .map((region) => region.raw);

/**
 * '지역 고르기' 의 선택지를 **주소의 읍·면으로 가른다** — 순수. 고르는 것은 여전히 사람이다.
 *
 * 이 셀렉트가 뜨는 후보는 분석이 지역을 못 정한 것이다. 주소에 읍·면이 있으면 그 선택지를 위로 올린다 —
 * 20여 개 목록에서 찾게 두지 않는다. 주소에 읍·면이 없으면(시내·주소 없음) 목록 그대로다.
 *
 * `name` 을 주면 **이름의 지점 꼬리**로 정한 지역을 `preset` 으로 돌려준다(2026-10-04 — `regionFromBranchName`).
 * 이미 쌓인 후보는 분석의 새 폴백(`resolveRegionRaw`)을 못 받았으므로 화면이 그때그때 계산해 **미리 고른 값**으로 둔다.
 * 저장은 여전히 운영자가 누른다 — 꼬리의 지명이 틀릴 수 있다("공항점" 은 안 잡지만 같은 이름의 리가 두 읍·면에 있는 곳이 있다).
 * 주소의 읍·면과 갈리거나 선택지에 없는 값이면 preset 을 내지 않는다 — 주소가 더 센 근거다.
 */
export function regionOptionsFor(
  address: string | null | undefined,
  name?: string | null,
): { town: string | null; suggested: string[]; rest: string[]; preset: string | null } {
  const fromName = (regionFromBranchName(name ?? null) as string | null) ?? null;
  const town = townOf(address ?? '') as string | null;
  const suggested = town ? REGION_OPTIONS.filter((option) => option.includes(town)) : [];
  // 선택지에 있는 값만 — 셀렉트가 그릴 수 없는 값을 미리 고를 수는 없다.
  const preset = fromName && REGION_OPTIONS.includes(fromName) && (!town || fromName.includes(town)) ? fromName : null;
  if (!suggested.length) {
    if (!preset) return { town: null, suggested: [], rest: REGION_OPTIONS, preset: null };
    return { town: null, suggested: [preset], rest: REGION_OPTIONS.filter((option) => option !== preset), preset };
  }
  return { town, suggested, rest: REGION_OPTIONS.filter((option) => !option.includes(town!)), preset };
}

export const TYPE_LABEL: Record<TCandidateType, string> = {
  stay: '숙소',
  restaurant: '식당',
  cafe: '카페',
  other: '기타',
};

/**
 * 화면 표기.
 * 걸러 보기 칩(adminPage.tsx)과 카드 뱃지(adminPageGroupCard.tsx)가 **둘 다** 이것을 읽는다 — 값이 갈리지 않게.
 *
 * **두 자로 통일했다**(2026-09-30). 앞선 두 판이 다 안 읽혔다:
 *   `일치`·`확인요청`(CLI 말) — 무엇과 일치인지·누가 요청하는지를 말하지 않는다.
 *   `이미 있는 곳`·`같은 곳일까요?`·`처음 보는 곳` — 길이가 제각각이라 **세로로 훑을 수가 없고**,
 *   문장처럼 읽혀 운영자가 "그래서 뭐가 다른데" 를 물었다(사용자 지적, 2026-09-30).
 * 지금 말은 **기존 장소와의 관계** 한 축을 두 자로 세운다. `기존`·`확인` 뒤에는 짝지은 이름이 화살표로 붙으므로
 * (`adminPageGroupCard`) "어느 곳과" 는 라벨이 아니라 그 이름이 말한다 — 라벨은 자리만 지키면 된다.
 * 141묶음을 훑는 화면에서 칩 폭이 같다는 것이 곧 속도다(`adminTable.tsx` 머리 주석의 같은 값).
 */
export const TIER_LABEL: Record<TCandidateTier, string> = {
  /** 승인하면 그 장소의 빈 칸을 채운다(`mergeIntoExisting`). */
  auto: '기존',
  /** 같은 곳인지 사람이 정한다 — 합치거나 새로 만든다. */
  ask: '확인',
  /** 짝이 없다. 승인하면 새 장소가 생긴다. */
  new: '신규',
};

/**
 * 종류 표기(11 U2) — `TIER_LABEL` 과 같은 두 자. 칩은 짝이 `기존` 인 묶음에만 선다(신규·확인은 `TIER_LABEL` 이 이미 그 말이다).
 * 걸러 보기(adminPage.tsx)도 이것을 읽는다.
 */
export const KIND_LABEL: Record<TCandidateKind, string> = {
  /** 이미 찬 칸과 다른 사실을 말한다 — 덮어쓰기(칸 고르기). */
  update: '갱신',
  /** 빈 칸만 채운다 — 합치기. */
  fill: '보강',
  new: '신규',
  ask: '확인',
};

/**
 * 반려 사유 칩. 자유 입력만 두면 매번 다른 말이 적혀 나중에 "왜 반려했나" 를 셀 수 없다.
 * 목록은 첫 160건에서 실제로 나온 갈래다(목록글 101 · 홍보 13, docs/todo/README).
 */
export const REJECT_REASONS = ['목록글', '홍보·협찬', '폐업', '제주 아님', '중복', '동반 불가', '정보 부족'] as const;

/**
 * 갱신 묶음의 반려 사유(11 U8 · §4-4 ⑤). 신규용 칩과 뜻이 달라 따로 둔다 — 갱신에서 `중복` 을 고르면 "이미 있는 곳" 이라는 당연한 말이 되고,
 * `폐업`·`동반 불가` 는 반려가 아니라 **사이트를 바꿀 입구**다(그 글이 맞다면 덮어쓰기·등록 해제로 간다). "사이트가 맞아요" 는 칩이 아니라
 * 결정 줄의 버튼이다(`confirmSite` — 확인 날짜를 찍는다). "다른 가게예요" 도 칩이 아니다 — 짝이 틀린 것이라 글은 새 장소 후보이고,
 * 결정 줄의 `짝이 틀렸어요 — 새 장소로` 가 그 길이다(반려하면 그 글이 사라진다).
 */
export const UPDATE_REJECT_REASONS = ['글이 더 오래됨', '홍보·협찬', '정보 부족'] as const;

export type TRejectReason = (typeof REJECT_REASONS)[number] | (typeof UPDATE_REJECT_REASONS)[number];

/** 칩의 뜻 한 줄(화면 전용). 값(`REJECT_REASONS`)은 `reviewer_note` 에 적히므로 못 바꾼다 — 뜻만 화면에서 말한다. */
export const REJECT_REASON_HINT: Record<TRejectReason, string> = {
  목록글: '가보지 않고 이름만 나열한 글이에요',
  '홍보·협찬': '광고·협찬 글이라 조건을 믿을 수 없어요',
  폐업: '지금은 문을 닫은 가게예요',
  '제주 아님': '제주 밖 가게예요',
  중복: '이미 등록한 장소와 같은 가게예요',
  '동반 불가': '강아지를 데려갈 수 없는 가게예요',
  '정보 부족': '동반 조건을 알 만한 내용이 없어요',
  '글이 더 오래됨': '사이트 값이 더 최근 정보예요 — 이 글은 옛 사실을 말해요',
};

/** `factsLine` 이 "판단은 있는데 조각이 0개" 를 말하는 센티넬. 화면이 이 리터럴을 인라인하지 않게 이름을 준다. */
export const FACTS_EMPTY = '(판단 없음)';

/**
 * AI 판단(`petPolicy`)을 한국어 한 줄로. 터미널 검수 창의 `factsLine` 과 같은 규칙으로 시작했다(그 창은 ADR-024 로 지웠다).
 */
export function factsLine(facts: TPetPolicyFacts | null): string | null {
  if (!facts) return null;
  const parts: string[] = [];
  if (facts.indoor !== 'unknown') {
    parts.push({ free: '실내 자유', cage: '실내 케이지', outdoorOnly: '야외만' }[facts.indoor]);
  }
  if (facts.leash) parts.push('리드줄');
  if (facts.largeDogOk === true) parts.push('대형견 OK');
  if (facts.largeDogOk === false) parts.push('대형견 불가');
  if (facts.smallDogOnly) parts.push('소형견만');
  if (facts.weightLimitKg != null) parts.push(`~${facts.weightLimitKg}kg`);
  if (facts.maxDogs != null) parts.push(`최대 ${facts.maxDogs}마리`);
  if (facts.feeFree === true) parts.push('추가요금 없음');
  // 요금은 줄마다 하나 — 첫 줄만 넣으면 구간 요금표의 나머지가 이 줄에서도 사라진다(`feeLinesOf`).
  parts.push(...feeLinesOf(facts));
  if (facts.callFirst) parts.push('전화 확인');
  if (facts.vaccineRequired) parts.push('예방접종 필수');
  if (facts.petDays?.length) parts.push(`${facts.petDays.join('·')}요일만`);
  if (facts.notes) parts.push(facts.notes);
  return parts.length ? parts.join(' · ') : FACTS_EMPTY;
}

/** 장소 id → 검수 대기의 갱신 묶음 수(11 T3.2) — 등록 완료 줄이 `검수 대기에 갱신 N` 을 단다. 순수. */
export function updateGroupsByPlace(groups: readonly Pick<TCandidateGroup, 'kind' | 'lead'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of groups) {
    const placeId = group.lead.match_place_id;
    if (group.kind !== 'update' || !placeId) continue;
    out[placeId] = (out[placeId] ?? 0) + 1;
  }
  return out;
}
