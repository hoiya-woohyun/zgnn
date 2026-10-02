'use client';

import { CheckDone01 } from '@untitledui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '../components/base/button';
import { Select } from '../components/base/select';
import { EmptyState } from '../components/layout/emptyState';
import { PageHeader } from '../components/layout/pageHeader';
import { approveGroup, saveEdit, setRegion } from '../lib/adminApply';
import {
  archiveAndBlock,
  archiveOutcomeText,
  fetchBlockCounts,
  fetchPlaceBlocks,
  rejectAndBlock,
  rejectOutcomeText,
  restoreAndLift,
  setPlaceBlock,
  type TBlockChoice,
  type TBlocksSummary,
  type TPlaceBlock,
} from '../lib/adminBlocks';
import { aiOriginalOf, buildEdit, chooseAddress, type TCandidateEditDraft } from '../lib/adminEdit';
import { addressUnresolved, type TAddressChoice } from '../lib/adminAddress';
import { prepareReanalyze, reanalyzePlan, reanalyzeSummary } from '../lib/adminReanalyze';
import { bulkApproveNeedsLook, bulkApproveSummary, bulkApproveText, bulkLatestSummary, bulkLatestTargets, summarizeBulk, type TBulkTally } from '../lib/adminBulk';
import {
  countStrandedCandidates,
  fetchMatchablePlaces,
  fetchPendingCandidates,
  flagsFor,
  groupPending,
  previewFor,
  TIER_LABEL,
  TYPE_LABEL,
  type TCandidateGroup,
  type TCandidateRow,
  type TPlaceRow,
  type TRejectReason,
} from '../lib/adminCandidates';
import {
  fetchManagedPlaces,
  markPlaceVerified,
  sortManagedPlaces,
  type TArchiveReason,
  type TPlaceAddressPatch,
  updatePlaceAddress,
} from '../lib/adminPlaces';
import { countPosts, type TPostCounts } from '../lib/adminPosts';
import {
  closeReportsForArchived,
  fetchReports,
  mergeReportRows,
  openReportsByPlace,
  openSuggestions,
  reportHeadline,
  setReportStatus,
  type TReportRow,
  type TReportsLoad,
  type TVisitedTally,
  visitedTallyByPlace,
} from '../lib/adminReports';
import { adminFlagView } from '../lib/adminPreview';
import { verifyNeedsLook } from '../lib/adminVerify';
import { fetchRebuildStatus, rebuildHeadline, type TRebuildHeadline } from '../lib/adminRebuild';
import {
  allSelected as allKeysSelected,
  clearKeys,
  EMPTY_SELECTION,
  selectKeys,
  summarizeBulkReject,
  toggleSelected,
  visibleSelection,
  type TSelection,
} from '../lib/adminSelection';
import {
  ADMIN_SESSION_KEY,
  clearAdminSession,
  readAdminSession,
  sessionProblem,
  type TAdminSession,
} from '../lib/adminSession';
import { createAdminClient, isOperator } from '../lib/adminSupabase';
import {
  parseAdminUrl,
  writeAdminUrl,
  type TAdminTab,
  type TPolicyFilter,
  type TTierFilter,
  type TTypeFilter,
  type TWarnFilter,
} from '../lib/adminUrlState';
import { cx } from '../utils/cx';
import { useAdminInfiniteScroll } from './adminInfiniteScroll';
import { AdminPageBlocksPanel } from './adminPageBlocksPanel';
import { AdminPageBulkBar } from './adminPageBulkBar';
import { AdminPageGroupCard, type TAdminPageGroupState, type TApproveChoice } from './adminPageGroupCard';
import { AdminPageLogin } from './adminPageLogin';
import { AdminPagePlaceList } from './adminPagePlaceList';
import type { TAdminPagePlaceState } from './adminPagePlaceRow';
import { AdminPagePostsPanel } from './adminPagePostsPanel';
import { AdminPageSuggestions } from './adminPageSuggestions';
import { ADMIN_CANDIDATE_GRID, AdminTable } from './adminTable';

/**
 * 운영자 검수 화면(ADR-018). 후보(candidates)를 묶어 보여 주고, "맞아요" 한 번으로 `places` 까지 반영한다.
 *
 * 상태 머신: `checking`(저장된 세션 확인) → `signedOut` → `verifying`(운영자인가) → `notOperator`
 *            → `loading`(후보·장소 조회) → `ready` | `error`.
 * 갈래를 문구 하나로 뭉개지 않는 이유 — 비운영자에게 RLS 는 빈 결과를 주므로 "확인할 장소가 없어요" 와
 * "검수 권한이 없어요" 가 같은 화면이 되기 쉽다. 그러면 사람이 진짜로 다 끝난 줄 안다.
 *
 * 쓰기는 전부 `src/lib/adminApply.ts` 가 한다 — 이 파일은 상태와 문구만 소유한다.
 * 실패를 **삼키지 않는다**: 카드 안에 빨간 한 줄로 남긴다. 삼키면 사람이 두 번 누르고 장소가 두 개 생긴다.
 *
 * 뒤로가기·상태바 인셋·스와이프는 셸 몫이라 여기서 아무것도 붙이지 않는다(ADR-007 · ADR-010 · ADR-014).
 */

/** 한 번에 더 그리는 줄 수. 줄이 얇아져(표) 20 은 PC 한 화면도 못 채운다 — 감시판이 곧바로 또 보인다. */
const PAGE_SIZE = 40;

/**
 * 열 이름. '이름' 이 아니라 '장소' 인 것은 이 칸이 이름 하나가 아니라 **승인을 막거나 미루는 표식까지** 담아서다.
 *
 * `AI 요약` 은 `extracted.features` 다 — 승인되면 그대로 사이트의 소개 문구가 된다.
 * `강아지 요금`·`필요 장비` 는 `동반 조건` 으로 되돌렸다(2026-09-30 v2) — 21줄 중 2~3줄만 차는 열이었다(`adminTable.tsx`).
 */
const COLUMNS = ['장소', '지역', '동반 조건', 'AI 요약', '종류'];
/** 끝난 카드가 초록 한 줄로 남아 있는 시간. 바로 지우면 "눌렀는데 아무 일도 안 났다" 로 보인다. */
const DONE_LINGER_MS = 3000;

type TPhase = 'checking' | 'signedOut' | 'verifying' | 'notOperator' | 'loading' | 'ready' | 'error';

/**
 * 다섯 칸 = 네 개체(09 D4): 수집 완료(글) · 검수 대기(후보) · 등록 완료·등록 해제(장소, `status` 로 가른다) · 블랙리스트(`place_blocks`).
 * 올리는 일과 내리는 일을 한 목록에 섞지 않는다 — 섞으면 "맞아요" 옆에 "내리기" 가 붙어 실수 한 번의 값이 달라진다.
 * 칸의 정체는 `?tab=` 쿼리에 실린다(`adminUrlState.ts`).
 */
type TTab = TAdminTab;

const NO_REPORTS_BY_PLACE: Record<string, TReportRow[]> = {};
const NO_VISITED: Record<string, TVisitedTally> = {};
const NO_SUGGESTIONS: TReportRow[] = [];

/** 탭 줄의 라벨(건수는 붙이는 쪽이 정한다) — 왼쪽에서 오른쪽이 파이프라인 순서다. */
const TAB_LABELS: { key: TTab; label: string }[] = [
  { key: 'posts', label: '수집 완료' },
  { key: 'candidates', label: '검수 대기' },
  { key: 'places', label: '등록 완료' },
  { key: 'archived', label: '등록 해제' },
  { key: 'blocks', label: '블랙리스트' },
];

/**
 * 머리글의 `?` 가 말하는 것 — 화면 곳곳의 설명문을 여기 모았다(2026-09-30 v2). 운영자는 한 명이고 매일 보므로,
 * 칸·버튼마다 붙은 한 줄은 첫날 이후 소음이다. 화면에 남는 문장은 **예외일 때만**이다(주소 고르기 · 내린 곳 · 근거 없음 …).
 */
const HELP = [
  '여기서 바꾼 것은 사이트가 다시 빌드된 뒤에 보여요.',
  '줄을 누르면 근거(원문 · 나갈 값 · 블로그 인용)가 펼쳐지고, 그 끝에서 이 줄을 올리거나 제외해요.',
  '제외: 사유를 고르면 후보는 목록에서 빠져요. 「블랙리스트에」 를 3개월·영구로 고르면 그 가게 이름의 새 글도 한동안 후보로 올라오지 않아요.',
  '줄 앞 체크박스로 여러 곳을 고르면 표 위에 한꺼번에 처리하는 줄이 떠요.',
  '올리기: 짝이 있으면 그 장소의 빈 칸만 채우고, 없으면 새 장소로 올라가요. 덮어쓰기: 짝의 칸을 새 분석 값으로 바꿔요.',
  '재분석: 그 글을 수집 완료로 되돌려요(지우지 않아요). 터미널에서 pnpm data:analyze 를 돌리면 다시 읽어요.',
].join('\n');

type TBulkMode = 'reject' | 'reanalyze' | 'approve' | 'latest';

/*
 * 동반 조건 축(`TPolicyFilter`)은 세 상태다. **불리언 토글 둘로 두지 않는다** — '조건이 적힌 것' 과 '교차점검이 근거를 못 찾은 것' 은
 * 교집합이 없다(교차점검은 조건 문장이 없는 후보에만 돈다). 토글 둘이면 둘을 같이 켤 수 있고 그 목록은 늘 빈다.
 * 걸러 보기 네 축의 타입은 주소 쿼리가 같이 읽고 써야 해서 `adminUrlState.ts` 가 소유한다.
 */

/**
 * 경고 축(2026-09-30 v2). 21줄을 다 훑어야 경고를 찾던 자리다 — 올리기 전에 사람이 봐야 하는 세 가지만 센다.
 * `any` 는 셋의 합집합이고, 각 선택지는 서로 겹칠 수 있다(한 줄이 지역도 없고 주소도 다를 수 있다).
 */

const WARN_MATCH: Record<Exclude<TWarnFilter, 'all' | 'any'>, (card: { group: TCandidateGroup; view: { badges: { key: string }[] } }) => boolean> = {
  region: (card) => card.view.badges.some((badge) => badge.key === '지역 없음'),
  address: (card) => addressUnresolved(card.group.lead.extracted),
  noBasis: (card) => verifyNeedsLook(card.group.lead.extracted.verify),
};

const WARN_FILTERS: { key: TWarnFilter; label: string; hint?: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'any', label: '경고 있는 것', hint: '아래 셋 중 하나라도 걸린 곳' },
  { key: 'region', label: '지역 없음', hint: '지역을 골라야 올릴 수 있어요' },
  { key: 'address', label: '주소 다름', hint: '원글 주소와 검색 주소 중 하나를 골라야 올릴 수 있어요' },
  { key: 'noBasis', label: '동반 근거 없음', hint: '교차점검이 강아지를 데려간 근거를 못 찾은 곳' },
];

