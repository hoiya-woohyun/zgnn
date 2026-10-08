'use client';

import { CheckDone01, SearchLg } from '@untitledui/icons';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { SEARCH_FIELD } from '../components/noAutofill';
import { Select } from '../components/base/select';
import { EmptyState } from '../components/layout/emptyState';
import { PageHeader } from '../components/layout/pageHeader';
import { approveGroup, confirmSite, saveEdit, setRegion } from '../lib/adminApply';
import {
  archiveAndBlock,
  archiveOutcomeText,
  blocksSummaryOf,
  extendBlock,
  fetchBlocks,
  liftBlock,
  placeBlocksOf,
  rejectAndBlock,
  rejectOutcomeText,
  restoreAndLift,
  setPlaceBlock,
  type TBlockChoice,
  type TBlockRow,
  type TBlocksLoad,
} from '../lib/adminBlocks';
import { chooseAddress } from '../lib/adminEdit';
import { addressUnresolved, type TAddressChoice } from '../lib/adminAddress';
import { prepareReanalyze, reanalyzePlan, reanalyzeSummary } from '../lib/adminReanalyze';
import { collectView, fetchCollectRequests, requestCollect, type TCollectRequestsLoad } from '../lib/adminCollectRequest';
import { requestAnalyze, type TAnalyzeLimit } from '../lib/adminRequests';
import { bulkApproveJobs, bulkApproveNeedsLook, bulkApproveSummary, bulkApproveText, bulkLatestSummary, bulkLatestTargets, bulkTone, stoppedNote, summarizeBulk, type TBulkTally, type TBulkTone } from '../lib/adminBulk';
import {
  countStrandedCandidates,
  fetchMatchablePlaces,
  fetchPendingCandidates,
  flagsFor,
  groupPending,
  updateGroupsByPlace,
  previewFor,
  KIND_LABEL,
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
  matchesGroupQuery,
  SEED_VERIFIED_AT,
  seedVerifyTargets,
  sortManagedPlaces,
  stampSeedVerified,
  type TArchiveReason,
} from '../lib/adminPlaces';
import { type TPlaceEditPatch, updatePlace } from '../lib/adminPlaceEdit';
import {
  countPosts,
  excludePosts,
  fetchPostBacklog,
  fetchPosts,
  fetchSiblings,
  planPlaceReread,
  planReread,
  reopenPlan,
  unexcludePosts,
  type TPostBacklog,
  type TPostCounts,
  type TPlaceRereadPlan,
  type TPostRow,
  type TReopenPlan,
} from '../lib/adminPosts';
import { fetchPromptVersions } from '../lib/adminPostVersions';
import {
  closeReportsForArchived,
  fetchReports,
  mergeReportRows,
  openReportsByPlace,
  policyReportCounts,
  openSuggestions,
  reportHeadline,
  setReportStatus,
  type TReportRow,
  type TReportsLoad,
  type TVisitedTally,
  visitedTallyByPlace,
} from '../lib/adminReports';
import { adminFlagView, POLICY_STATE_WORD, TYPE_MISMATCH_FLAG, typeMismatchFlags } from '../lib/adminPreview';
import { UNREAD_BADGE_LABEL } from '../lib/petPolicy';
import { verifyListedOnly, verifyNeedsLook } from '../lib/adminVerify';
import { fetchOpsOverview } from '../lib/adminOps';
import { adminBandStage, stageHealth, type TStageHealth, type TWorkerHealth, WORKER_PHASE_LABEL, workerHealth } from '../lib/adminOpsHealth';
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
  type TKindFilter,
  type TTypeFilter,
  type TWarnFilter,
} from '../lib/adminUrlState';
import { cx } from '../utils/cx';
import { useAdminInfiniteScroll } from './adminInfiniteScroll';
import { AdminPageAnalyzeRequest } from './adminPageAnalyzeRequest';
import { AdminPageBlocksPanel } from './adminPageBlocksPanel';
import type { TAdminPageBlocksRowState } from './adminPageBlocksRow';
import { AdminPageBulkBar } from './adminPageBulkBar';
import { AdminPageGroupCard, type TAdminPageGroupState, type TApproveChoice } from './adminPageGroupCard';
import { AdminPageLogin } from './adminPageLogin';
import { AdminPagePlaceList } from './adminPagePlaceList';
import type { TAdminPagePlaceState } from './adminPagePlaceRow';
import { AdminPagePostsPanel } from './adminPagePostsPanel';
import { AdminPageSuggestions } from './adminPageSuggestions';
import { ADMIN_CANDIDATE_TRACKS, AdminTable } from './adminTable';

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
 *
 * 뒤의 세 줄(2026-10-06, todo/13 T4.5)은 동반 조건 칸에 서는 비슷한 세 말의 차이다 — 하나는 정상이고 둘은 볼 일인데 같은 자리에 같은 크기로 선다.
 * 단어는 상수에서 끼운다(표의 단어가 바뀌면 도움말도 따라간다). '원문 확인 필요' 는 칸의 단어가 아니라 **칩**이다(`UNREAD_BADGE_LABEL`) —
 * 표의 '못 읽음'(`POLICY_STATE_WORD.unread`)은 그 칩조차 안 선 드문 갈래라 여기서 말하지 않는다.
 */
const HELP_LINES = [
  '여기서 바꾼 것은 사이트가 다시 빌드된 뒤에 보여요.',
  '줄을 누르면 근거(원문 · 나갈 값 · 블로그 인용)가 펼쳐지고, 그 끝에서 이 줄을 올리거나 제외해요.',
  '제외: 사유를 고르면 후보는 목록에서 빠져요. 「블랙리스트에」 를 3개월·영구로 고르면 그 가게 이름의 새 글도 한동안 후보로 올라오지 않아요.',
  '줄 앞 체크박스로 여러 곳을 고르면 표 위에 한꺼번에 처리하는 줄이 떠요.',
  '올리기: 짝이 있으면 그 장소의 빈 칸만 채우고, 없으면 새 장소로 올라가요. 덮어쓰기: 짝의 칸을 새 분석 값으로 바꿔요.',
  '재분석: 그 글을 수집 완료로 되돌려요(지우지 않아요). 터미널에서 pnpm data analyze 를 돌리면 다시 읽어요.',
  `${POLICY_STATE_WORD.noText}: 블로그 본문에 동반 조건 문장이 아예 없어요 — 교차점검을 했으면 강아지가 있었는지는 그 줄이 말해요.`,
  `${POLICY_STATE_WORD.noLimit}: "동반 가능" 문장은 있는데 크기·실내·요금 같은 조건이 안 적혀 있어요 — 올리면 사이트엔 '확인이 필요해요' 로 나가요.`,
  `${UNREAD_BADGE_LABEL}(칩): 조건 문장은 있는데 판정 규칙이 못 읽었어요 — 사이트에도 "원문을 확인해 주세요" 로 나가요.`,
];
const HELP = HELP_LINES.join('\n');

type TBulkMode = 'reject' | 'reanalyze' | 'approve' | 'latest';

/*
 * 동반 조건 축(`TPolicyFilter`)은 한 축의 배타적인 선택지다. **불리언 토글 여럿으로 두지 않는다** — '조건이 적힌 것' 과 '교차점검이 근거를 못 찾은 것' 은
 * 교집합이 없다(교차점검은 조건 문장이 없는 후보에만 돈다). 토글 둘이면 둘을 같이 켤 수 있고 그 목록은 늘 빈다.
 * '동반 표기만인 것'(2026-10-04)도 교차점검의 한 갈래라 같은 축에 선다(`verifyListedOnly`).
 * 걸러 보기 네 축의 타입은 주소 쿼리가 같이 읽고 써야 해서 `adminUrlState.ts` 가 소유한다.
 */

