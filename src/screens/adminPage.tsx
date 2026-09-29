'use client';

import { CheckDone01 } from '@untitledui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '../components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import { PageHeader } from '../components/layout/pageHeader';
import { approveGroup, rejectGroup, setRegion } from '../lib/adminApply';
import {
  countStrandedCandidates,
  fetchMatchablePlaces,
  fetchPendingCandidates,
  flagsFor,
  groupPending,
  previewFor,
  TIER_LABEL,
  type TCandidateGroup,
  type TPlaceRow,
  type TRejectReason,
} from '../lib/adminCandidates';
import { adminFlagView } from '../lib/adminPreview';
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
import { cx } from '../utils/cx';
import { useAdminInfiniteScroll } from './adminInfiniteScroll';
import { AdminPageBulkBar } from './adminPageBulkBar';
import { AdminPageGroupCard, type TAdminPageGroupState, type TApproveChoice } from './adminPageGroupCard';
import { AdminPageLogin } from './adminPageLogin';
import { AdminPagePlaceList } from './adminPagePlaceList';
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

const COLUMNS = ['이름', '지역', '이용 조건', '근거', ''];
/** 끝난 카드가 초록 한 줄로 남아 있는 시간. 바로 지우면 "눌렀는데 아무 일도 안 났다" 로 보인다. */
const DONE_LINGER_MS = 3000;

type TPhase = 'checking' | 'signedOut' | 'verifying' | 'notOperator' | 'loading' | 'ready' | 'error';

/**
 * 두 칸. 후보를 **올리는** 일과 이미 올린 것을 **내리는** 일은 다른 일이라 한 목록에 섞지 않는다 —
 * 섞으면 "맞아요" 옆에 "내리기" 가 붙어 실수 한 번의 값이 달라진다.
 */
type TTab = 'candidates' | 'places';

const TABS: { key: TTab; label: string }[] = [
  { key: 'candidates', label: '확인할 장소' },
  { key: 'places', label: '올린 장소' },
];

type TTierFilter = 'all' | 'auto' | 'ask' | 'new';

/**
 * 걸러 보기는 **두 축**이다. 앞의 넷은 서로 배타적인 한 축(기존 장소와의 관계)이고,
 * '조건이 적힌 것만' 은 그 축을 가로지르는 따로 켜는 토글이다. 한 줄에 다섯을 같은 모양으로 두었을 때는
 * 조건 토글이 tier 필터를 **대체해서**, 조건 없는 후보(142묶음 중 112)가 통째로 사라진 목록을
 * 운영자가 "다 봤다" 로 읽었다.
 */