const warnMatches = (filter: TWarnFilter, card: { group: TCandidateGroup; view: { badges: { key: string }[] } }): boolean =>
  filter === 'all' ||
  (filter === 'any' ? Object.values(WARN_MATCH).some((match) => match(card)) : WARN_MATCH[filter](card));

const POLICY_FILTERS: { key: TPolicyFilter; label: string; hint?: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'has', label: '조건이 적힌 것', hint: '블로그 본문에 동반 조건 문장이 있는 후보' },
  { key: 'needsLook', label: '동반 근거 없는 것', hint: '교차점검이 본문에서 강아지를 데려간 근거를 못 찾은 후보' },
];

const POLICY_FILTER_MATCH: Record<Exclude<TPolicyFilter, 'all'>, (card: { group: TCandidateGroup }) => boolean> = {
  has: (card) => card.group.hasPolicyText,
  needsLook: (card) => verifyNeedsLook(card.group.lead.extracted.verify),
};

/**
 * 걸러 보기는 **두 축**이다. 앞의 넷은 서로 배타적인 한 축(기존 장소와의 관계)이고,
 * '조건이 적힌 것만' 은 그 축을 가로지르는 따로 켜는 토글이다. 한 줄에 다섯을 같은 모양으로 두었을 때는
 * 조건 토글이 tier 필터를 **대체해서**, 조건 없는 후보(142묶음 중 112)가 통째로 사라진 목록을
 * 운영자가 "다 봤다" 로 읽었다.
 */
const TIER_FILTERS: { key: TTierFilter; label: string; hint?: string; match: (group: TCandidateGroup) => boolean }[] = [
  { key: 'all', label: '전체', match: () => true },
  // 라벨은 표의 뱃지(`기존`·`확인`·`신규`)와 같은 두 자로 시작하고, 뜻은 선택지 밑 한 줄이 말한다 — 뱃지만 봐서는 뜻을 몰랐다.
  { key: 'auto', label: TIER_LABEL.auto, hint: '이미 올린 장소와 같은 곳 — 올리면 거기 합쳐져요', match: (group) => group.tier === 'auto' },
  { key: 'ask', label: TIER_LABEL.ask, hint: '비슷한 장소가 있어 같은 곳인지 봐야 해요', match: (group) => group.tier === 'ask' },
  { key: 'new', label: TIER_LABEL.new, hint: '처음 보는 곳 — 올리면 새 장소로 올라가요', match: (group) => group.tier === 'new' },
];

/**
 * 종류 축. tier·동반 정보와 **겹치지 않는 세 번째 축**이다 — 종류로 좁힌 뒤 tier 로 다시 좁히는 것이
 * 실제 검수 순서다("카페부터 훑고, 그중 처음 보는 곳만").
 *
 * `other` 도 칩을 갖는다. 분석기가 `other` 를 후보에서 제외하므로(`exclusionReason`) 평소엔 0이지만,
 * 0인 칩이 서 있는 것과 칩이 없는 것은 다른 말이다 — 없으면 '기타' 후보가 생긴 날 그것이 어느 칩에도
 * 안 걸려 **어떤 걸러 보기로도 볼 수 없는** 줄이 된다(전체 개수와 칩 합이 어긋나는 것으로만 드러난다).
 */
const TYPE_FILTERS: { key: TTypeFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'stay', label: TYPE_LABEL.stay },
  { key: 'restaurant', label: TYPE_LABEL.restaurant },
  { key: 'cafe', label: TYPE_LABEL.cafe },
  { key: 'other', label: TYPE_LABEL.other },
];

/** 묶음의 종류. 대표 행(`lead`)이 정본이다 — 표의 종류 칩이 읽는 값과 같아야 칩과 목록이 어긋나지 않는다. */
const typeMatches = (filter: TTypeFilter, group: TCandidateGroup): boolean =>
  filter === 'all' || group.lead.extracted.type === filter;

/**
 * 새 장소 id. `places.id` 는 default 가 없어 우리가 정한다.
 *
 * `crypto.randomUUID` 는 **보안 컨텍스트에서만** 있다 — 폰에서 `http://192.168.x.x:7727` 로 열면 없어서
 * 승인 버튼이 통째로 터진다. 같은 자리에서 `getRandomValues` 로 v4 모양을 만들어 검수가 이어지게 한다.
 */