/**
 * 경고 축(2026-09-30 v2). 21줄을 다 훑어야 경고를 찾던 자리다 — 올리기 전에 사람이 봐야 하는 것만 센다.
 * `any` 는 선택지 전부의 합집합이고, 각 선택지는 서로 겹칠 수 있다(한 줄이 지역도 없고 주소도 다를 수 있다).
 * `종류 엇갈림`(2026-10-04)은 막지는 않지만 그대로 올리면 종류 칩·지도 색이 틀린다(`typeMismatchFlags`).
 */

const WARN_MATCH: Record<Exclude<TWarnFilter, 'all' | 'any' | 'waiting' | 'failed'>, (card: { group: TCandidateGroup; view: { badges: { key: string }[] } }) => boolean> = {
  region: (card) => card.view.badges.some((badge) => badge.key === '지역 없음'),
  address: (card) => addressUnresolved(card.group.lead.extracted),
  noBasis: (card) => verifyNeedsLook(card.group.lead.extracted.verify),
  typeMismatch: (card) => card.view.badges.some((badge) => badge.key.startsWith(TYPE_MISMATCH_FLAG)),
};

/**
 * 후보의 성질이 아니라 **방금 일괄이 남긴 줄**을 고르는 둘(todo/09 T6.4). 결과 줄이 "2곳은 직접 골라야 해요 · 1곳 실패" 라 말한
 * 그 셋을 141줄에서 찾는 길이다. `any`(경고 있는 것)에는 안 넣는다 — 그 선택지는 올리기 전에 볼 성질을 세는 것이고 이 둘은 새로고침하면 없다.
 */
const BULK_MATCH: Record<'waiting' | 'failed', (state: TAdminPageGroupState | undefined) => boolean> = {
  waiting: (state) => Boolean(state?.similar || state?.archived),
  failed: (state) => Boolean(state?.error),
};

const WARN_FILTERS: { key: TWarnFilter; label: string; hint?: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'any', label: '경고 있는 것', hint: '아래 중 하나라도 걸린 곳' },
  { key: 'region', label: '지역 없음', hint: '지역을 골라야 올릴 수 있어요' },
  { key: 'address', label: '주소 다름', hint: '원글 주소와 검색 주소 중 하나를 골라야 올릴 수 있어요' },
  { key: 'noBasis', label: '동반 근거 없음', hint: '교차점검이 강아지를 데려간 근거를 못 찾은 곳' },
  { key: 'typeMismatch', label: '종류 엇갈림', hint: '네이버 카테고리·요약은 카페인데 종류가 식당인 곳(반대도)' },
  { key: 'waiting', label: '결정 기다림', hint: '방금 일괄에서 사람이 골라야 해서 멈춘 줄 — 펼쳐서 고르세요' },
  { key: 'failed', label: '실패', hint: '방금 쓰기가 실패한 줄 — 이유는 줄에 적혀 있어요' },
];

const warnMatches = (filter: TWarnFilter, card: { group: TCandidateGroup; view: { badges: { key: string }[] } }, state?: TAdminPageGroupState): boolean =>
  filter === 'all' ||
  (filter === 'any'
    ? Object.values(WARN_MATCH).some((match) => match(card))
    : filter === 'waiting' || filter === 'failed'
      ? BULK_MATCH[filter](state)
      : WARN_MATCH[filter](card));

const POLICY_FILTERS: { key: TPolicyFilter; label: string; hint?: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'has', label: '조건이 적힌 것', hint: '블로그 본문에 동반 조건 문장이 있는 후보' },
  { key: 'needsLook', label: '동반 근거 없는 것', hint: '교차점검이 본문에서 강아지를 데려간 근거를 못 찾은 후보' },
  { key: 'listedOnly', label: '동반 표기만인 것', hint: '본문이 동반 가능이라 적었을 뿐 강아지가 함께 있었다는 서술은 없는 후보' },
];

const POLICY_FILTER_MATCH: Record<Exclude<TPolicyFilter, 'all'>, (card: { group: TCandidateGroup }) => boolean> = {
  has: (card) => card.group.hasPolicyText,
  needsLook: (card) => verifyNeedsLook(card.group.lead.extracted.verify),
  listedOnly: (card) => verifyListedOnly(card.group.lead.extracted.verify),
};

/**
 * 짝 축 — 기존 장소와의 관계이자 승인하면 무슨 일이 일어나나. **하나의 축이다**(2026-10-06, todo/13 T4.3).
 * 예전엔 '짝'(tier: 기존·확인·신규)과 '할 일'(kind: 갱신·보강·신규·확인, 11 U2)이 따로 섰는데, 신규·확인이 양쪽에 있고 `기존` = 갱신 + 보강이라
 * 선택지가 사실상 같았다 — 둘을 엇갈리게 고르면 늘 빈 목록이 됐다. `kind` 가 `tier` 를 빈틈없이 나누므로(`summarizeGroup`: 갱신이 하나라도 있으면
 * 갱신, 아니면 기존 → 보강 · 확인 · 신규) 더 잘게 가르는 `kind` 하나만 남긴다. 라벨 뒤의 `(기존)` 은 표의 뱃지와 이어 읽게 하려는 것이다.
 */
const KIND_FILTERS: { key: TKindFilter; label: string; hint?: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'update', label: `${KIND_LABEL.update} (${TIER_LABEL.auto})`, hint: '이미 올린 장소에 다른 사실을 말하는 글 — 덮어쓸 칸을 골라요' },
  { key: 'fill', label: `${KIND_LABEL.fill} (${TIER_LABEL.auto})`, hint: '이미 올린 장소와 같은 곳 — 올리면 빈 칸만 채워 합쳐져요' },
  { key: 'ask', label: KIND_LABEL.ask, hint: '비슷한 장소가 있어 같은 곳인지 봐야 해요' },
  { key: 'new', label: KIND_LABEL.new, hint: '처음 보는 곳 — 올리면 새 장소로 올라가요' },
];

const kindMatches = (filter: TKindFilter, group: TCandidateGroup): boolean => filter === 'all' || group.kind === filter;