const TIER_FILTERS: { key: TTierFilter; label: string; match: (group: TCandidateGroup) => boolean }[] = [
  { key: 'all', label: '전체', match: () => true },
  { key: 'auto', label: TIER_LABEL.auto, match: (group) => group.tier === 'auto' },
  { key: 'ask', label: TIER_LABEL.ask, match: (group) => group.tier === 'ask' },
  { key: 'new', label: TIER_LABEL.new, match: (group) => group.tier === 'new' },
];

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
  const [phase, setPhase] = useState<TPhase>('checking');
  const [session, setSession] = useState<TAdminSession | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [fatal, setFatal] = useState<string | null>(null);
  const [groups, setGroups] = useState<TCandidateGroup[]>([]);
  /** 반영이 끊겨 `approved` 로 남은 후보 수. 셀 수 없었으면(조회 실패) undefined — 그때는 아무 말도 하지 않는다. */
  const [stranded, setStranded] = useState<number | undefined>(undefined);
  const [states, setStates] = useState<Record<string, TAdminPageGroupState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<TTierFilter>('all');
  const [policyOnly, setPolicyOnly] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  /*
   * 일괄 반려용으로 골라 둔 묶음들. 집합을 다루는 규칙은 전부 `adminSelection.ts` 에 있다 —
   * 특히 "목록에 없는 키를 버린다"(`pruneSelection`)가 조용히 틀리는 자리라 거기서 테스트한다.
   */
  const [selected, setSelected] = useState<TSelection>(EMPTY_SELECTION);
  const [bulk, setBulk] = useState<{ busy?: boolean; rejecting?: boolean; summary?: string; error?: string }>({});
  const [tab, setTab] = useState<TTab>('candidates');
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

  const start = useCallback(async (next: TAdminSession) => {
    setFatal(null);
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
  }, [refreshRebuild]);

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

  /** '올린 장소' 칸에 클라이언트를 넘기는 법. ref 를 렌더 중에 읽지 않으려고 값 대신 이 함수를 준다. */
  const getClient = useCallback(() => clientRef.current, []);

  /** 쓰기가 성공했다 — 재빌드 기록을 다시 읽어 머리글을 갱신한다(두 칸이 같이 쓴다). */
  const afterWrite = useCallback(() => {
    const client = clientRef.current;
    if (client) void refreshRebuild(client);
  }, [refreshRebuild]);

  /**
   * '올린 장소' 칸의 쓰기를 대조 장부(`placesRef`)에도 반영한다.
   *
   * 없으면 이런 일이 난다 — 방금 내린 장소가 장부에는 `published` 로 남아, 같은 세션에서 그 가게의 후보를
   * 승인하면 `approveGroup` 이 내린 곳을 멀쩡한 짝으로 보고 **조용히 합친다**(archived 가지를 지나쳐 버린다).
   * 새로고침하면 사라지는 종류의 버그라 더 찾기 어렵다.
   */
  const applyPlaceChange = useCallback((updated: TPlaceRow) => {
    const index = placesRef.current.findIndex((place) => place.id === updated.id);
    if (index >= 0) placesRef.current[index] = { ...placesRef.current[index], ...updated };
  }, []);

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
        const what =
          outcome.kind === 'created'
            ? `올렸어요 · ${outcome.placeName}`
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
    async (group: TCandidateGroup, reason: TRejectReason, note: string) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => patchState(group.key, { error: message }))) return;
      patchState(group.key, { busy: 'rejecting', error: undefined });
      try {
        await rejectGroup(client, group, reason, note);
        patchState(group.key, { busy: undefined, rejecting: false, done: `반려했어요 · ${reason}` });
        removeLater(group.key);
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '반려하지 못했어요.') });
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
    async (keys: readonly string[], reason: TRejectReason, note: string) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite((message) => setBulk({ rejecting: true, error: message }))) return;
      const wanted = new Set(keys);
      const targets = groups.filter((group) => wanted.has(group.key));
      setBulk({ busy: true, rejecting: true });
      const done = new Set<string>();
      let failed = 0;
      let firstError: string | undefined;
      try {
        for (const group of targets) {
          try {
            await rejectGroup(client, group, reason, note);
            done.add(group.key);
          } catch (error) {
            failed += 1;
            firstError ??= messageOf(error, '반려하지 못했어요.');
          }
        }
      } finally {
        endWrite();
      }
      setGroups((prev) => prev.filter((group) => !done.has(group.key)));
      setStates((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !done.has(key))));
      setSelected((prev) => clearKeys(prev, [...done]));
      setBulk({ summary: summarizeBulkReject(done.size, failed), error: firstError });
    },
    [beginWrite, endWrite, groups],
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
   * 조건 토글을 **먼저** 좁힌다. tier 칩의 개수가 조건 토글 안에서 세어지지 않으면 토글을 켠 상태에서
   * 칩 숫자와 목록 길이가 어긋나고, 이 축 분리가 고치려던 "다 본 줄 안다" 가 개수 쪽으로 옮겨 앉는다.
   */
  const inPolicy = policyOnly ? cards.filter((card) => card.group.hasPolicyText) : cards;
  const filtered = inPolicy.filter((card) => activeTier.match(card.group));
  /** 조건 칩의 개수도 같은 규칙 — 지금 고른 tier 안에서 센다(누르면 보일 수와 같다). */
  const policyCount = cards.filter((card) => activeTier.match(card.group) && card.group.hasPolicyText).length;

  // 걸러 보기를 바꾸면 '더 보기' 도 처음으로 — 효과가 아니라 여기서 함께 바꾼다(같은 사건의 두 결과다).
  const pickTier = (next: TTierFilter) => {
    setTierFilter(next);
    setShown(PAGE_SIZE);
  };
  const togglePolicy = () => {
    setPolicyOnly((prev) => !prev);
    setShown(PAGE_SIZE);
  };

  const showMore = useCallback(() => setShown((prev) => prev + PAGE_SIZE), []);
  const setSentinel = useAdminInfiniteScroll(filtered.length > shown, shown, showMore);

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

  const expiry = new Date(session.expiresAt * 1000).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="pb-8">
      <PageHeader
        title="장소 검수"
        description={
          tab === 'candidates' ? `확인할 장소 ${groups.length}곳` : '이미 올린 장소를 내리거나 되살려요'
        }
        actions={
          <Button color="secondary" size="sm" onClick={signOut}>
            로그아웃
          </Button>
        }
      />
      <div className="px-4 pt-1 text-xs text-tertiary md:px-6">
        <p>
          {session.email} · {expiry} 지나면 다시 로그인해요
        </p>
        <p className="mt-0.5">여기서 바꾼 것은 사이트가 다시 빌드된 뒤에 보여요.</p>
        {/*
          * 그 빌드가 **정말 걸렸는지** 를 말하는 줄. 이 줄이 없던 동안에는 훅이 없어도·폐기됐어도 화면이 똑같이
          * "다음 빌드에서 보여요" 라고 말했고, 운영자가 그것을 앱 안에서 확인할 방법이 없었다(→ `adminRebuild.ts`).
          * 못 읽었으면(undefined) 아무 말도 하지 않는다 — 모르는 것을 "안 됐다" 로 말하지 않는다.
          */}
        {rebuild ? (
          <p
            className={cx(
              'mt-0.5',
              rebuild.tone === 'warn' && 'text-warning-primary',
              rebuild.tone === 'ok' && 'text-success-primary',
            )}
          >
            {rebuild.text}
          </p>
        ) : null}
        {/*
          * 쓰기 도중에 끊긴 후보는 `approved` 로 남아 **이 목록에 안 나온다**(목록은 pending 만 읽는다).
          * 그 줄을 안 띄우면 새로고침 뒤에 그냥 사라진 것처럼 보여 승인이 통과한 줄 안다 — 이어받는 길을 여기서 말해 준다.
          */}
        {stranded ? (
          <p className="mt-0.5 text-warning-primary">
            반영이 끊긴 후보 {stranded}건이 있어요 — 터미널에서 pnpm data:apply 를 한 번 돌려 주세요.
          </p>
        ) : null}
      </div>

      {/*
        * 두 칸 — 올리는 일과 내리는 일을 한 목록에 섞지 않는다(`TTab` 주석).
        * 폭을 반씩 나눠 갖지 않는다(옛 `flex-1`) — 넓은 화면에서 버튼 둘이 1000px 를 채우면
        * 그것이 화면에서 가장 큰 물체가 되는데, 칸 전환은 검수에서 가장 드문 동작이다.
        */}
      <div className="mt-3 flex gap-1.5 px-4 md:px-6" role="tablist" aria-label="검수 칸">
        {TABS.map((entry) => {
          const active = entry.key === tab;
          return (
            <Button
              key={entry.key}
              size="sm"
              role="tab"
              color={active ? 'primary' : 'secondary'}
              aria-selected={active}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </Button>
          );
        })}
      </div>

      {tab === 'places' ? (
        <AdminPagePlaceList
          getClient={getClient}
          beginWrite={beginWrite}
          endWrite={endWrite}
          onWritten={afterWrite}
          onPlaceChanged={applyPlaceChange}
        />
      ) : (
        <>

      {groups.length > 0 && (
        /*
         * 두 축을 한 줄에 놓되 **가운뎃점으로 가른다.** 줄을 둘로 쌓으면 세로를 먹고, 구분 없이 붙이면
         * 다섯이 한 축으로 읽혀 조건 토글이 tier 필터를 대체하는 것처럼 보인다(`TIER_FILTERS` 주석).
         */
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 md:px-6">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="이미 있는 곳인지">
            {TIER_FILTERS.map((entry) => {
              const count = inPolicy.filter((card) => entry.match(card.group)).length;
              const active = entry.key === tierFilter;
              return (
                <Button
                  key={entry.key}
                  size="sm"
                  color={active ? 'primary' : 'secondary'}
                  aria-pressed={active}
                  onClick={() => pickTier(entry.key)}
                >
                  {entry.label} {count}
                </Button>
              );
            })}
          </div>
          {/* 축이 하나 더 있다는 것을 **보이는 이름표**가 말한다 — 없으면 다섯이 한 축으로 읽힌다. */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="이용 조건">
            <span className="text-xs font-semibold text-secondary">이용 조건</span>
            <Button
              size="sm"
              color={policyOnly ? 'primary' : 'secondary'}
              aria-pressed={policyOnly}
              onClick={togglePolicy}
            >
              조건이 적힌 것만 {policyCount}
            </Button>
          </div>
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
          rejecting={Boolean(bulk.rejecting)}
          summary={bulk.summary}
          error={bulk.error}
          onToggleAll={(next) =>
            setSelected((prev) => (next ? selectKeys(prev, filteredKeys) : clearKeys(prev, filteredKeys)))
          }
          onClear={() => setSelected(EMPTY_SELECTION)}
          onStartReject={() => setBulk({ rejecting: true })}
          onCancelReject={() => setBulk({})}
          onReject={(reason, note) => void rejectSelected(selectedKeys, reason, note)}
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
            <AdminTable grid={ADMIN_CANDIDATE_GRID} columns={COLUMNS} lead>
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
                  onReject={(reason, note) => void reject(group, reason, note)}
                  onPickRegion={(regionRaw) => patchState(group.key, { regionDraft: regionRaw })}
                  onSaveRegion={(regionRaw) => void saveRegion(group, regionRaw)}
                  selected={selected.has(group.key)}
                  onSelect={() => setSelected((prev) => toggleSelected(prev, group.key))}
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
              ? `${filtered.length}묶음 중 ${shown}묶음 · 스크롤하면 더 보여요`
              : `${filtered.length}묶음을 모두 봤어요`}
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