const newPlaceId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function AdminPage() {
  // 탭·걸러 보기를 주소에서 읽는다(마운트 한 번). 이 화면은 `ssr: false` 라 렌더 중에 `window` 가 있다.
  const [initialUrl] = useState(() => parseAdminUrl(typeof window === 'undefined' ? '' : window.location.search));
  const [phase, setPhase] = useState<TPhase>('checking');
  const [session, setSession] = useState<TAdminSession | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [fatal, setFatal] = useState<string | null>(null);
  const [groups, setGroups] = useState<TCandidateGroup[]>([]);
  /** 반영이 끊겨 `approved` 로 남은 후보 수. 셀 수 없었으면(조회 실패) undefined — 그때는 아무 말도 하지 않는다. */
  const [stranded, setStranded] = useState<number | undefined>(undefined);
  const [states, setStates] = useState<Record<string, TAdminPageGroupState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<TTierFilter>(initialUrl.tier);
  const [policyFilter, setPolicyFilter] = useState<TPolicyFilter>(initialUrl.policy);
  const [typeFilter, setTypeFilter] = useState<TTypeFilter>(initialUrl.type);
  const [warnFilter, setWarnFilter] = useState<TWarnFilter>(initialUrl.warn);
  const [shown, setShown] = useState(PAGE_SIZE);
  /*
   * 일괄 반려용으로 골라 둔 묶음들. 집합을 다루는 규칙은 전부 `adminSelection.ts` 에 있다 —
   * 특히 "목록에 없는 키를 버린다"(`pruneSelection`)가 조용히 틀리는 자리라 거기서 테스트한다.
   */
  const [selected, setSelected] = useState<TSelection>(EMPTY_SELECTION);
  /**
   * 표 위 줄의 상태. `mode` 는 **지금 열린 확인 하나**다 — 반려 폼·재분석 확인·올리기 확인·최신본 확인이 동시에 열리면
   * 어느 확인 버튼이 무엇을 하는지 흐려진다(불리언 여럿이던 때 둘이 같이 열릴 수 있었다).
   */
  const [bulk, setBulk] = useState<{ busy?: boolean; mode?: TBulkMode; summary?: string; error?: string }>({});
  const [tab, setTab] = useState<TTab>(initialUrl.tab);
  /*
   * 등록 완료·등록 해제가 **한 목록을 나눠 쓴다**(`status` 로 가른다) — 되살리기 한 번에 두 탭 건수가 같은 틱에 움직인다.
   * `placesRef`(대조 장부)와 따로 읽는 이유는 그쪽 주석(`approveGroup` 이 제자리에서 고친다). null = 아직 못 읽었다.
   */
  const [managed, setManaged] = useState<TPlaceRow[] | null>(null);
  const [managedError, setManagedError] = useState<string | null>(null);
  const [placeStates, setPlaceStates] = useState<Record<string, TAdminPagePlaceState>>({});
  /** 방금 장소를 내리거나 되살렸다는 한 줄 — 줄이 다른 탭으로 옮겨 가므로 두 장소 탭에 같이 선다. */
  const [placeNotice, setPlaceNotice] = useState<string | undefined>(undefined);
  const [postCounts, setPostCounts] = useState<TPostCounts | undefined>(undefined);
  const [postError, setPostError] = useState<string | undefined>(undefined);
  const [blockSummary, setBlockSummary] = useState<TBlocksSummary | undefined>(undefined);
  /** 장소 id → 열린 블랙리스트(등록 해제 칸의 칩). undefined = 표가 없거나 못 읽었다. */
  const [placeBlocks, setPlaceBlocks] = useState<Record<string, TPlaceBlock> | undefined>(undefined);
  /** 사용자 제보(ADR-021). undefined = 아직 못 읽었다. 쓰기 콜백이 최신 행을 보도록 ref 로도 든다. */
  const [reports, setReports] = useState<TReportsLoad | undefined>(undefined);
  const reportRowsRef = useRef<TReportRow[]>([]);
  const applyReports = useCallback((next: TReportsLoad | undefined) => {
    reportRowsRef.current = next?.kind === 'ok' ? next.rows : [];
    setReports(next);
  }, []);
  const reportsByPlace = useMemo(
    () => (reports?.kind === 'ok' ? openReportsByPlace(reports.rows) : NO_REPORTS_BY_PLACE),
    [reports],
  );
  const visitedByPlace = useMemo(
    () =>
      reports?.kind === 'ok'
        ? visitedTallyByPlace(reports.rows, Object.fromEntries((managed ?? []).map((row) => [row.id, row.verified_at])), new Date())
        : NO_VISITED,
    [managed, reports],
  );
  const suggestions = useMemo(() => (reports?.kind === 'ok' ? openSuggestions(reports.rows) : NO_SUGGESTIONS), [reports]);
  const [suggestionBusy, setSuggestionBusy] = useState<string | undefined>(undefined);
  const [suggestionError, setSuggestionError] = useState<string | undefined>(undefined);
  const patchReportRows = useCallback((updated: TReportRow[]) => {
    if (updated.length === 0) return;
    const rows = mergeReportRows(reportRowsRef.current, updated);
    reportRowsRef.current = rows;
    setReports({ kind: 'ok', rows });
  }, []);
  /**
   * 재빌드가 실제로 불렸는지. `undefined` 는 "못 읽었다" 이고 그때는 **아무 말도 하지 않는다** —
   * 못 읽은 것을 "안 불렸다" 로 말하면 멀쩡한 시스템을 고장으로 신고하게 만든다(stranded 와 같은 어법).
   */
  const [rebuild, setRebuild] = useState<TRebuildHeadline | undefined>(undefined);

  const clientRef = useRef<SupabaseClient | null>(null);
  /*
   * 장소 목록은 state 가 아니라 ref 다. `approveGroup` 이 이 배열을 **읽고 고친다** — 새 장소를 push 하고
   * 방금 채운 칸을 그 행에 반영한다. 다음 묶음의 재대조가 그것을 봐야 같은 가게가 두 번 생기지 않는다.
   * 화면에는 그리지 않으므로 리렌더가 필요 없다.
   */
  const placesRef = useRef<TPlaceRow[]>([]);
  /**
   * 같은 목록의 **그리기용 사본.** 쓰기(`approveGroup`)는 ref 를 고치고 읽어야 하지만(같은 틱의 다음 승인이 방금 만든 장소를 봐야 한다),
   * 화면은 렌더 중에 ref 를 읽을 수 없다. '최신본으로 저장하기' 의 전·후가 이 사본에서 나온다 — 승인 뒤마다 다시 떠서
   * 같은 장소를 가리키는 다른 줄이 방금 덮인 값을 "지금 값" 으로 본다.
   */
  const [placesView, setPlacesView] = useState<TPlaceRow[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /*
   * 쓰기는 한 번에 하나만 — CLI 가 후보를 한 줄씩 도는 것과 같은 직렬성이다.
   * 카드별 버튼 비활성(`isDisabled={Boolean(busy)}`)은 **같은 카드**만 막는다. 승인이 도는 동안 그 카드를 접고
   * 다른 카드를 펴서 누르는 길이 열려 있는데, 두 번째 `approveGroup` 은 첫 번째가 아직 push 하지 않은
   * `placesRef` 로 재대조한다 — 같은 가게가 이름 키만 달라 두 묶음이면(예: '숨도'·'숨도카페') 장소가 두 개 생긴다.
   * state 가 아니라 ref 인 이유: state 는 리렌더 뒤에야 보여 같은 경쟁을 그대로 반복한다.
   */
  const writingRef = useRef(false);

  useEffect(() => {
    const timers = timersRef;
    return () => {
      for (const timer of timers.current) clearTimeout(timer);
    };
  }, []);

  const patchState = useCallback((key: string, patch: Partial<TAdminPageGroupState>) => {
    setStates((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  /**
   * 재빌드 기록을 다시 읽어 머리글 한 줄을 갱신한다. 실패하면 **조용히 지운다** — 이 줄이 없어서 검수를 못 하게
   * 만들면 안 되고(카드의 결과는 이미 보인다), 대신 "모르는데 아는 척" 을 하지 않는다.
   * `rebuildHeadline` 이 상대 시각을 쓰므로 `Date.now()` 를 읽는 시점이 곧 그 줄이 말하는 "지금" 이다.
   */
  const refreshRebuild = useCallback(async (client: SupabaseClient) => {
    try {
      setRebuild(rebuildHeadline(await fetchRebuildStatus(client), Date.now()));
    } catch {
      /*
       * 읽지 못한 것을 **말한다.** 아무 말도 안 하면(undefined) 이 줄이 고치려던 침묵이 그대로 돌아온다 —
       * "재빌드가 안 걸렸다" 와 "진단기가 없다/고장났다" 가 다시 같은 얼굴이 된다.
       * 지금 가장 흔한 원인이 그것이다: 마이그레이션이 아직 원격에 적용되지 않으면 이 RPC 자체가 없다.
       */
      setRebuild({ tone: 'none', text: '사이트에 올라갔는지 지금은 확인할 수 없어요 — 검수는 계속해도 돼요.' });
    }
  }, []);

  /**
   * 등록 완료·등록 해제 칸의 장소 목록. 실패해도 검수(후보 칸)를 막지 않는다 — 그 두 칸만 오류를 말한다.
   * 0행이면 `fetchManagedPlaces` 가 던진다(RLS 가 어긋나면 빈 결과가 오는데 그것을 "장소가 없어요" 로 그리면 거짓말이다).
   */
  const loadManaged = useCallback(async (client: SupabaseClient) => {
    try {
      const rows = await fetchManagedPlaces(client);
      setManagedError(null);
      setManaged(rows);
    } catch (error) {
      setManagedError(messageOf(error, '장소 목록을 불러오지 못했어요.'));
      setManaged(null);
    }
  }, []);

  /** 수집 완료·블랙리스트 탭의 건수. 둘 다 실패를 탭 쪽에서만 말하고 검수는 막지 않는다. */
  const loadCounts = useCallback(async (client: SupabaseClient) => {
    try {
      setPostError(undefined);
      setPostCounts(await countPosts(client));
    } catch (error) {
      setPostCounts(undefined);
      setPostError(messageOf(error, '수집한 글을 세지 못했어요.'));
    }
    setBlockSummary(await fetchBlockCounts(client));
    const byPlace = await fetchPlaceBlocks(client);
    setPlaceBlocks(byPlace.kind === 'ok' ? byPlace.byPlace : undefined);
    applyReports(await fetchReports(client));
  }, [applyReports]);

  const start = useCallback(async (next: TAdminSession) => {
    setFatal(null);
    setManaged(null);
    setManagedError(null);
    setPlaceStates({});
    setPlaceNotice(undefined);
    setPostCounts(undefined);
    setPostError(undefined);
    setBlockSummary(undefined);
    setPlaceBlocks(undefined);
    applyReports(undefined);
    setStranded(undefined);
    setRebuild(undefined);
    setPhase('verifying');
    const client = createAdminClient(next.accessToken);
    clientRef.current = client;
    try {
      if (!(await isOperator(client))) {
        setPhase('notOperator');
        return;
      }
      setPhase('loading');
      const [rows, places] = await Promise.all([fetchPendingCandidates(client), fetchMatchablePlaces(client)]);
      placesRef.current = places;
      setPlacesView(places);
      setGroups(groupPending(rows));
      setStates({});
      setSelected(EMPTY_SELECTION);
      setBulk({});
      setShown(PAGE_SIZE);
      setExpanded(null);
      setPhase('ready');
    } catch (error) {
      setFatal(messageOf(error, '후보를 불러오지 못했어요.'));
      setPhase('error');
      return;
    }

    void loadManaged(client);
    void loadCounts(client);

    /*
     * 끊긴 반영(`approved`)은 목록에 안 나오므로 수만 따로 센다.
     * 위의 Promise.all 에 넣지 않는 이유: 이 조회가 실패한다고 검수를 못 하게 만들면 안 된다 — 세지 못하면 그냥 말하지 않는다.
     */
    try {
      setStranded(await countStrandedCandidates(client));
    } catch {
      setStranded(undefined);
    }

    await refreshRebuild(client);
  }, [applyReports, loadCounts, loadManaged, refreshRebuild]);

  /*
   * 마운트 뒤에야 localStorage 를 읽는다 — 서버에는 그 저장소가 없다(그래서 이 화면은 `ssr: false` 다).
   * 읽기와 이어지는 조회를 async 안에 두는 이유는 규칙(react-hooks/set-state-in-effect)뿐이 아니다:
   * 화면이 `checking` 한 프레임을 반드시 거쳐야 "로그인 폼이 깜빡였다가 목록으로 바뀌는" 순간이 없다.
   */
  useEffect(() => {
    void (async () => {
      // 만료된 세션과 처음 여는 화면은 사용자에게 서로 다른 일이다 — readAdminSession 이 지우기 전에 있었는지 본다.
      let hadStored = false;
      try {
        hadStored = localStorage.getItem(ADMIN_SESSION_KEY) !== null;
      } catch {
        hadStored = false;
      }
      const stored = readAdminSession();
      if (!stored) {
        setNotice(hadStored ? '로그인이 만료됐어요. 다시 로그인해 주세요.' : undefined);
        setPhase('signedOut');
        return;
      }
      setSession(stored);
      await start(stored);
    })();
  }, [start]);

  const signedIn = useCallback(
    (next: TAdminSession) => {
      setNotice(undefined);
      setSession(next);
      void start(next);
    },
    [start],
  );

  /** 로그인 화면으로 돌린다. 한자리에서 다 버리는 이유 — 세션만 지우고 목록을 남기면 "반쯤 로그인된" 화면이 된다. */
  const resetToSignedOut = useCallback((why?: string) => {
    clearAdminSession();
    clientRef.current = null;
    placesRef.current = [];
    setPlacesView([]);
    setManaged(null);
    setSession(null);
    setGroups([]);
    setStates({});
    setStranded(undefined);
    setNotice(why);
    setFatal(null);
    setPhase('signedOut');
  }, []);

  const signOut = useCallback(() => resetToSignedOut(), [resetToSignedOut]);

  /**
   * 쓰기를 시작해도 되는가. 두 가지를 본다 — 세션이 아직 살아 있는지, 다른 묶음이 쓰고 있지 않은지.
   *
   * 세션 검사가 여기 있어야 `adminSession.ts` 의 만료 여유 60초가 뜻을 갖는다(CLI 는 30분을 본다).
   * 12시간 뒤 토큰은 죽는데, 그대로 보내면 카드에 PostgREST 의 `JWT expired` 가 뜨고 새로고침 말고 나갈 길이 없다 —
   * 마운트 때와 **같은 자리**(로그인 폼 + 같은 안내)로 보낸다. 저장된 세션이 아니라 메모리의 세션을 보는 이유:
   * 사생활 보호 모드에서는 저장이 막혀도(`writeAdminSession` 이 삼킨다) 이번 세션의 검수는 되어야 한다.
   */
  const beginWrite = useCallback(
    (report: (message: string) => void): boolean => {
      if (sessionProblem(session, Math.floor(Date.now() / 1000)) !== 'none') {
        resetToSignedOut('로그인이 만료됐어요. 다시 로그인해 주세요.');
        return false;
      }
      if (writingRef.current) {
        // 조용히 넘기지 않는다 — 아무 말도 없으면 "눌렀는데 아무 일도 안 났다" 가 되고 사람이 계속 누른다.
        report('다른 작업을 처리하고 있어요 — 끝나면 다시 눌러 주세요.');
        return false;
      }
      writingRef.current = true;
      return true;
    },
    [resetToSignedOut, session],
  );

  /**
   * `writingRef` 를 내리는 유일한 자리. 함수로 빼 두는 이유는 '올린 장소' 칸이 같은 잠금을 써야 해서다 —
   * 두 칸이 각자 ref 를 들면 후보 승인과 장소 내리기가 **동시에** 돌고, 둘 다 `placesRef` 를 보는데
   * 하나는 그것을 고친다. 잠금이 하나여야 그 경쟁이 없다.
   */
  const endWrite = useCallback(() => {
    writingRef.current = false;
  }, []);

  /**
   * 쓰기가 성공했다 — 재빌드 기록을 다시 읽어 머리글을 갱신하고, 등록 완료·등록 해제의 목록도 **조용히** 다시 읽는다.
   * 후보 승인은 새 장소를 만들거나 짝의 칸을 채우는데, 그 장소 목록(`managed`)은 `placesRef` 와 따로라 다시 읽지 않으면 새로고침 전까지
   * 등록 완료 칸에 안 보인다. 못 읽으면 지금 목록을 그대로 둔다(성공한 쓰기 뒤에 목록을 지우면 안 된다).
   */
  const afterWrite = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    void refreshRebuild(client);
    void fetchManagedPlaces(client).then(setManaged, () => undefined);
  }, [refreshRebuild]);

  /**
   * 장소 쓰기를 대조 장부(`placesRef`)에도 반영한다.
   *
   * 없으면 이런 일이 난다 — 방금 내린 장소가 장부에는 `published` 로 남아, 같은 세션에서 그 가게의 후보를
   * 승인하면 `approveGroup` 이 내린 곳을 멀쩡한 짝으로 보고 **조용히 합친다**(archived 가지를 지나쳐 버린다).
   * 새로고침하면 사라지는 종류의 버그라 더 찾기 어렵다.
   */
  const applyPlaceChange = useCallback((updated: TPlaceRow) => {
    const index = placesRef.current.findIndex((place) => place.id === updated.id);
    if (index >= 0) placesRef.current[index] = { ...placesRef.current[index], ...updated };
  }, []);

  const patchPlaceState = useCallback((id: string, patch: Partial<TAdminPagePlaceState>) => {
    setPlaceStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  /** 끝난 줄의 초록 한 줄과 위의 한 줄 안내를 치운다 — 검색어·구간을 바꿀 때. */
  const clearPlaceDone = useCallback(() => {
    setPlaceNotice(undefined);
    setPlaceStates((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, state]) => [id, { ...state, done: undefined }])),
    );
  }, []);

  /**
   * 내리기·되살리기는 한 함수로 둔다 — 순서와 실패 처리가 글자까지 같고, 다른 것은 부르는 쓰기 하나와 문구뿐이다.
   * 갈라 두면 한쪽에만 `endWrite` 를 빼먹는 날이 온다(그러면 그 뒤 모든 버튼이 "다른 묶음을 처리하고 있어요" 가 된다).
   * 잠금(`writingRef`)은 후보 쓰기와 같은 것 하나다 — 둘 다 `placesRef` 를 보는데 하나는 그것을 고친다.
   */
  const changePlace = useCallback(
    async (place: TPlaceRow, kind: 'archive' | 'restore', reason?: TArchiveReason, note?: string, block: TBlockChoice = 'none') => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchPlaceState(place.id, { error: message }))) return;
      patchPlaceState(place.id, { busy: kind === 'archive' ? 'archiving' : 'restoring', error: undefined });
      try {
        let updated: TPlaceRow;
        let done: string;
        if (kind === 'archive') {
          const outcome = await archiveAndBlock(client, place, reason ?? '기타', note, block);
          updated = outcome.place;
          // 사이트에 없는 곳에 대한 제보는 더 할 일이 없다 — 함께 닫는다(ADR-021 R4). 실패해도 해제는 됐다.
          patchReportRows(await closeReportsForArchived(client, reportRowsRef.current, place.id, new Date().toISOString()));
          /* `place.status` 는 바꾸기 **전** 상태다 — 초안은 애초에 사이트에 없었으므로 "사라져요" 가 거짓이 된다. */
          done = archiveOutcomeText(place.status === 'draft', outcome);
        } else {
          const outcome = await restoreAndLift(client, place);
          updated = outcome.place;
          done = outcome.liftError
            ? `되살렸어요 · 다음 빌드부터 사이트에 보여요 — 블랙리스트는 못 풀었어요(${outcome.liftError})`
            : '되살렸어요 · 다음 빌드부터 사이트에 보여요';
        }
        // 한 state 에서 `status` 만 바뀐다 — 줄은 지워지지 않고 다른 칸(등록 완료 ⇄ 등록 해제)으로 옮겨 간다.
        setManaged((prev) => (prev ? sortManagedPlaces(prev.map((row) => (row.id === updated.id ? updated : row))) : prev));
        applyPlaceChange(updated);
        patchPlaceState(place.id, { busy: undefined, archiving: false, archiveReason: undefined, done });
        setPlaceNotice(`${place.name} — ${done} · ${kind === 'archive' ? '등록 해제' : '등록 완료'} 칸으로 옮겼어요`);
        await loadCounts(client);
        afterWrite();
      } catch (error) {
        patchPlaceState(place.id, { busy: undefined, error: messageOf(error, '바꾸지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [afterWrite, applyPlaceChange, beginWrite, endWrite, loadCounts, patchPlaceState, patchReportRows],
  );

  /**
   * 사용자 제보를 닫는다(`고쳤어요`·`무시`). `places` 를 바꾸지 않으므로 재빌드와 무관하다 — 고친 것 자체(주소 등)가 재빌드를 부른다.
   * 대조 장부를 건드리지 않아 잠금이 필요 없지만, 같은 줄의 다른 쓰기와 겹치지 않게 줄의 `busy` 로 막는다.
   */
  const handleReports = useCallback(
    async (place: TPlaceRow, ids: string[], status: 'handled' | 'dismissed', note: string) => {
      const client = clientRef.current;
      if (!client) return;
      patchPlaceState(place.id, { busy: 'reports', error: undefined, done: undefined });
      try {
        const nowIso = new Date().toISOString();
        patchReportRows(await setReportStatus(client, ids, status, note, nowIso));
        // `고쳤어요` 는 운영자가 이 가게를 다시 본 것이다 — 확인 날짜를 올린다(ADR-021 R5). `무시` 는 고친 것이 없어 올리지 않는다.
        const verifiedAt = status === 'handled' ? await markPlaceVerified(client, place, nowIso) : null;
        if (verifiedAt) {
          setManaged((prev) => (prev ? prev.map((row) => (row.id === place.id ? { ...row, verified_at: verifiedAt } : row)) : prev));
          afterWrite();
        }
        patchPlaceState(place.id, {
          busy: undefined,
          done: status === 'handled' ? `제보 ${ids.length}건을 닫았어요` : `제보 ${ids.length}건을 무시했어요`,
        });
      } catch (error) {
        patchPlaceState(place.id, { busy: undefined, error: messageOf(error, '제보를 처리하지 못했어요.') });
      }
    },
    [afterWrite, patchPlaceState, patchReportRows],
  );

  /**
   * 다녀왔어요 → 확인 날짜(ADR-021 R5). 확인 날짜를 찍고, 센 다녀왔어요를 `handled` 로 닫는다(다음 집계가 같은 말을 다시 세지 않게).
   * 칸이 원격에 없으면 날짜를 못 찍으므로 닫지도 않는다.
   */
  const applyVisited = useCallback(
    async (place: TPlaceRow, ids: string[]) => {
      const client = clientRef.current;
      if (!client || ids.length === 0) return;
      patchPlaceState(place.id, { busy: 'reports', error: undefined, done: undefined });
      try {
        const nowIso = new Date().toISOString();
        const verifiedAt = await markPlaceVerified(client, place, nowIso);
        if (!verifiedAt) throw new Error('확인 날짜 칸이 아직 없어요 — DB 마이그레이션(20261001140000)이 적용되면 반영할 수 있어요.');
        setManaged((prev) => (prev ? prev.map((row) => (row.id === place.id ? { ...row, verified_at: verifiedAt } : row)) : prev));
        patchReportRows(await setReportStatus(client, ids, 'handled', '최근 확인으로 반영', nowIso));
        patchPlaceState(place.id, { busy: undefined, done: '최근 확인으로 반영했어요 · 다음 빌드부터 사이트에 날짜가 보여요' });
        afterWrite();
      } catch (error) {
        patchPlaceState(place.id, { busy: undefined, error: messageOf(error, '반영하지 못했어요.') });
      }
    },
    [afterWrite, patchPlaceState, patchReportRows],
  );

  /** 장소 제안(F8)을 닫는다 — `찾아봤어요` · `아니에요`. `places` 를 바꾸지 않는다. */
  const closeSuggestion = useCallback(
    async (row: TReportRow, status: 'handled' | 'dismissed') => {
      const client = clientRef.current;
      if (!client) return;
      setSuggestionBusy(row.id);
      setSuggestionError(undefined);
      try {
        patchReportRows(await setReportStatus(client, [row.id], status, undefined, new Date().toISOString()));
      } catch (error) {
        setSuggestionError(messageOf(error, '제안을 닫지 못했어요.'));
      } finally {
        setSuggestionBusy(undefined);
      }
    },
    [patchReportRows],
  );

  /** 등록 해제 칸에서 블랙리스트를 넣고·바꾸고·푼다(09 T1.4 단계 4). `places` 는 안 바뀌므로 재빌드와 무관하다. */
  const changePlaceBlock = useCallback(
    async (place: TPlaceRow, choice: TBlockChoice) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchPlaceState(place.id, { error: message }))) return;
      patchPlaceState(place.id, { busy: 'blocking', error: undefined });
      try {
        await setPlaceBlock(client, place, choice, '등록 해제');
        await loadCounts(client);
        patchPlaceState(place.id, {
          busy: undefined,
          pickingBlock: false,
          done: choice === 'none' ? '블랙리스트에서 풀었어요' : `블랙리스트 ${choice === 'forever' ? '영구' : '3개월'}로 걸었어요`,
        });
      } catch (error) {
        patchPlaceState(place.id, { busy: undefined, error: messageOf(error, '블랙리스트를 바꾸지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite, loadCounts, patchPlaceState],
  );

  /**
   * 올린 장소의 주소·좌표 고치기. 순서·실패 처리는 `changePlace` 와 같다(잠금 → 쓰기 → 목록·대조 장부 → 풀기) —
   * 대조 장부에도 알리는 이유는 같은 세션의 다음 승인이 고친 주소로 짝을 찾게 하려는 것이다.
   */
  const savePlaceAddress = useCallback(
    async (place: TPlaceRow, patch: TPlaceAddressPatch) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchPlaceState(place.id, { error: message }))) return;
      patchPlaceState(place.id, { busy: 'savingAddress', error: undefined, done: undefined });
      try {
        const updated = await updatePlaceAddress(client, place, patch);
        setManaged((prev) => (prev ? prev.map((row) => (row.id === updated.id ? updated : row)) : prev));
        applyPlaceChange(updated);
        const done =
          place.status === 'published' ? '주소를 고쳤어요 · 다음 빌드부터 사이트에 반영돼요' : '주소를 고쳤어요';
        patchPlaceState(place.id, { busy: undefined, editingAddress: false, done });
        afterWrite();
      } catch (error) {
        patchPlaceState(place.id, { busy: undefined, error: messageOf(error, '주소를 고치지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [afterWrite, applyPlaceChange, beginWrite, endWrite, patchPlaceState],
  );

  const removeLater = useCallback((key: string) => {
    const timer = setTimeout(() => {
      setGroups((prev) => prev.filter((group) => group.key !== key));
      setStates((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, DONE_LINGER_MS);
    timersRef.current.push(timer);
  }, []);

  const approve = useCallback(
    async (group: TCandidateGroup, choice?: TApproveChoice) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchState(group.key, { error: message }))) return;
      patchState(group.key, { busy: 'approving', error: undefined });
      try {
        const outcome = await approveGroup(client, group, placesRef.current, {
          nowIso: new Date().toISOString(),
          newId: newPlaceId,
          asNew: choice?.asNew,
          mergeInto: choice?.mergeInto,
          restoreArchived: choice?.restoreArchived,
          confirmedDifferent: choice?.confirmedDifferent,
          overwrite: choice?.overwrite,
        });
        if (outcome.kind === 'blocked') {
          patchState(group.key, { busy: undefined, error: outcome.reason });
          return;
        }
        /*
         * 두 '골라 주세요' 패널은 **서로를 지운다.** 카드가 `state.archived ? … : state.similar ? …` 로 그리므로,
         * 한쪽을 세우면서 다른 쪽을 남기면 먼저 오는 쪽이 영원히 이긴다 — 그러면 되살려도·합쳐도 같은 패널이
         * 다시 뜨고, 나갈 길이 반려(후보를 버린다)나 '새 장소로'(복제본을 만든다)뿐인 막다른 길이 된다.
         */
        if (outcome.kind === 'needsDecision') {
          patchState(group.key, { busy: undefined, similar: outcome.similar, archived: undefined });
          return;
        }
        if (outcome.kind === 'archivedTarget') {
          // 쓰기 전에 멈춘 자리다 — 사람이 '되살려서 합치기' 나 반려를 고르면 그때 다시 온다.
          patchState(group.key, { busy: undefined, archived: outcome, similar: undefined });
          return;
        }
        if (outcome.kind === 'addressConflict') {
          /*
           * 결정 줄은 주소를 고르기 전에 올리기를 그리지 않으므로 보통은 닿지 않는다 — 고른 뒤 다른 줄의 쓰기로 값이 바뀐 경우 등.
           * 고르는 것은 저장되는 선택이다(`chooseAddress` → `addressChosen`) — 한 번 고르면 일괄 올리기도 다시 묻지 않는다.
           */
          patchState(group.key, { busy: undefined, error: '주소가 원글과 달라요 — 펼친 줄 아래에서 어느 주소가 맞는지 먼저 골라 주세요.' });
          return;
        }
        const what =
          outcome.kind === 'created'
            ? `올렸어요 · ${outcome.placeName}`
            : outcome.overwrittenKeys?.length
              ? `${outcome.placeName} 을 덮어썼어요 (${outcome.overwrittenKeys.length}칸)`
              : `${outcome.placeName} 에 채웠어요${outcome.patchKeys.length ? ` (${outcome.patchKeys.join(', ')})` : ' — 채울 빈 칸은 없었어요'}`;
        // 거짓말을 하지 않는 자리다. DB 에는 들어갔지만 정적 사이트는 다시 빌드돼야 보인다(ADR-015).
        // 그 빌드가 정말 걸렸는지는 머리글의 재빌드 줄이 말한다(`adminRebuild.ts`) — 이 문장만으로는 알 수 없었다.
        patchState(group.key, {
          busy: undefined,
          similar: undefined,
          archived: undefined,
          done: `${what} · 사이트에는 다음 빌드에서 보여요`,
        });
        removeLater(group.key);
        setPlacesView([...placesRef.current]);
        afterWrite();
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '반영하지 못했어요.') });
        /*
         * 이 실패가 후보를 `approved` 로 남겼을 수 있다(어느 단계에서 끊겼는지는 메시지에만 있다).
         * 그래서 짐작으로 세지 않고 다시 센다 — 머리글의 노란 줄이 지금을 말해야 새로고침 없이도 이어받을 일을 안다.
         */
        try {
          setStranded(await countStrandedCandidates(client));
        } catch {
          // 세지 못하면 그냥 둔다. 카드의 빨간 줄이 이미 이 실패를 말하고 있다.
        }
      } finally {
        endWrite();
      }
    },
    [afterWrite, beginWrite, endWrite, patchState, removeLater],
  );

  const reject = useCallback(
    async (group: TCandidateGroup, reason: TRejectReason, note: string, block: TBlockChoice) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchState(group.key, { error: message }))) return;
      patchState(group.key, { busy: 'rejecting', error: undefined });
      try {
        const outcome = await rejectAndBlock(client, group, reason, note, block);
        patchState(group.key, { busy: undefined, rejecting: false, done: rejectOutcomeText(reason, outcome) });
        removeLater(group.key);
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '제외하지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite, patchState, removeLater],
  );

  /**
   * 고른 묶음을 한꺼번에 반려한다.
   *
   * **하나가 실패해도 멈추지 않는다.** 141묶음을 고른 자리에서 3번째가 실패했다고 세우면 나머지 138묶음이
   * 그대로 남아 사람이 같은 일을 다시 해야 하고, 어디까지 됐는지는 화면 어디에도 없다. 그래서 끝까지 돌고
   * **성공한 것만** 목록에서 뺀 뒤 결과를 한 줄로 말한다(`summarizeBulkReject`) — 실패한 것은 골라 둔 채로
   * 목록에 남아 다시 누를 수 있다. 메시지는 첫 실패의 것을 싣는다(전부 같은 이유일 가능성이 크다).
   *
   * 한 줄씩 차례로 부르는 이유 — 쓰기 잠금(`beginWrite`)이 하나라 병렬로 보내도 서버에서 줄을 서고,
   * 중간에 끊겼을 때 "어디까지 갔나" 를 알 수 없게 된다.
   */
  const rejectSelected = useCallback(
    async (keys: readonly string[], reason: TRejectReason, note: string, block: TBlockChoice) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => setBulk({ mode: 'reject', error: message }))) return;
      const wanted = new Set(keys);
      const targets = groups.filter((group) => wanted.has(group.key));
      setBulk({ busy: true, mode: 'reject' });
      const done = new Set<string>();
      let failed = 0;
      let blockFailed = 0;
      let firstError: string | undefined;
      try {
        for (const group of targets) {
          try {
            const outcome = await rejectAndBlock(client, group, reason, note, block);
            done.add(group.key);
            if (outcome.blockError) {
              blockFailed += 1;
              firstError ??= `블랙리스트에는 안 들어갔어요(${outcome.blockError})`;
            }
          } catch (error) {
            failed += 1;
            firstError ??= messageOf(error, '제외하지 못했어요.');
          }
        }
      } finally {
        endWrite();
      }
      setGroups((prev) => prev.filter((group) => !done.has(group.key)));
      setStates((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !done.has(key))));
      setSelected((prev) => clearKeys(prev, [...done]));
      setBulk({ summary: summarizeBulkReject(done.size, failed, blockFailed), error: firstError });
    },
    [beginWrite, endWrite, groups],
  );

  /** 고른 묶음들의 재분석 계획. 형제 후보(같은 글의 다른 줄)를 찾으려고 **목록 전체**의 행을 함께 넘긴다(`reanalyzePlan`). */
  const planFor = useCallback(
    (keys: readonly string[]) => {
      const wanted = new Set(keys);
      return reanalyzePlan(
        groups.filter((group) => wanted.has(group.key)).flatMap((group) => group.rows),
        groups.flatMap((group) => group.rows),
      );
    },
    [groups],
  );

  /**
   * **재분석** — 고른 묶음의 글을 되돌린다(`adminReanalyze.ts`). 한 줄(레일)과 일괄(표 위 줄)이 같은 함수를 쓴다.
   *
   * 끝나면 눕힌 후보를 빼고 **다시 묶는다**(`groupPending`). 형제 후보가 다른 줄에 섞여 있을 수 있어 줄 단위로 지우면
   * 그 줄의 대표만 남거나 빈 줄이 남는다. 결과 한 줄은 표 위 줄에 남긴다 — 한 줄에서 눌렀어도 그 줄은 사라지므로
   * 말할 자리가 거기뿐이고, 다음에 할 일(터미널에서 `pnpm data:analyze`)을 거기서 말한다.
   */
  const reanalyze = useCallback(
    async (keys: readonly string[], from: 'bulk' | { key: string }) => {
      const client = clientRef.current;
      if (!client) return;
      const fail = (message: string) =>
        from === 'bulk' ? setBulk({ mode: 'reanalyze', error: message }) : patchState(from.key, { busy: undefined, error: message });
      if (!beginWrite(fail)) return;
      const plan = planFor(keys);
      if (from === 'bulk') setBulk({ busy: true, mode: 'reanalyze' });
      else patchState(from.key, { busy: 'reanalyzing', error: undefined });
      try {
        await prepareReanalyze(client, plan);
      } catch (error) {
        fail(messageOf(error, '재분석하지 못했어요.'));
        return;
      } finally {
        endWrite();
      }
      const laid = new Set(plan.lay.map((row) => row.id));
      const next = groupPending(groups.flatMap((group) => group.rows).filter((row) => !laid.has(row.id)));
      const alive = new Set(next.map((group) => group.key));
      setGroups(next);
      setStates((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => alive.has(key))));
      setSelected((prev) => clearKeys(prev, [...keys]));
      setBulk({
        summary: `글 ${plan.posts.length}건을 수집 완료로 되돌렸어요 · 검수 대기 후보 ${plan.lay.length}건이 목록에서 빠졌어요 — 터미널에서 pnpm data:analyze 를 돌리면 다시 읽어요.`,
      });
    },
    [beginWrite, endWrite, groups, patchState, planFor],
  );

  /**
   * **고른 것 올리기 · 고른 것 덮어쓰기** — 한 줄 버튼과 같은 `approveGroup` 을 고른 묶음마다 차례로 부른다.
   *
   * 사람이 골라야 하는 줄은 넘기지 않는다: `needsDecision`(닮은 곳)·`archivedTarget`(내린 곳)·`addressConflict`(주소 다름)가 오면 **쓰기 전에** 멈춘 것이므로
   * 그 줄에 패널을 세워 두고 다음으로 간다. `blocked`(지역 없음 등)와 예외는 그 줄에 이유를 적는다. 끝나면 된 것만 목록에서 빼고
   * `summarizeBulk` 한 줄로 말한다 — 기다리는 것과 실패를 따로 센다(할 일이 다르다).
   *
   * 최신본은 **덮을 수 있는 묶음만** 돈다(`bulkLatestTargets` — 짝이 있고 살아 있고 바뀌는 칸이 있는 것). 짝 id 를 실어 보낸다 —
   * 안 실으면 그 사이 다른 줄의 승인이 캐시를 바꿔 확인 문장이 말한 장소와 다른 곳에 덮일 수 있다.
   */
  const applySelected = useCallback(
    async (keys: readonly string[], kind: 'approve' | 'latest') => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => setBulk({ mode: kind, error: message }))) return;
      const wanted = new Set(keys);
      const chosen = groups.filter((group) => wanted.has(group.key));
      const jobs =
        kind === 'latest'
          ? bulkLatestTargets(chosen, placesRef.current).eligible.map((entry) => ({ group: entry.group, choice: { mergeInto: entry.pairId, overwrite: true } }))
          : chosen.map((group) => ({ group, choice: {} }));
      setBulk({ busy: true, mode: kind });
      const done = new Set<string>();
      const tally: TBulkTally = { done: 0, waiting: 0, failed: 0 };
      try {
        for (const { group, choice } of jobs) {
          try {
            const outcome = await approveGroup(client, group, placesRef.current, { nowIso: new Date().toISOString(), newId: newPlaceId, ...choice });
            if (outcome.kind === 'needsDecision') {
              tally.waiting += 1;
              patchState(group.key, { similar: outcome.similar, archived: undefined });
            } else if (outcome.kind === 'archivedTarget') {
              tally.waiting += 1;
              patchState(group.key, { archived: outcome, similar: undefined });
            } else if (outcome.kind === 'addressConflict') {
              // 일괄은 주소를 대신 고르지 않는다 — 줄을 펼치면 결정 줄이 두 주소를 나란히 보여 준다.
              tally.waiting += 1;
              patchState(group.key, { error: '일괄로는 올리지 않았어요 — 주소가 원글과 달라 이 줄에서 직접 골라 주세요.' });
            } else if (outcome.kind === 'blocked') {
              tally.failed += 1;
              patchState(group.key, { error: outcome.reason });
            } else {
              // 결과 갈래가 늘면 이 줄에서 컴파일이 멈춘다 — 모르는 갈래를 '됐다' 로 세면 그 줄이 목록에서 조용히 사라진다.
              const written: 'created' | 'merged' = outcome.kind;
              void written;
              tally.done += 1;
              done.add(group.key);
            }
          } catch (error) {
            tally.failed += 1;
            patchState(group.key, { error: messageOf(error, '반영하지 못했어요.') });
          }
        }
      } finally {
        endWrite();
      }
      setGroups((prev) => prev.filter((group) => !done.has(group.key)));
      setStates((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !done.has(key))));
      setSelected((prev) => clearKeys(prev, [...done]));
      setPlacesView([...placesRef.current]);
      setBulk({ summary: `${summarizeBulk(kind === 'latest' ? '덮어썼어요' : '올렸어요', tally)} · 사이트에는 다음 빌드에서 보여요` });
      if (tally.done) afterWrite();
      // 실패가 후보를 `approved` 로 남겼을 수 있다 — 한 줄 승인과 같은 이유로 다시 센다.
      if (tally.failed) {
        try {
          setStranded(await countStrandedCandidates(client));
        } catch {
          // 세지 못하면 둔다 — 줄의 빨간 글이 이미 말한다.
        }
      }
    },
    [afterWrite, beginWrite, endWrite, groups, patchState],
  );

  const saveRegion = useCallback(
    async (group: TCandidateGroup, regionRaw: string) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchState(group.key, { error: message }))) return;
      patchState(group.key, { busy: 'savingRegion', error: undefined });
      try {
        const updated = await setRegion(client, group.lead, regionRaw);
        setGroups((prev) =>
          prev.map((current) =>
            current.key === group.key
              ? {
                  ...current,
                  lead: updated,
                  rows: current.rows.map((row) => (row.id === updated.id ? updated : row)),
                }
              : current,
          ),
        );
        patchState(group.key, { busy: undefined, regionDraft: undefined });
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '지역을 저장하지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite, patchState],
  );

  /**
   * `주소 다름` 에서 맞는 주소를 고른다(`chooseAddress`). 고치기 저장과 같은 규칙으로 쓴다 — **정체(주소·좌표·짝·지역)는 묶음의
   * 모든 행에** 쓴다. 대표에만 쓰면 다음 새로고침에서 나머지 행이 옛 주소로 다시 `주소 다름` 을 띄운다.
   */
  const chooseAddressFor = useCallback(
    async (group: TCandidateGroup, choice: TAddressChoice) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchState(group.key, { error: message }))) return;
      patchState(group.key, { busy: 'savingEdit', error: undefined });
      try {
        const updated: TCandidateRow[] = [];
        for (const row of group.rows) {
          updated.push(await saveEdit(client, row, chooseAddress(row, choice, placesRef.current)));
        }
        const byId = new Map(updated.map((row) => [row.id, row]));
        setGroups((prev) =>
          prev.map((current) =>
            current.key === group.key
              ? { ...current, lead: byId.get(current.lead.id) ?? current.lead, rows: current.rows.map((row) => byId.get(row.id) ?? row) }
              : current,
          ),
        );
        patchState(group.key, { busy: undefined });
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '주소를 저장하지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite, patchState],
  );

  /**
   * 고친 내용을 저장한다.
   *
   * **정체(이름·종류·주소·좌표·짝)는 묶음의 모든 행에, 소개(`features`)는 대표 행에만** 쓴다.
   * 정체를 대표에만 쓰면 다음 새로고침에서 `groupCandidates` 가 `nameKey`·`match_place_id` 로 다시 묶을 때
   * 그 행만 딴 묶음으로 떨어져, 방금 고친 가게가 두 줄로 보인다. 반대로 소개까지 전부에 쓰면 글마다 다른
   * 문장을 한 글의 것으로 덮어쓴다 — 승인이 읽는 것은 대표 하나뿐이라 그럴 이유가 없다.
   *
   * 실패하면 **아무것도 화면에 반영하지 않는다.** 일부만 쓰인 상태로 목록을 고쳐 두면 무엇이 저장됐는지
   * 화면과 DB 가 갈리고, 그 갈림은 다음 승인에서야 드러난다.
   */
  const saveEditFor = useCallback(
    async (group: TCandidateGroup, draft: TCandidateEditDraft) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchState(group.key, { error: message }))) return;
      patchState(group.key, { busy: 'savingEdit', error: undefined });
      try {
        const edit = buildEdit(group.lead, draft, placesRef.current);
        const updatedLead = await saveEdit(client, group.lead, edit);
        const others: TCandidateRow[] = [];
        for (const row of group.rows) {
          if (row.id === group.lead.id) continue;
          // 소개는 그 행의 것을 지킨다 — 정체만 맞춘다. AI 원본도 그 행의 것이다(대표의 스냅샷을 얹으면 남의 글이 원본이 된다).
          const sibling = {
            ...edit,
            extracted: { ...edit.extracted, features: row.extracted.features ?? null, aiOriginal: aiOriginalOf(row.extracted) },
          };
          others.push(await saveEdit(client, row, sibling));
        }
        const byId = new Map([updatedLead, ...others].map((row) => [row.id, row]));
        setGroups((prev) =>
          prev.map((current) =>
            current.key === group.key
              ? { ...current, lead: updatedLead, rows: current.rows.map((row) => byId.get(row.id) ?? row) }
              : current,
          ),
        );
        /*
         * 고친 뒤에는 '골라 주세요' 패널을 **지운다.** 남은 패널(비슷한 곳·내린 곳)은 결정 줄에서 주소 고르기보다 먼저 그려져
         * 새로 생긴 `주소 다름` 을 가린다 — 다시 누르면 새 값으로 다시 판단한다.
         */
        patchState(group.key, { busy: undefined, editDraft: undefined, similar: undefined, archived: undefined });
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '고친 내용을 저장하지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite, patchState],
  );

  /**
   * 펼친 줄의 패널이 가리키는 기존 장소 행 — 내린 곳 → 닮은 곳 → 짝 순서(카드가 패널을 고르는 순서와 같다).
   * '최신본으로 저장하기' 가 그 행의 **지금 값**과 후보를 대 본다. 캐시(`placesRef`)는 승인이 덮은 칸까지 반영돼 있다.
   */
  const pairPlaceOf = (group: TCandidateGroup, state: TAdminPageGroupState): TPlaceRow | undefined => {
    const id = state.archived?.placeId ?? state.similar?.id ?? group.lead.match_place_id;
    return id ? placesView.find((place) => place.id === id) : undefined;
  };

  const cards = useMemo(
    () =>
      groups.map((group) => {
        const preview = previewFor(group.lead.extracted);
        return { group, preview, view: adminFlagView([...flagsFor(group), ...preview.flags]) };
      }),
    [groups],
  );

  const activeTier = TIER_FILTERS.find((entry) => entry.key === tierFilter) ?? TIER_FILTERS[0];
  /*
   * **축이 넷이고, 어떤 선택지의 개수든 "나를 뺀 나머지 축을 적용한 뒤" 센다.** 누르면 보일 수와 선택지의 숫자가
   * 같아야 한다는 규칙이고, 이 화면에서 그것이 틀리면 운영자가 "다 봤다" 를 개수로 잘못 읽는다 —
   * 조건 토글을 켠 채 tier 칩을 보던 시절에 실제로 난 일이다. 축을 하나 더할 때 이 표에 한 줄만 더하면 되게 묶었다.
   */
  type TCard = (typeof cards)[number];
  type TAxis = 'tier' | 'type' | 'policy' | 'warn';
  const AXES: Record<TAxis, (card: TCard) => boolean> = {
    tier: (card) => activeTier.match(card.group),
    type: (card) => typeMatches(typeFilter, card.group),
    policy: (card) => policyFilter === 'all' || POLICY_FILTER_MATCH[policyFilter](card),
    warn: (card) => warnMatches(warnFilter, card),
  };
  /** `except` 축을 열어 둔 채 나머지를 적용한 목록 — 그 축의 선택지 개수를 세는 바탕이다. */
  const without = (except: TAxis) =>
    cards.filter((card) => (Object.keys(AXES) as TAxis[]).every((axis) => axis === except || AXES[axis](card)));
  const filtered = without('warn').filter(AXES.warn);
  const baseTier = without('tier');
  const baseType = without('type');
  const basePolicy = without('policy');
  const baseWarn = without('warn');
  const filtersOn = tierFilter !== 'all' || typeFilter !== 'all' || policyFilter !== 'all' || warnFilter !== 'all';

  // 걸러 보기를 바꾸면 '더 보기' 도 처음으로 — 효과가 아니라 여기서 함께 바꾼다(같은 사건의 두 결과다).
  const pickTier = (next: TTierFilter) => {
    setTierFilter(next);
    setShown(PAGE_SIZE);
  };
  /** 드롭다운은 값을 바로 고른다 — 토글(`pickPolicy`)과 달리 같은 것을 다시 골라도 풀리지 않는다. */
  const pickPolicyExact = (next: TPolicyFilter) => {
    setPolicyFilter(next);
    setShown(PAGE_SIZE);
  };
  const resetFilters = () => {
    setTierFilter('all');
    setTypeFilter('all');
    setPolicyFilter('all');
    setWarnFilter('all');
    setShown(PAGE_SIZE);
  };
  const pickWarn = (next: TWarnFilter) => {
    setWarnFilter(next);
    setShown(PAGE_SIZE);
  };
  const pickType = (next: TTypeFilter) => {
    setTypeFilter(next);
    setShown(PAGE_SIZE);
  };

  const showMore = useCallback(() => setShown((prev) => prev + PAGE_SIZE), []);
  const setSentinel = useAdminInfiniteScroll(filtered.length > shown, shown, showMore);

  /*
   * 탭·걸러 보기를 주소에 적는다(`history.replaceState` — 항목을 쌓지 않는다). 새로고침·재로그인·되돌아오기에서 같은 자리로 돌아온다.
   * 첫 렌더의 값은 방금 주소에서 읽은 것이라 같은 문자열을 다시 쓸 뿐이다(바뀐 것이 없으면 아무것도 안 한다).
   */
  useEffect(() => {
    const search = writeAdminUrl(window.location.search, { tab, tier: tierFilter, policy: policyFilter, type: typeFilter, warn: warnFilter });
    const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', next);
  }, [policyFilter, tab, tierFilter, typeFilter, warnFilter]);

  /**
   * 걸러 보기에 걸린 묶음들. 무한 스크롤로 **아직 안 그린 것까지** 포함한다 — '전부 고르기' 가 고르는 범위다.
   *
   * **끝난 줄(`done`)은 뺀다.** 승인·반려가 끝난 묶음은 초록 한 줄로 3초를 더 머무는데(`DONE_LINGER_MS`),
   * 그 3초 동안 목록에는 남아 있다. 빼지 않으면 전부 고른 뒤 한 줄을 승인한 운영자가 이어서 일괄 반려를 눌렀을 때
   * **방금 `merged` 가 된 후보에 반려를 덮어쓴다** — 뒤에 이미 게시된 `places` 행이 있는데 후보만 버려진 꼴이 된다.
   */
  const filteredKeys = filtered.filter((card) => !states[card.group.key]?.done).map((card) => card.group.key);
  /*
   * 고른 것 중 **지금 목록에 있는 것**만. 집합(`selected`)은 깎지 않는다 — 걸러 보기를 껐다 켜면 고른 것이
   * 돌아오는 편이 낫고, 효과로 깎아 맞추면 렌더가 렌더를 부른다(`react-hooks/set-state-in-effect`).
   * 세는 것도 반려하는 것도 이 배열만 본다.
   */
  const selectedKeys = visibleSelection(selected, filteredKeys);
  const selectedSet = new Set(selectedKeys);

  if (phase === 'checking') {
    return <p className="px-5 pt-10 text-sm text-tertiary">불러오는 중이에요</p>;
  }

  if (phase === 'signedOut') {
    return (
      <div>
        <PageHeader title="장소 검수" description="블로그에서 찾은 장소를 확인하고 올려요" />
        <AdminPageLogin onSignedIn={signedIn} notice={notice} />
      </div>
    );
  }

  if (phase === 'verifying' || phase === 'loading') {
    return (
      <div>
        <PageHeader title="장소 검수" description={phase === 'verifying' ? '운영자인지 확인하고 있어요' : '장소를 불러오고 있어요'} />
      </div>
    );
  }

  if (phase === 'notOperator') {
    return (
      <div>
        <PageHeader title="장소 검수" />
        <div className="px-4 pt-6 md:px-6">
          <p className="text-sm text-secondary">
            {session?.email ? `${session.email} 계정은 검수 권한이 없어요. ` : '이 계정은 검수 권한이 없어요. '}
            관리자에게 이 계정을 검수자로 넣어 달라고 요청해 주세요.
          </p>
          <Button color="secondary" size="sm" className="mt-3" onClick={signOut}>
            다른 계정으로 로그인
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div>
        <PageHeader title="장소 검수" />
        <div className="px-4 pt-6 md:px-6">
          <p className="text-sm text-error-primary">{fatal}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button color="primary" size="sm" onClick={() => session && void start(session)}>
              다시 시도
            </Button>
            <Button color="secondary" size="sm" onClick={signOut}>
              로그아웃
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  /*
   * 칸마다 제목·설명·탭 건수. 건수는 **이미 든 것에서 센다** — 탭을 바꿔도 다시 읽지 않는다.
   * 못 센 것(아직 읽는 중·실패)은 숫자를 안 단다(0 으로 말하지 않는다). `미적용` 은 원격에 표·칸이 아직 없다는 뜻이다(09 「실행 규약」).
   */
  const publishedCount = managed?.filter((place) => place.status === 'published').length;
  const draftCount = managed?.filter((place) => place.status === 'draft').length;
  const archivedCount = managed?.filter((place) => place.status === 'archived').length;
  const n = (value: number) => value.toLocaleString('ko-KR');
  const tabCount: Record<TTab, string | undefined> = {
    posts: postCounts ? n(postCounts.total) : undefined,
    candidates: n(groups.length),
    places: publishedCount === undefined || draftCount === undefined ? undefined : n(publishedCount + draftCount),
    archived: archivedCount === undefined ? undefined : n(archivedCount),
    blocks: blockSummary?.kind === 'ok' ? n(blockSummary.active) : undefined,
  };
  const tabUnapplied: Partial<Record<TTab, boolean>> = {
    posts: postCounts?.excluded === null,
    blocks: blockSummary?.kind === 'unavailable',
  };
  const TAB_HEADER: Record<TTab, { title: string; description: string }> = {
    posts: {
      title: '수집 완료',
      description: postCounts
        ? `전체 ${n(postCounts.total)} · 미분석 ${n(postCounts.unanalyzed)}${postCounts.excluded === null ? '' : ` · 제외 ${n(postCounts.excluded)}`}`
        : '수집한 글을 세고 있어요',
    },
    candidates: { title: '검수 대기', description: `${groups.length}곳` },
    places: {
      title: '등록 완료',
      description:
        publishedCount === undefined ? '장소를 불러오고 있어요' : `게시 ${n(publishedCount)} · 게시 대기 ${n(draftCount ?? 0)} — 내리거나 다시 볼 수 있어요`,
    },
    archived: {
      title: '등록 해제',
      description: archivedCount === undefined ? '장소를 불러오고 있어요' : `${n(archivedCount)}곳 — 사이트에 안 보여요`,
    },
    blocks: {
      title: '블랙리스트',
      description:
        blockSummary?.kind === 'ok'
          ? `${n(blockSummary.active)}곳 막힘 · ${n(blockSummary.expired)}곳 지남`
          : blockSummary?.kind === 'unavailable'
            ? '미적용 — 표가 아직 없어요'
            : '분석이 다시 후보로 만들지 않는 가게',
    },
  };
  /** 등록 완료·등록 해제 칸 공통 — 목록을 못 읽었으면 두 칸 모두 같은 오류 + 다시 시도, 읽는 중이면 안내. */
  const placeTabFallback =
    managedError !== null ? (
      <div className="px-4 pt-6 md:px-6">
        <p className="text-sm text-error-primary">{managedError}</p>
        <Button color="primary" size="sm" className="mt-3" onClick={() => clientRef.current && void loadManaged(clientRef.current)}>
          다시 시도
        </Button>
      </div>
    ) : managed === null ? (
      <p className="px-4 pt-6 text-sm text-tertiary md:px-6">장소를 불러오고 있어요</p>
    ) : null;

  const reportLine = reports?.kind === 'ok' ? reportHeadline(reports.rows, new Date()) : undefined;

  const expiry = new Date(session.expiresAt * 1000).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="pb-8">
      {/*
        * 제목은 **탭마다** 다르다(2026-09-30 v2) — '올린 장소' 칸에서도 '장소 검수' 라 적혀 지금 어느 칸인지를 제목이 말하지 못했다.
        * 설명문(여기서 바꾼 것은 빌드 뒤에 보인다 등)은 `?` 하나로 모았다(`HELP`).
        */}
      <PageHeader
        title={TAB_HEADER[tab].title}
        description={TAB_HEADER[tab].description}
        actions={
          <div className="flex items-center gap-2">
            <span
              title={HELP}
              aria-label={HELP}
              className="flex size-6 cursor-help items-center justify-center rounded-full border border-secondary text-xs text-tertiary"
            >
              ?
            </span>
            <Button color="secondary" size="sm" onClick={signOut}>
              로그아웃
            </Button>
          </div>
        }
      />
      <div className="px-4 pt-1 text-xs text-tertiary md:px-6">
        <p>
          {session.email} · {expiry} 지나면 다시 로그인해요
        </p>
        {/*
          * 재빌드가 **정말 걸렸는지** 를 말하는 줄(→ `adminRebuild.ts`). 못 읽었으면(undefined) 아무 말도 하지 않는다.
          * 정상(`ok`)은 회색 글씨다 — 초록은 매번 뜨는 줄에 쓰기에는 센 색이다(경고만 색).
          */}
        {rebuild ? (
          <p className={cx('mt-0.5', rebuild.tone === 'warn' && 'text-warning-primary')}>{rebuild.text}</p>
        ) : null}
        {/*
          * 쓰기 도중에 끊긴 후보는 `approved` 로 남아 **이 목록에 안 나온다**(목록은 pending 만 읽는다).
          * 그 줄을 안 띄우면 새로고침 뒤에 그냥 사라진 것처럼 보여 승인이 통과한 줄 안다 — 이어받는 길을 여기서 말해 준다.
          */}
        {/* 사용자 제보(ADR-021 R2 — "쌓이면 머리글에 보인다"). 표가 없으면 미적용, 0건이면 말하지 않는다. */}
        {reports?.kind === 'unavailable' ? (
          <p className="mt-0.5">사용자 제보 표가 아직 적용되지 않았어요 — DB 마이그레이션이 적용되면 여기 보여요.</p>
        ) : reportLine && (reportLine.open > 0 || reportLine.today > 0) ? (
          <p className={cx('mt-0.5', reportLine.open > 0 && 'text-warning-primary')}>
            열린 제보 {reportLine.open}건 · 오늘 들어온 것 {reportLine.today}건 — 등록 완료 칸의 ‘제보 있는 곳’ 에서 봐요
          </p>
        ) : null}
        {stranded ? (
          <p className="mt-0.5 text-warning-primary">
            반영이 끊긴 후보 {stranded}건이 있어요 — 터미널에서 pnpm data:apply 를 한 번 돌려 주세요.
          </p>
        ) : null}
      </div>

      {/*
        * 다섯 칸 — 올리는 일과 내리는 일을 한 목록에 섞지 않는다(`TTab` 주석). 라벨 옆 숫자가 "어디에 일이 있나" 를 탭 줄에서 읽히게 한다.
        * **밑줄 탭이다**(2026-09-30 v2). 채운 핑크 버튼이던 동안 주 버튼(올리기)과 같은 모양이라 화면에서 가장 센 물체가
        * 가장 드문 동작(칸 전환)이었다. 좁은 화면에서는 줄이 가로로 밀린다 — 다섯 라벨이 한 줄에 안 들어가도 줄바꿈하지 않는다.
        */}
      <div className="mt-3 flex gap-5 overflow-x-auto border-b border-secondary px-4 md:px-6" role="tablist" aria-label="검수 칸">
        {TAB_LABELS.map((entry) => {
          const active = entry.key === tab;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.key)}
              className={cx(
                '-mb-px shrink-0 border-b-2 px-0.5 pb-2 text-sm font-semibold whitespace-nowrap',
                active ? 'border-brand text-brand-secondary' : 'border-transparent text-quaternary hover:text-secondary',
              )}
            >
              {entry.label}
              {tabCount[entry.key] !== undefined ? <span className="ml-1 font-normal tabular-nums">{tabCount[entry.key]}</span> : null}
              {tabUnapplied[entry.key] ? <span className="ml-1 text-xs font-normal text-warning-primary">미적용</span> : null}
            </button>
          );
        })}
      </div>

      {/*
        * **칸을 바꿔도 언마운트하지 않는다** — 다섯 칸을 모두 그려 두고 `hidden` 으로 가린다. 검수 대기 40번째 줄을 펼친 채
        * 등록 완료에서 짝을 보고 돌아오는 흐름이 잦아서(D7), 펼침·스크롤·고른 것이 칸을 오가며 사라지면 안 된다.
        * 고른 것(`selected`)은 지금 검수 대기만 쓴다 — 다른 칸이 일괄을 갖게 되면(T3.2·T5.2) 칸마다 따로 둔다(키 공간이 다르다).
        */}
      <div hidden={tab !== 'posts'}>
        <AdminPagePostsPanel counts={postCounts} error={postError} />
        <AdminPageSuggestions suggestions={suggestions} busyId={suggestionBusy} onClose={(row, status) => void closeSuggestion(row, status)} />
        {suggestionError ? <p className="mt-2 px-4 text-xs text-error-primary md:px-6">{suggestionError}</p> : null}
      </div>
      <div hidden={tab !== 'blocks'}>
        <AdminPageBlocksPanel summary={blockSummary} />
      </div>
      <div hidden={tab !== 'places'}>
        {placeTabFallback ?? (
          <AdminPagePlaceList
            mode="active"
            places={managed ?? []}
            states={placeStates}
            notice={placeNotice}
            patchState={patchPlaceState}
            onChange={(place, kind, reason, note, block) => void changePlace(place, kind, reason, note, block)}
            blocks={placeBlocks}
            onSetBlock={(place, choice) => void changePlaceBlock(place, choice)}
            reports={reportsByPlace}
            onHandleReports={(place, ids, status, note) => void handleReports(place, ids, status, note)}
            visited={visitedByPlace}
            onApplyVisited={(place, ids) => void applyVisited(place, ids)}
            onSaveAddress={(place, patch) => void savePlaceAddress(place, patch)}
            onClearDone={clearPlaceDone}
          />
        )}
      </div>
      <div hidden={tab !== 'archived'}>
        {placeTabFallback ?? (
          <AdminPagePlaceList
            mode="archived"
            places={managed ?? []}
            states={placeStates}
            notice={placeNotice}
            patchState={patchPlaceState}
            onChange={(place, kind, reason, note, block) => void changePlace(place, kind, reason, note, block)}
            blocks={placeBlocks}
            onSetBlock={(place, choice) => void changePlaceBlock(place, choice)}
            reports={reportsByPlace}
            onHandleReports={(place, ids, status, note) => void handleReports(place, ids, status, note)}
            visited={visitedByPlace}
            onApplyVisited={(place, ids) => void applyVisited(place, ids)}
            onSaveAddress={(place, patch) => void savePlaceAddress(place, patch)}
            onClearDone={clearPlaceDone}
          />
        )}
      </div>

      <div hidden={tab !== 'candidates'}>
      {groups.length > 0 && (
        /*
         * **걸러 보기 = 이름표가 붙은 드롭다운 넷.** 드롭다운은 고른 값 하나만 보이고, 펼치면 **선택지마다 뜻과 개수**가 나온다.
         * 개수 규칙은 그대로다 — 나를 뺀 나머지 축을 적용한 뒤 센다(`without`). 폭은 선택지 설명이 잘리지 않을 만큼이다.
         */
        <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 px-4 md:px-6">
          <Select
            label="경고"
            size="sm"
            className="w-56"
            selectedKey={warnFilter}
            onSelectionChange={(key) => key && pickWarn(key as TWarnFilter)}
          >
            {WARN_FILTERS.map((entry) => (
              <Select.Item key={entry.key} id={entry.key} supportingText={entry.hint}>
                {`${entry.label} ${baseWarn.filter((card) => warnMatches(entry.key, card)).length}`}
              </Select.Item>
            ))}
          </Select>
          <Select
            label="짝"
            size="sm"
            className="w-56"
            selectedKey={tierFilter}
            onSelectionChange={(key) => key && pickTier(key as TTierFilter)}
          >
            {TIER_FILTERS.map((entry) => (
              <Select.Item key={entry.key} id={entry.key} supportingText={entry.hint}>
                {`${entry.label} ${baseTier.filter((card) => entry.match(card.group)).length}`}
              </Select.Item>
            ))}
          </Select>
          <Select
            label="종류"
            size="sm"
            className="w-36"
            selectedKey={typeFilter}
            onSelectionChange={(key) => key && pickType(key as TTypeFilter)}
          >
            {TYPE_FILTERS.map((entry) => (
              <Select.Item key={entry.key} id={entry.key}>
                {`${entry.label} ${baseType.filter((card) => typeMatches(entry.key, card.group)).length}`}
              </Select.Item>
            ))}
          </Select>
          <Select
            label="동반 조건"
            size="sm"
            className="w-56"
            selectedKey={policyFilter}
            onSelectionChange={(key) => key && pickPolicyExact(key as TPolicyFilter)}
          >
            {POLICY_FILTERS.map((entry) => (
              <Select.Item key={entry.key} id={entry.key} supportingText={entry.hint}>
                {`${entry.label} ${entry.key === 'all' ? basePolicy.length : basePolicy.filter(POLICY_FILTER_MATCH[entry.key]).length}`}
              </Select.Item>
            ))}
          </Select>
          <p className="pb-2 text-xs text-tertiary">
            {filtered.length}곳 보는 중
            {filtersOn && (
              <>
                {' · '}
                <button type="button" className="text-brand-secondary underline" onClick={resetFilters}>
                  걸러 보기 풀기
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {/*
        * 일괄 반려 줄. **결과 한 줄(`bulk.summary`)이 남아 있으면 목록이 비어도 계속 그린다** —
        * 141묶음을 한 번에 반려하면 그 직후 화면은 '확인할 장소가 없어요' 가 되는데, 그 자리에서 이 줄까지
        * 사라지면 방금 한 일이 성공했는지 실패했는지 말해 주는 것이 화면에 하나도 없다.
        */}
      {groups.length > 0 || bulk.summary ? (
        <AdminPageBulkBar
          selectedCount={selectedKeys.length}
          visibleCount={filteredKeys.length}
          allSelected={allKeysSelected(selected, filteredKeys)}
          busy={Boolean(bulk.busy)}
          mode={bulk.mode}
          summary={bulk.summary}
          error={bulk.error}
          latestCount={selectedKeys.length ? bulkLatestTargets(groups.filter((group) => selectedSet.has(group.key)), placesView).eligible.length : 0}
          approveNeedsLook={bulkApproveNeedsLook(bulkApproveSummary(groups, selectedKeys, placesView))}
          confirmText={
            bulk.mode === 'reanalyze' && selectedKeys.length
              ? reanalyzeSummary(planFor(selectedKeys))
              : bulk.mode === 'latest'
                ? bulkLatestSummary(bulkLatestTargets(groups.filter((group) => selectedSet.has(group.key)), placesView))
                : bulk.mode === 'approve'
                  ? bulkApproveText(bulkApproveSummary(groups, selectedKeys, placesView))
                  : undefined
          }
          onToggleAll={(next) =>
            setSelected((prev) => (next ? selectKeys(prev, filteredKeys) : clearKeys(prev, filteredKeys)))
          }
          onClear={() => setSelected(EMPTY_SELECTION)}
          onStart={(mode) => setBulk({ mode })}
          onCancel={() => setBulk({})}
          onReject={(reason, note, block) => void rejectSelected(selectedKeys, reason, note, block)}
          onConfirm={() => {
            if (bulk.mode === 'reanalyze') void reanalyze(selectedKeys, 'bulk');
            else if (bulk.mode === 'approve' || bulk.mode === 'latest') void applySelected(selectedKeys, bulk.mode);
          }}
        />
      ) : null}

      {groups.length === 0 ? (
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            Icon={CheckDone01}
            title="확인할 장소가 없어요"
            description="새 블로그 글을 분석하면 여기 쌓여요 — 지금은 기다리면 돼요."
          />
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-4 pt-6 text-sm text-tertiary md:px-6">이 조건에 맞는 장소가 없어요 — 걸러 보기를 꺼 보세요.</p>
      ) : (
        <>
          <div className="mt-3">
            <AdminTable
              grid={ADMIN_CANDIDATE_GRID}
              columns={COLUMNS}
              lead
              /*
               * 머리글의 체크박스가 전부 고르기다. **고르는 범위는 화면에 그린 줄이 아니라 걸러 보기에 걸린 전부**라
               * 그 수를 이름표에 싣는다(`filteredKeys` 가 그 집합이고, 표 위 줄의 버튼과 같은 것을 고른다).
               */
              selectAll={{
                isSelected: allKeysSelected(selected, filteredKeys),
                isIndeterminate: selectedKeys.length > 0 && !allKeysSelected(selected, filteredKeys),
                isDisabled: Boolean(bulk.busy) || filteredKeys.length === 0,
                label: `걸러 보기에 걸린 ${filteredKeys.length}곳 전부 고르기`,
                onChange: (next) =>
                  setSelected((prev) => (next ? selectKeys(prev, filteredKeys) : clearKeys(prev, filteredKeys))),
              }}
            >
            {filtered.slice(0, shown).map(({ group, preview, view }) => {
              const state = states[group.key] ?? {};
              return (
                <AdminPageGroupCard
                  key={group.key}
                  group={group}
                  preview={preview}
                  view={view}
                  state={state}
                  expanded={expanded === group.key}
                  onToggle={() => setExpanded((prev) => (prev === group.key ? null : group.key))}
                  onApprove={(choice) => void approve(group, choice)}
                  onStartReject={() => patchState(group.key, { rejecting: true, error: undefined })}
                  onCancelReject={() => patchState(group.key, { rejecting: false })}
                  onReject={(reason, note, block) => void reject(group, reason, note, block)}
                  onPickRegion={(regionRaw) => patchState(group.key, { regionDraft: regionRaw })}
                  onSaveRegion={(regionRaw) => void saveRegion(group, regionRaw)}
                  onEditDraft={(editDraft) => patchState(group.key, { editDraft })}
                  onSaveEdit={(editDraft) => void saveEditFor(group, editDraft)}
                  onChooseAddress={(choice) => void chooseAddressFor(group, choice)}
                  selected={selected.has(group.key)}
                  onSelect={() => setSelected((prev) => toggleSelected(prev, group.key))}
                  pairPlace={expanded === group.key ? pairPlaceOf(group, state) : undefined}
                  reanalyzeText={expanded === group.key && state.reanalyzing ? reanalyzeSummary(planFor([group.key])) : undefined}
                  onStartReanalyze={() => patchState(group.key, { reanalyzing: true, rejecting: false, error: undefined })}
                  onCancelReanalyze={() => patchState(group.key, { reanalyzing: false })}
                  onReanalyze={() => void reanalyze([group.key], { key: group.key })}
                />
              );
            })}
            </AdminTable>
          </div>

          {/*
            * 감시판과 남은 수를 **함께** 둔다. 저절로 이어 그리더라도 "지금 몇 개 중 몇 개를 보고 있나" 가
            * 화면에서 사라지면, 걸러 보기를 켠 목록이 끝난 것인지 아직 그리는 중인지 구분할 자리가 없다.
            */}
          <div ref={setSentinel} className="px-4 pt-3 text-xs text-tertiary md:px-6">
            {filtered.length > shown
              ? `${filtered.length}곳 중 ${shown}곳 · 스크롤하면 더 보여요`
              : `${filtered.length}곳을 모두 봤어요`}
          </div>
            </>
          )}
      </div>
    </div>
  );
}