/**
 * 종류 축. 짝·동반 정보와 **겹치지 않는 축**이다 — 종류로 좁힌 뒤 짝으로 다시 좁히는 것이
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
  const [kindFilter, setKindFilter] = useState<TKindFilter>(initialUrl.kind);
  /**
   * 이름 검색(todo/13 T4.2). 주소에 싣지 않는다 — 등록 완료 칸의 검색과 같은 결정이다: 검색어는 그 순간의 것이라
   * 새로고침·재로그인 뒤에 남아 있으면 "목록이 왜 이렇게 짧지" 가 된다. 걸러 보기 축 하나로 센다(`AXES.query`).
   */
  const [nameQuery, setNameQuery] = useState('');
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
  const [bulk, setBulk] = useState<{
    busy?: boolean;
    mode?: TBulkMode;
    /** 돌고 있는 동안 몇 번째인지(todo/09 T6.5). */
    progress?: { done: number; total: number };
    stopping?: boolean;
    summary?: string;
    tone?: TBulkTone;
    error?: string;
  }>({});
  /** `멈추기` 의 깃발 — 루프가 다음 묶음 전에 본다. 상태가 아니라 ref 인 이유: 루프는 한 번 닫힌 클로저라 state 를 못 본다. */
  const bulkStopRef = useRef(false);
  const stopBulk = useCallback(() => {
    bulkStopRef.current = true;
    setBulk((prev) => ({ ...prev, stopping: true }));
  }, []);
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
  /**
   * 미분석 글의 집계와 다음 30건(todo/13 T4.4). 6천 행을 읽으므로 로그인 직후가 아니라 **수집 완료 칸을 처음 열 때** 한 번 읽는다.
   * undefined = 아직 안 읽었다(또는 읽는 중). 실패는 그 칸에서만 말한다.
   */
  const [backlog, setBacklog] = useState<{ data?: TPostBacklog; error?: string } | undefined>(undefined);
  const backlogAskedRef = useRef(false);
  /**
   * 풀지 않은 블랙리스트 행 전부(09 T1.5). undefined = 아직 못 읽었다. 탭 건수(`blockSummary`)와 등록 해제 칸의 칩(`placeBlocks`)은
   * **여기서 파생한다** — 풀기·기간 바꾸기가 이 하나를 고치면 셋이 같은 틱에 움직인다.
   */
  const [blocks, setBlocks] = useState<TBlocksLoad | undefined>(undefined);
  const blockSummary = useMemo(() => blocksSummaryOf(blocks, new Date()), [blocks]);
  /** 장소 id → 열린 블랙리스트(등록 해제 칸의 칩). undefined = 표가 없거나 못 읽었다. */
  const placeBlocks = useMemo(() => placeBlocksOf(blocks), [blocks]);
  /** 블랙리스트 칸의 줄 상태(풀기·기간 바꾸기) — 행 id 별. */
  const [blockStates, setBlockStates] = useState<Record<string, TAdminPageBlocksRowState>>({});
  /** 방금 푼 줄의 한 줄 — 푼 줄은 목록에서 빠지므로 패널 위에 선다. */
  const [blockNotice, setBlockNotice] = useState<string | undefined>(undefined);
  /** 추가 수집 요청(가게마다 마지막 하나). 못 읽었으면 카드에 버튼이 안 선다 — 검수는 막지 않는다. */
  const [collectRequests, setCollectRequests] = useState<TCollectRequestsLoad | undefined>(undefined);
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
  /** 같은 가게의 두 신호(사용자 제보 · 블로그 갱신)가 서로 보이게(11 T3.2). */
  const policyReportsByPlace = useMemo(() => policyReportCounts(reportsByPlace), [reportsByPlace]);
  const updatesByPlace = useMemo(() => updateGroupsByPlace(groups), [groups]);
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
   * 재빌드가 실제로 불렸는지. `undefined` 는 "아직 읽는 중" 이다 — 머리글이 흐린 `재빌드 상태 확인 중` 으로 자리만 잡는다(todo/13 T4.1).
   * 못 읽었으면 `refreshRebuild` 가 `tone: 'none'` 문장으로 채운다 — 못 읽은 것을 "안 불렸다" 로 말하면 멀쩡한 시스템을 고장으로 신고하게 만든다.
   */
  const [rebuild, setRebuild] = useState<TRebuildHeadline | undefined>(undefined);
  /**
   * 운영 현황의 다섯 칸(todo/15 T4.2) — 경고 띠에 "수집이 9일째 없어요 · 운영 현황 →" 한 줄을 더하려고 받는다.
   * 못 읽었으면 null 이고 **아무 말도 하지 않는다** — 이 줄은 덤이라, 못 읽은 것을 말하면 검수 화면이 남의 고장으로 시끄러워진다.
   */
  const [opsStages, setOpsStages] = useState<TStageHealth[] | null>(null);
  /**
   * 로컬 워커(todo/17 T5.3) — 같은 `ops_overview` 응답에서 판정한다. 열 때 한 번이고 구독하지 않는다(구독은 `/admin/ops`).
   * 못 읽었거나 응답에 `workers` 키가 없으면(마이그레이션 전) null — 모르는 것을 "워커 없음" 으로 말하지 않는다.
   */
  const [opsWorker, setOpsWorker] = useState<TWorkerHealth | null>(null);
  /**
   * 같은 응답의 미분석 글 수와 대기 중인 요청 수(todo/17 T6) — 「저수지 N건 분석」 라벨과 머리글 `요청 N건 대기`.
   * 요청을 넣은 뒤엔 로컬로 +1 하지 않고 `loadOpsStages` 를 다시 부른다(워커 상태까지 한 번에 맞는다). 못 읽었으면 null.
   */
  const [opsQueue, setOpsQueue] = useState<{ backlog: number; requestsQueued?: number } | null>(null);

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
      // 건수가 바뀌었으면 미분석 집계도 낡았다 — 수집 완료 칸에 있으면 곧바로, 아니면 다음에 열 때 다시 읽는다(아래 효과).
      backlogAskedRef.current = false;
    } catch (error) {
      setPostCounts(undefined);
      setPostError(messageOf(error, '수집한 글을 세지 못했어요.'));
    }
    setBlocks(await fetchBlocks(client));
    setCollectRequests(await fetchCollectRequests(client));
    applyReports(await fetchReports(client));
  }, [applyReports]);

  /**
   * 운영 현황 집계(7일)를 받아 다섯 칸으로 — **fire-and-forget**. `start` 의 `Promise.all` 에 넣지 않는다: 이 rpc 가 느리거나 없다고
   * (마이그레이션 미적용) 검수를 못 하게 만들면 안 된다(todo/15 「위험」 — `/admin` 이 느려진다). 실패는 조용히.
   */
  const loadOpsStages = useCallback(async (client: SupabaseClient) => {
    try {
      const overview = await fetchOpsOverview(client, 7);
      setOpsStages(stageHealth(overview, Date.now()));
      setOpsWorker(overview.workers ? workerHealth(overview.workers, Date.now()) : null);
      setOpsQueue({ backlog: overview.backlog.count, requestsQueued: overview.requestsQueued });
    } catch {
      setOpsStages(null);
      setOpsWorker(null);
      setOpsQueue(null);
    }
  }, []);

  const start = useCallback(async (next: TAdminSession) => {
    setFatal(null);
    setManaged(null);
    setManagedError(null);
    setPlaceStates({});
    setPlaceNotice(undefined);
    setPostCounts(undefined);
    setPostError(undefined);
    setBacklog(undefined);
    backlogAskedRef.current = false;
    setBlocks(undefined);
    setBlockStates({});
    setBlockNotice(undefined);
    applyReports(undefined);
    setStranded(undefined);
    setRebuild(undefined);
    setOpsStages(null);
    setOpsWorker(null);
    setOpsQueue(null);
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
    // 재빌드 줄은 끊긴 반영 수를 기다리지 않는다 — 머리글 자리는 미리 잡혀 있지만(T4.1), 경고 띠는 늦을수록 탭 줄을 늦게 민다.
    void refreshRebuild(client);
    void loadOpsStages(client);

    /*
     * 끊긴 반영(`approved`)은 목록에 안 나오므로 수만 따로 센다.
     * 위의 Promise.all 에 넣지 않는 이유: 이 조회가 실패한다고 검수를 못 하게 만들면 안 된다 — 세지 못하면 그냥 말하지 않는다.
     */
    try {
      setStranded(await countStrandedCandidates(client));
    } catch {
      setStranded(undefined);
    }
  }, [applyReports, loadCounts, loadManaged, loadOpsStages, refreshRebuild]);

  /** 미분석 글의 집계·다음 30건 — 실패는 수집 완료 칸에서만 말한다(검수는 막지 않는다). */
  const loadBacklog = useCallback(async (client: SupabaseClient, excludedApplied: boolean) => {
    try {
      setBacklog({ data: await fetchPostBacklog(client, excludedApplied) });
    } catch (error) {
      setBacklog({ error: messageOf(error, '미분석 글을 읽지 못했어요.') });
    }
  }, []);

  /*
   * 수집 완료 칸을 **열었을 때** 읽는다(`?tab=posts` 로 들어온 경우도 같다). 건수(`postCounts`)를 기다리는 이유:
   * 분석 제외 칸이 있는지를 거기서 알아야 집계가 머리글의 "미분석 N" 과 같은 집합이 된다.
   */
  useEffect(() => {
    const client = clientRef.current;
    if (phase !== 'ready' || tab !== 'posts' || !postCounts || !client || backlogAskedRef.current) return;
    backlogAskedRef.current = true;
    void loadBacklog(client, postCounts.excluded !== null);
  }, [loadBacklog, phase, postCounts, tab]);

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
   * 쓰기 잠금을 잡고 `run` 을 돈다 — 잠금을 못 잡으면 그 이유로 던진다(수집 칸의 준비 버튼은 결과를 자기 줄에 그린다).
   */
  const withWrite = useCallback(
    async <T,>(run: (client: SupabaseClient) => Promise<T>): Promise<T> => {
      const client = clientRef.current;
      if (!client) throw new Error('로그인이 필요해요.');
      let refused = '';
      if (!beginWrite((message) => (refused = message))) throw new Error(refused || '로그인이 만료됐어요.');
      try {
        return await run(client);
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite],
  );

  /** ① 시드 확인 날짜(11 H.6) — 찍은 행을 등록 완료 목록과 대조 장부에 같이 적는다. */
  const seedVerify = useCallback(
    () =>
      withWrite(async (client) => {
        const stamped = new Set(await stampSeedVerified(client, seedVerifyTargets(managed ?? []).map((place) => place.id)));
        const stamp = (row: TPlaceRow) => (stamped.has(row.id) ? { ...row, verified_at: SEED_VERIFIED_AT } : row);
        placesRef.current = placesRef.current.map(stamp);
        setManaged((prev) => (prev ? prev.map(stamp) : prev));
        afterWrite();
        return `시드 ${stamped.size}곳에 확인 날짜를 찍었어요 · 사이트에는 다음 빌드에서 보여요`;
      }),
    [afterWrite, managed, withWrite],
  );

  /** ② 다시 열 계획 — 읽기만 한다(잠금 없이). */
  const planReopen = useCallback(async (): Promise<TReopenPlan> => {
    const client = clientRef.current;
    if (!client) throw new Error('로그인이 필요해요.');
    const posts = postCounts?.existing?.alreadyHavePosts ?? [];
    return reopenPlan(posts, await fetchSiblings(client, posts));
  }, [postCounts]);

  /** ② 되돌리기 — 후보 먼저, 글 나중(`prepareReanalyze`). 눕힌 후보는 검수 대기에서 빠지므로 목록과 건수를 다시 읽는다. */
  const runReopen = useCallback(
    (plan: TReopenPlan) =>
      withWrite(async (client) => {
        await prepareReanalyze(client, plan);
        const laid = new Set(plan.lay.map((row) => row.id));
        setGroups((prev) => groupPending(prev.flatMap((group) => group.rows).filter((row) => !laid.has(row.id))));
        void loadCounts(client);
        return `글 ${plan.posts.length}건을 수집 완료로 되돌렸어요 · 터미널에서 pnpm data analyze --limit 30 을 돌리면 다시 읽어요`;
      }),
    [loadCounts, withWrite],
  );

  /*
   * 수집 완료 칸의 글 목록(09 T3.2). 읽기는 잠금 없이, 쓰기는 후보 쓰기와 같은 잠금(`withWrite`) 하나로.
   * 쓰기 뒤에는 건수를 다시 센다(`loadCounts` — 미분석 집계도 따라 낡음 표시가 된다). 페이지를 다시 읽는 것은 패널 몫이다.
   */
  const readPosts = useCallback((query: Parameters<typeof fetchPosts>[1]) => {
    const client = clientRef.current;
    return client ? fetchPosts(client, query) : Promise.reject(new Error('로그인이 필요해요.'));
  }, []);

  // 분석됨 칩 안의 프롬프트 판 분포(09 T3.3) — 읽기만. 언제 읽을지는 패널이 정한다(그 칩을 처음 열 때 · 쓰기 뒤).
  const readPromptVersions = useCallback((excludedApplied: boolean) => {
    const client = clientRef.current;
    return client ? fetchPromptVersions(client, excludedApplied) : Promise.reject(new Error('로그인이 필요해요.'));
  }, []);

  const excludePostRows = useCallback(
    (urls: string[], note: string) =>
      withWrite(async (client) => {
        const changed = await excludePosts(client, urls, note);
        void loadCounts(client);
        return `글 ${changed}건을 분석에서 뺐어요 · 다음 pnpm data analyze 부터 안 읽어요(이미 올라온 후보는 그대로예요)`;
      }),
    [loadCounts, withWrite],
  );

  const unexcludePostRows = useCallback(
    (urls: string[]) =>
      withWrite(async (client) => {
        const changed = await unexcludePosts(client, urls);
        void loadCounts(client);
        return `글 ${changed}건의 분석 제외를 풀었어요`;
      }),
    [loadCounts, withWrite],
  );

  const planPostReread = useCallback((rows: TPostRow[]) => {
    const client = clientRef.current;
    return client ? planReread(client, rows) : Promise.reject(new Error('로그인이 필요해요.'));
  }, []);

  /** 글 쪽 `다시 읽기` — ② 되돌리기와 같은 길(`prepareReanalyze` → 눕힌 후보를 검수 대기에서 빼고 → 건수). */
  const rereadPosts = useCallback(
    (plan: TReopenPlan) =>
      withWrite(async (client) => {
        await prepareReanalyze(client, plan);
        const laid = new Set(plan.lay.map((row) => row.id));
        setGroups((prev) => groupPending(prev.flatMap((group) => group.rows).filter((row) => !laid.has(row.id))));
        void loadCounts(client);
        const kept = plan.keep.length ? ` · 사람이 고친 후보 ${plan.keep.length}건은 남았어요` : '';
        return `글 ${plan.posts.length}건을 미분석으로 되돌렸어요 · 검수 대기 후보 ${plan.lay.length}건이 목록에서 빠졌어요${kept} — 터미널에서 pnpm data analyze 를 돌리면 다시 읽어요`;
      }),
    [loadCounts, withWrite],
  );

  const planPlaceSources = useCallback((place: TPlaceRow) => {
    const client = clientRef.current;
    return client ? planPlaceReread(client, [place.id]) : Promise.reject(new Error('로그인이 필요해요.'));
  }, []);

  /**
   * 등록한 장소의 `다시 분석`(09 T5.2) — 출처 글을 글 쪽 `다시 읽기` 와 같은 길(`prepareReanalyze`)로 되돌린다.
   * **`places` 에는 쓰지 않는다**(재빌드 트리거가 걸린 표) — 장소 목록·대조 장부는 그대로 두고 검수 대기만 다시 읽는다.
   */
  const rereadPlaceSources = useCallback(
    ({ plan }: TPlaceRereadPlan) =>
      withWrite(async (client) => {
        await prepareReanalyze(client, plan);
        const laid = new Set(plan.lay.map((row) => row.id));
        setGroups((prev) => groupPending(prev.flatMap((group) => group.rows).filter((row) => !laid.has(row.id))));
        void loadCounts(client);
        const kept = plan.keep.length ? ` · 사람이 고친 후보 ${plan.keep.length}건은 남았어요` : '';
        return `출처 글 ${plan.posts.length}건을 수집 완료로 되돌렸어요 · 사이트의 장소는 그대로예요${kept} — 터미널에서 pnpm data analyze 를 돌리면 검수 대기에 갱신 제안으로 올라와요`;
      }),
    [loadCounts, withWrite],
  );

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

  const patchBlockState = useCallback((id: string, patch: Partial<TAdminPageBlocksRowState>) => {
    setBlockStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  /**
   * 블랙리스트 칸의 `풀기`(09 T1.5). 다시 읽지 않고 그 행을 목록에서 뺀다 — 탭 건수·등록 해제 칸의 칩이 같은 상태에서
   * 파생하므로(`blocksSummaryOf`·`placeBlocksOf`) 같은 틱에 준다. `places` 는 안 바뀌므로 재빌드와 무관하다.
   */
  const liftBlockRow = useCallback(
    async (row: TBlockRow) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchBlockState(row.id, { error: message }))) return;
      patchBlockState(row.id, { busy: 'lifting', error: undefined, done: undefined });
      try {
        await liftBlock(client, row.id);
        setBlocks((prev) => (prev?.kind === 'ok' ? { kind: 'ok', rows: prev.rows.filter((r) => r.id !== row.id) } : prev));
        setBlockStates((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== row.id)));
        setBlockNotice(`${row.display_name} — 블랙리스트에서 풀었어요 · 다음 분석부터 이 가게의 새 글이 후보로 올라와요`);
      } catch (error) {
        patchBlockState(row.id, { busy: undefined, error: messageOf(error, '풀지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite, patchBlockState],
  );

  /** 블랙리스트 칸의 `기간 바꾸기` — `until` 한 칸. 그 줄만 제자리에서 고친다(지난 줄이면 다시 막는 줄이 되어 건수가 같은 틱에 는다). */
  const extendBlockRow = useCallback(
    async (row: TBlockRow, choice: Exclude<TBlockChoice, 'none'>) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchBlockState(row.id, { error: message }))) return;
      patchBlockState(row.id, { busy: 'extending', error: undefined, done: undefined });
      try {
        const until = await extendBlock(client, row.id, choice);
        setBlocks((prev) =>
          prev?.kind === 'ok' ? { kind: 'ok', rows: prev.rows.map((r) => (r.id === row.id ? { ...r, until } : r)) } : prev,
        );
        patchBlockState(row.id, {
          busy: undefined,
          picking: false,
          done: until ? `${until.slice(0, 10)}까지로 바꿨어요` : '영구로 바꿨어요',
        });
      } catch (error) {
        patchBlockState(row.id, { busy: undefined, error: messageOf(error, '기간을 바꾸지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite, patchBlockState],
  );

  /**
   * 블랙리스트 줄 → 그 장소가 있는 칸(등록 완료·등록 해제, 장소의 `status` 로). 탭만 바꾼다 — 그 칸의 검색어·펼침은
   * 그 칸의 것이라(`AdminPagePlaceList`) 그 줄이 화면 밖일 수 있다. 장소 목록에 없으면 링크를 안 그린다.
   */
  const goToPlace = useCallback(
    (placeId: string) => {
      const place = managed?.find((row) => row.id === placeId);
      if (!place) return undefined;
      return () => setTab(place.status === 'archived' ? 'archived' : 'places');
    },
    [managed],
  );

  /**
   * 올린 장소 고치기. 순서·실패 처리는 `changePlace` 와 같다(잠금 → 쓰기 → 목록·대조 장부 → 풀기) —
   * 대조 장부에도 알리는 이유는 같은 세션의 다음 승인이 고친 이름·주소·플레이스 id 로 짝을 찾게 하려는 것이다.
   * 재빌드는 부르지 않는다 — `places` UPDATE 라 트리거가 부른다(ADR-018 결정 9).
   */
  const savePlace = useCallback(
    async (place: TPlaceRow, patch: TPlaceEditPatch) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchPlaceState(place.id, { error: message }))) return;
      patchPlaceState(place.id, { busy: 'saving', error: undefined, done: undefined });
      try {
        const updated = await updatePlace(client, place, patch);
        setManaged((prev) => (prev ? prev.map((row) => (row.id === updated.id ? updated : row)) : prev));
        applyPlaceChange(updated);
        const done =
          place.status === 'published' ? '고쳤어요 · 다음 빌드부터 사이트에 반영돼요' : '고쳤어요';
        patchPlaceState(place.id, { busy: undefined, editing: false, done });
        afterWrite();
      } catch (error) {
        patchPlaceState(place.id, { busy: undefined, error: messageOf(error, '장소를 고치지 못했어요.') });
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
          overwriteColumns: choice?.overwriteColumns,
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

  /**
   * 갱신 묶음의 **사이트가 맞아요**(11 U8) — 확인 날짜를 찍고 후보를 눕힌다(`confirmSite`). 블랙리스트는 건드리지 않는다.
   * 짝 행은 대조 장부(`placesRef`)에서 찾는다 — 찍은 날짜를 그 행에도 적어 두어야 다음 확인 표시가 새로고침 없이 맞는다.
   */
  const confirmSiteFor = useCallback(
    async (group: TCandidateGroup) => {
      const client = clientRef.current;
      const place = placesRef.current.find((row) => row.id === group.lead.match_place_id);
      if (!client || !place) return;
      if (!beginWrite((message) => patchState(group.key, { error: message }))) return;
      patchState(group.key, { busy: 'confirming', error: undefined });
      try {
        const { verifiedAt } = await confirmSite(client, group, place, new Date().toISOString());
        if (verifiedAt) place.verified_at = verifiedAt;
        patchState(group.key, {
          busy: undefined,
          done: verifiedAt
            ? `${place.name} 은 사이트가 맞다고 확인했어요 · 확인 날짜를 찍었어요(블랙리스트는 그대로)`
            : `${place.name} 은 사이트가 맞다고 표시했어요 · 확인 날짜 칸이 없어 날짜는 못 찍었어요`,
        });
        removeLater(group.key);
        setPlacesView([...placesRef.current]);
        afterWrite();
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '확인을 남기지 못했어요.') });
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
        // 방금 건 행이 블랙리스트 칸·탭 건수에 바로 보이게 다시 읽는다(실패는 그 칸이 말한다 — 제외는 이미 됐다).
        if (outcome.blocked !== 'none') setBlocks(await fetchBlocks(client));
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
      bulkStopRef.current = false;
      setBulk({ busy: true, mode: 'reject', progress: { done: 0, total: targets.length } });
      const done = new Set<string>();
      let failed = 0;
      let blockFailed = 0;
      let stopped = 0;
      let firstError: string | undefined;
      try {
        for (const [index, group] of targets.entries()) {
          if (bulkStopRef.current) {
            stopped = targets.length - index;
            break;
          }
          setBulk((prev) => ({ ...prev, progress: { done: index, total: targets.length } }));
          try {
            const outcome = await rejectAndBlock(client, group, reason, note, block);
            done.add(group.key);
            // 된 줄은 그때그때 빠진다 — 끝에 한꺼번에 빠지면 돌고 있는 동안 표가 멈춘 것처럼 보인다.
            setGroups((prev) => prev.filter((other) => other.key !== group.key));
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
      if (block !== 'none' && done.size > blockFailed) setBlocks(await fetchBlocks(client));
      // 블랙리스트만 실패한 곳도 '남은 일' 로 센다 — 제외는 됐지만 다시 올라올 수 있는 구멍이라 초록일 수 없다.
      setBulk({
        summary: summarizeBulkReject(done.size, failed, blockFailed) + stoppedNote(stopped),
        tone: bulkTone({ done: done.size, waiting: 0, failed: failed + blockFailed, stopped }),
        error: firstError,
      });
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
   * **추가 수집** — 이 가게를 상호명으로 한 번 더 찾게 요청한다(`adminCollectRequest.ts`). 후보·장소를 바꾸지 않는 쓰기라 `beginWrite` 직렬화 밖이다.
   * 이미 대기 중이었으면(다른 탭에서 눌렀다) 실패가 아니다 — 목록을 다시 읽어 그 요청을 보여 준다.
   */
  const requestCollectFor = useCallback(
    async (group: TCandidateGroup) => {
      const client = clientRef.current;
      if (!client) return;
      patchState(group.key, { busy: 'requestingCollect', error: undefined });
      try {
        const { extracted } = group.lead;
        const made = await requestCollect(client, { name: extracted.name, nameKey: extracted.nameKey, candidateId: group.lead.id });
        if (made === 'alreadyQueued') setCollectRequests(await fetchCollectRequests(client));
        else setCollectRequests((prev) => (prev?.kind === 'ok' ? { kind: 'ok', byName: { ...prev.byName, [made.name_key]: made } } : prev));
        patchState(group.key, { busy: undefined });
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '추가 수집을 요청하지 못했어요.') });
      }
    },
    [patchState],
  );

  /**
   * **저수지 N건 분석**(todo/17 T6) — 워커에 `pipeline_requests` 한 줄. 넣었든 이미 있었든 집계를 다시 읽는다 — 머리글의 `요청 N건 대기` 와
   * 워커 상태가 한 번에 맞는다. 다시 읽기가 실패해도 요청은 들어갔으니 결과는 그대로 돌려준다(`loadOpsStages` 는 던지지 않는다).
   */
  const requestAnalyzeNow = useCallback(
    async (limit: TAnalyzeLimit) => {
      const client = clientRef.current;
      if (!client) throw new Error('세션이 없어요 — 다시 로그인해 주세요.');
      const result = await requestAnalyze(client, { limit });
      void loadOpsStages(client);
      return result;
    },
    [loadOpsStages],
  );

  /**
   * **재분석** — 고른 묶음의 글을 되돌린다(`adminReanalyze.ts`). 한 줄(레일)과 일괄(표 위 줄)이 같은 함수를 쓴다.
   *
   * 끝나면 눕힌 후보를 빼고 **다시 묶는다**(`groupPending`). 형제 후보가 다른 줄에 섞여 있을 수 있어 줄 단위로 지우면
   * 그 줄의 대표만 남거나 빈 줄이 남는다. 결과 한 줄은 표 위 줄에 남긴다 — 한 줄에서 눌렀어도 그 줄은 사라지므로
   * 말할 자리가 거기뿐이고, 다음에 할 일(터미널에서 `pnpm data analyze`)을 거기서 말한다.
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
      /*
       * 묶음이 **남을 수 있다** — 행이 전부 `[admin] 고침` 이면 `lay` 가 비어 그 줄은 그대로다(규칙 3). 그 줄의 `busy`·`reanalyzing` 을
       * 여기서 풀지 않으면 "분석을 지우고 있어요…" 가 영영 서 있다(BUG-010). 사라진 줄의 상태는 버린다.
       */
      setStates((prev) =>
        Object.fromEntries(
          Object.entries(prev)
            .filter(([key]) => alive.has(key))
            .map(([key, state]) => (keys.includes(key) ? [key, { ...state, busy: undefined, reanalyzing: false }] : [key, state])),
        ),
      );
      setSelected((prev) => clearKeys(prev, [...keys]));
      const kept = plan.keep.length ? ` · 사람이 고친 후보 ${plan.keep.length}건은 남았어요(다시 읽어도 그 가게는 새로 만들지 않아요)` : '';
      setBulk({
        summary: `글 ${plan.posts.length}건을 수집 완료로 되돌렸어요 · 검수 대기 후보 ${plan.lay.length}건이 목록에서 빠졌어요${kept} — 터미널에서 pnpm data analyze 를 돌리면 다시 읽어요.`,
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
          ? bulkLatestTargets(chosen, placesRef.current).eligible.map((entry) => ({ group: entry.group, choice: { mergeInto: entry.pairId, overwrite: true, overwriteColumns: entry.columns } }))
          : // 근거 얇은 신규는 보내지 않는다(todo/13 A3) — 확인 문장이 "건너뛰어요" 라고 센 그 줄들이다(같은 판정 `bulkApproveSlot`).
            bulkApproveJobs(chosen, placesRef.current).map((group) => ({ group, choice: {} }));
      bulkStopRef.current = false;
      setBulk({ busy: true, mode: kind, progress: { done: 0, total: jobs.length } });
      const done = new Set<string>();
      const tally: TBulkTally = { done: 0, waiting: 0, failed: 0 };
      try {
        for (const [index, { group, choice }] of jobs.entries()) {
          // 멈추기는 묶음 사이에서만 — 지금 쓰는 줄은 끝까지 간다(반쯤 쓴 행을 남기지 않는다).
          if (bulkStopRef.current) {
            tally.stopped = jobs.length - index;
            break;
          }
          setBulk((prev) => ({ ...prev, progress: { done: index, total: jobs.length } }));
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
              // 된 줄은 그때그때 빠진다(todo/09 T6.5) — 진행 수와 표가 같이 움직여야 멈춘 것과 구별된다.
              setGroups((prev) => prev.filter((other) => other.key !== group.key));
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
      setBulk({ summary: `${summarizeBulk(kind === 'latest' ? '덮어썼어요' : '올렸어요', tally)} · 사이트에는 다음 빌드에서 보여요`, tone: bulkTone(tally) });
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
        // 종류 엇갈림은 화면이 그때그때 본다(`typeMismatchFlags`) — CLI 표식(`groupFlags`)을 늘리지 않는다.
        return { group, preview, view: adminFlagView([...flagsFor(group), ...preview.flags, ...typeMismatchFlags(group.lead.extracted)]) };
      }),
    [groups],
  );

  /*
   * **어떤 선택지의 개수든 "나를 뺀 나머지 축을 적용한 뒤" 센다.** 누르면 보일 수와 선택지의 숫자가
   * 같아야 한다는 규칙이고, 이 화면에서 그것이 틀리면 운영자가 "다 봤다" 를 개수로 잘못 읽는다 —
   * 조건 토글을 켠 채 짝 칩을 보던 시절에 실제로 난 일이다. 축을 하나 더할 때 이 표에 한 줄만 더하면 되게 묶었다.
   * 이름 검색(`query`)도 한 축이다 — 검색 중에도 선택지 개수·"N곳 보는 중"·'전부 고르기' 가 검색 결과를 따른다.
   */
  type TCard = (typeof cards)[number];
  type TAxis = 'query' | 'kind' | 'type' | 'policy' | 'warn';
  const AXES: Record<TAxis, (card: TCard) => boolean> = {
    query: (card) => matchesGroupQuery(card.group, nameQuery),
    kind: (card) => kindMatches(kindFilter, card.group),
    type: (card) => typeMatches(typeFilter, card.group),
    policy: (card) => policyFilter === 'all' || POLICY_FILTER_MATCH[policyFilter](card),
    warn: (card) => warnMatches(warnFilter, card, states[card.group.key]),
  };
  /** `except` 축을 열어 둔 채 나머지를 적용한 목록 — 그 축의 선택지 개수를 세는 바탕이다. */
  const without = (except: TAxis) =>
    cards.filter((card) => (Object.keys(AXES) as TAxis[]).every((axis) => axis === except || AXES[axis](card)));
  const filtered = without('warn').filter(AXES.warn);
  const baseKind = without('kind');
  const baseType = without('type');
  const basePolicy = without('policy');
  const baseWarn = without('warn');
  const filtersOn = nameQuery.trim() !== '' || kindFilter !== 'all' || typeFilter !== 'all' || policyFilter !== 'all' || warnFilter !== 'all';

  // 걸러 보기를 바꾸면 '더 보기' 도 처음으로 — 효과가 아니라 여기서 함께 바꾼다(같은 사건의 두 결과다).
  const typeName = (next: string) => {
    setNameQuery(next);
    setShown(PAGE_SIZE);
  };
  /** 드롭다운은 값을 바로 고른다 — 토글(`pickPolicy`)과 달리 같은 것을 다시 골라도 풀리지 않는다. */
  const pickPolicyExact = (next: TPolicyFilter) => {
    setPolicyFilter(next);
    setShown(PAGE_SIZE);
  };
  const pickKind = (next: TKindFilter) => {
    setKindFilter(next);
    setShown(PAGE_SIZE);
  };
  /** 검색어도 함께 지운다 — 0건 문구가 "걸러 보기를 꺼 보세요" 라서, 풀었는데 검색이 남아 여전히 빈 목록이면 안 된다. */
  const resetFilters = () => {
    setNameQuery('');
    setKindFilter('all');
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
    const search = writeAdminUrl(window.location.search, { tab, kind: kindFilter, policy: policyFilter, type: typeFilter, warn: warnFilter });
    const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', next);
  }, [kindFilter, policyFilter, tab, typeFilter, warnFilter]);

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
   * 못 센 것(아직 읽는 중·실패)은 숫자를 안 단다(0 으로 말하지 않는다). `미적용` 은 원격에 표가 아직 없다는 뜻이다(09 「실행 규약」).
   * 수집 완료 칸에는 달지 않는다(2026-10-06, todo/13 T4.4) — 칸 전체가 아니라 '글 단위 분석 제외' 한 기능의 사정이라 라벨 옆에선 뜻이
   * 읽히지 않았다. 그 사정은 패널의 그 줄이 말한다. 블랙리스트는 칸 전체가 그 표라 남긴다.
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

  const opsBand = opsStages ? adminBandStage(opsStages, { rebuildWarn: rebuild?.tone === 'warn', strandedShown: Boolean(stranded) }) : null;
  /**
   * 워커가 없거나 멎었으면 띠에 한 줄 — 추가 수집 요청·재분석·「지금 분석」 은 워커가 집어 간다(ADR-024). 승인은 이 화면이 곧바로
   * `places` 에 쓰므로(ADR-018) 워커와 무관하다 — "승인이 반영되지 않아요" 라고 말하면 워커가 꺼진 대부분의 시간에 멀쩡한 승인을 고장이라 말한다.
   */
  const workerBand =
    opsWorker?.state === 'none'
      ? '로컬 워커가 없어요 — 추가 수집·재분석 요청이 처리되지 않아요. 터미널에서 pnpm data 를 켜 주세요'
      : opsWorker?.state === 'stale'
        ? '로컬 워커가 멎은 듯해요 — 추가 수집·재분석 요청이 처리되지 않아요. 터미널을 확인해 주세요'
        : null;

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
            {/* 운영 현황(`/admin/ops`, todo/15 T4.1) — 운영자는 `/admin` 은 매번 열지만 거기는 그렇지 않다. 같은 세션이라 다시 로그인하지 않는다. */}
            {/* 로컬 워커 한 줄(todo/17 T5.3) — 배지 점 + 단계. 자세한 것(진행률·심장)은 운영 현황에 있다. */}
            {opsWorker ? (
              <span className="flex items-center gap-1 text-xs whitespace-nowrap text-tertiary" title={opsWorker.hint ?? opsWorker.host}>
                <span
                  aria-hidden="true"
                  className={cx(
                    'size-2 shrink-0 rounded-full',
                    opsWorker.tone === 'ok' ? 'bg-success-solid' : opsWorker.tone === 'fail' ? 'bg-error-solid' : 'bg-warning-solid',
                  )}
                />
                {opsWorker.state === 'alive' && opsWorker.phase ? `워커 ${WORKER_PHASE_LABEL[opsWorker.phase]}` : opsWorker.label}
                {/* 대기 중인 「지금」 요청(todo/17 T6) — 0 이면 말하지 않는다. */}
                {opsQueue?.requestsQueued ? ` · 요청 ${opsQueue.requestsQueued}건 대기` : null}
              </span>
            ) : null}
            <Link href="/admin/ops/" className="mr-1 text-sm font-semibold whitespace-nowrap text-brand-secondary hover:text-brand-secondary_hover">
              운영 현황 →
            </Link>
            {/*
              * `?` 는 **누르면 열린다**(2026-10-06, todo/13 T4.5) — `title` 툴팁만이던 동안 폰·태블릿에서는 볼 길이 없었다.
              * 레포에 이미 쓰는 `<details>`(비교표의 '어떻게 읽었는지 보기')로 연다 — 팝오버 부품을 들이지 않는다. 마우스에는 `title` 도 남긴다.
              * 펼친 목록은 떠 있는 카드라 흰 바탕(`bg-primary`)이다(크롬이 아니다 — ADR-010 v4).
              */}
            <details className="relative">
              <summary
                title={HELP}
                aria-label="도움말"
                className="flex size-6 cursor-pointer list-none items-center justify-center rounded-full border border-secondary text-xs text-tertiary [&::-webkit-details-marker]:hidden"
              >
                ?
              </summary>
              <ul className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-1.5 rounded-lg border border-secondary bg-primary p-3 text-xs text-secondary shadow-lg">
                {HELP_LINES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
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
          * 재빌드가 **정말 걸렸는지** 를 말하는 줄(→ `adminRebuild.ts`). 정상(`ok`)은 회색 글씨다 — 초록은 매번 뜨는 줄에 쓰기에는 센 색이다.
          * **자리를 먼저 잡는다**(2026-10-06, todo/13 T4.1): 이 줄은 목록보다 늦게 읽혀서, 없던 줄이 생기며 탭 줄과 표를 한 줄 아래로 밀었다 —
          * 누르려던 자리가 움직인다. 그래서 읽는 중에도 같은 높이로 서고(흐린 한 마디), 실패(`warn`)일 때는 이 자리를 비워 둔 채 탭 줄 위 띠로 말한다.
          */}
        <p className={cx('mt-0.5 min-h-4', !rebuild && 'text-quaternary')}>
          {!rebuild ? '재빌드 상태 확인 중' : rebuild.tone === 'warn' ? null : rebuild.text}
        </p>
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
            반영이 끊긴 후보 {stranded}건이 있어요 — 터미널에서 pnpm data apply 를 한 번 돌려 주세요.
          </p>
        ) : null}
      </div>

      {/*
        * 다섯 칸 — 올리는 일과 내리는 일을 한 목록에 섞지 않는다(`TTab` 주석). 라벨 옆 숫자가 "어디에 일이 있나" 를 탭 줄에서 읽히게 한다.
        * **밑줄 탭이다**(2026-09-30 v2). 채운 핑크 버튼이던 동안 주 버튼(올리기)과 같은 모양이라 화면에서 가장 센 물체가
        * 가장 드문 동작(칸 전환)이었다. 좁은 화면에서는 줄이 가로로 밀린다 — 다섯 라벨이 한 줄에 안 들어가도 줄바꿈하지 않는다.
        */}
      {/*
        * 재빌드 실패는 머리글의 회색 한 줄이 아니라 **탭 줄 바로 위의 띠**다(todo/13 T4.1) — 429·폐기된 훅이면 승인해도 사이트에 안 나가는데,
        * 머리글 셋째 줄의 주황 글씨로는 며칠을 못 보고 지나갔다(2026-10-02 부터의 429). 문구는 `rebuildHeadline` 이 만든 그대로다.
        */}
      {rebuild?.tone === 'warn' ? (
        <p role="alert" className="mt-3 bg-warning-primary px-4 py-2 text-xs font-semibold text-warning-primary md:px-6">
          {rebuild.text}
        </p>
      ) : null}
      {/*
        * 운영 현황의 가장 심한 칸 하나(todo/15 T4.2). 재빌드 줄이 이미 있으면 그 줄이 먼저고, 이 줄은 **검수 화면이 아직 말하지 않은 것**만이다
        * (`adminBandStage` — 재빌드 경고·끊긴 반영은 위의 줄들이 말한다). 실패는 빨강, 주의는 재빌드 띠와 같은 노랑.
        */}
      {opsBand ? (
        <p
          role="alert"
          className={cx(
            'px-4 py-2 text-xs font-semibold md:px-6',
            rebuild?.tone === 'warn' ? 'mt-px' : 'mt-3',
            opsBand.state === 'fail' ? 'bg-error-primary text-error-primary' : 'bg-warning-primary text-warning-primary',
          )}
        >
          {opsBand.reason} ·{' '}
          <Link href="/admin/ops/" className="underline underline-offset-2">
            운영 현황 →
          </Link>
        </p>
      ) : null}
      {/* 로컬 워커가 없음·멎음(todo/17 T5.3). 띠가 셋까지 쌓일 수 있어 앞에 띠가 하나라도 있으면 1px 로 붙인다. */}
      {workerBand ? (
        <p
          role="alert"
          className={cx(
            'bg-warning-primary px-4 py-2 text-xs font-semibold text-warning-primary md:px-6',
            rebuild?.tone === 'warn' || opsBand ? 'mt-px' : 'mt-3',
          )}
        >
          {workerBand} ·{' '}
          <Link href="/admin/ops/" className="underline underline-offset-2">
            운영 현황 →
          </Link>
        </p>
      ) : null}
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
        <AdminPagePostsPanel
          counts={postCounts}
          error={postError}
          backlog={backlog}
          seedTargets={managed ? seedVerifyTargets(managed).length : null}
          onSeedVerify={seedVerify}
          onPlanReopen={planReopen}
          onReopen={runReopen}
          active={phase === 'ready' && tab === 'posts'}
          onFetchPosts={readPosts}
          onFetchPromptVersions={readPromptVersions}
          onExcludePosts={excludePostRows}
          onUnexcludePosts={unexcludePostRows}
          onPlanReread={planPostReread}
          onReread={rereadPosts}
        />
        <AdminPageSuggestions suggestions={suggestions} busyId={suggestionBusy} onClose={(row, status) => void closeSuggestion(row, status)} />
        {suggestionError ? <p className="mt-2 px-4 text-xs text-error-primary md:px-6">{suggestionError}</p> : null}
      </div>
      <div hidden={tab !== 'blocks'}>
        <AdminPageBlocksPanel
          load={blocks}
          states={blockStates}
          notice={blockNotice}
          goToPlace={goToPlace}
          onLift={(row) => void liftBlockRow(row)}
          onStartExtend={(row) => patchBlockState(row.id, { picking: true, error: undefined, done: undefined })}
          onCancelExtend={(row) => patchBlockState(row.id, { picking: false })}
          onExtend={(row, choice) => void extendBlockRow(row, choice)}
        />
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
            onGoToBlocks={() => setTab('blocks')}
            reports={reportsByPlace}
            updates={updatesByPlace}
            onHandleReports={(place, ids, status, note) => void handleReports(place, ids, status, note)}
            visited={visitedByPlace}
            onApplyVisited={(place, ids) => void applyVisited(place, ids)}
            onSavePlace={(place, patch) => void savePlace(place, patch)}
            onClearDone={clearPlaceDone}
            onPlanReread={planPlaceSources}
            onReread={rereadPlaceSources}
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
            onGoToBlocks={() => setTab('blocks')}
            reports={reportsByPlace}
            updates={updatesByPlace}
            onHandleReports={(place, ids, status, note) => void handleReports(place, ids, status, note)}
            visited={visitedByPlace}
            onApplyVisited={(place, ids) => void applyVisited(place, ids)}
            onSavePlace={(place, patch) => void savePlace(place, patch)}
            onClearDone={clearPlaceDone}
            onPlanReread={planPlaceSources}
            onReread={rereadPlaceSources}
          />
        )}
      </div>

      <div hidden={tab !== 'candidates'}>
      {/* 저수지 N건 분석(todo/17 T6) — 칸에 하나, 목록이 비어도 선다(검수할 것이 없을 때가 저수지를 읽힐 때다). */}
      <AdminPageAnalyzeRequest worker={opsWorker} backlog={opsQueue?.backlog} onRequest={requestAnalyzeNow} />
      {groups.length > 0 && (
        /*
         * **걸러 보기 = 이름표가 붙은 드롭다운 넷.** 드롭다운은 고른 값 하나만 보이고, 펼치면 **선택지마다 뜻과 개수**가 나온다.
         * 개수 규칙은 그대로다 — 나를 뺀 나머지 축을 적용한 뒤 센다(`without`). 폭은 선택지 설명이 잘리지 않을 만큼이다.
         */
        <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 px-4 md:px-6">
          {/* 이름 검색(todo/13 T4.2) — 대표 이름 · 같은 자리로 묶인 다른 이름 · 짝 장소 이름 중 하나라도 맞으면 남는다(`matchesGroupQuery`). */}
          <div className="w-full sm:w-56">
            <Input {...SEARCH_FIELD} aria-label="이름으로 찾기" placeholder="이름으로 찾기" value={nameQuery} onChange={typeName} size="sm" icon={SearchLg} />
          </div>
          <Select
            label="경고"
            size="sm"
            className="w-56"
            selectedKey={warnFilter}
            onSelectionChange={(key) => key && pickWarn(key as TWarnFilter)}
          >
            {WARN_FILTERS.map((entry) => (
              <Select.Item key={entry.key} id={entry.key} supportingText={entry.hint}>
                {`${entry.label} ${baseWarn.filter((card) => warnMatches(entry.key, card, states[card.group.key])).length}`}
              </Select.Item>
            ))}
          </Select>
          <Select
            label="짝"
            size="sm"
            className="w-56"
            selectedKey={kindFilter}
            onSelectionChange={(key) => key && pickKind(key as TKindFilter)}
          >
            {KIND_FILTERS.map((entry) => (
              <Select.Item key={entry.key} id={entry.key} supportingText={entry.hint}>
                {`${entry.label} ${baseKind.filter((card) => kindMatches(entry.key, card.group)).length}`}
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
          tone={bulk.tone}
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
          onStop={stopBulk}
          progress={bulk.progress}
          stopping={bulk.stopping}
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
              grid={ADMIN_CANDIDATE_TRACKS}
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
                  onConfirmSite={() => void confirmSiteFor(group)}
                  policyReports={group.lead.match_place_id ? (policyReportsByPlace[group.lead.match_place_id] ?? 0) : 0}
                  onPickRegion={(regionRaw) => patchState(group.key, { regionDraft: regionRaw })}
                  onPickOverwrite={(picked) => patchState(group.key, { overwritePick: picked })}
                  onSaveRegion={(regionRaw) => void saveRegion(group, regionRaw)}
                  onChooseAddress={(choice) => void chooseAddressFor(group, choice)}
                  selected={selected.has(group.key)}
                  onSelect={() => setSelected((prev) => toggleSelected(prev, group.key))}
                  /* 접힌 줄에도 준다 — 목록의 동반 조건 칸이 "올리면 나갈 조건"(사이트 쪽인지)을 가르는 데 쓴다(todo/13 T2.3). */
                  pairPlace={pairPlaceOf(group, state)}
                  reanalyzeText={expanded === group.key && state.reanalyzing ? reanalyzeSummary(planFor([group.key])) : undefined}
                  onStartReanalyze={() => patchState(group.key, { reanalyzing: true, rejecting: false, error: undefined })}
                  onCancelReanalyze={() => patchState(group.key, { reanalyzing: false })}
                  onReanalyze={() => void reanalyze([group.key], { key: group.key })}
                  collect={collectView(collectRequests, group.lead.extracted, group.rows.map((row) => row.extracted))}
                  onRequestCollect={() => void requestCollectFor(group)}
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
