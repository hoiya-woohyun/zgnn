'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/base/button';
import { PageHeader } from '../components/layout/pageHeader';
import { fetchOpsOverview, fetchRun, fetchRuns, mergeRuns, RUNS_PAGE_SIZE, type TOpsOverview, type TPipelineRun, type TRunsQuery } from '../lib/adminOps';
import { STAGE_SCRIPTS, stageHealth, stalledBefore, type TStageKey, workerHealth, worstStage } from '../lib/adminOpsHealth';
import { applyRunToOverview, runMatchesFilter, subscribeOps, type TOpsRealtimeStatus, upsertRun, upsertWorker } from '../lib/adminOpsRealtime';
import { rebuildHeadline } from '../lib/adminRebuild';
import { ADMIN_SESSION_KEY, clearAdminSession, readAdminSession, sessionProblem, type TAdminSession } from '../lib/adminSession';
import { createAdminClient, isOperator } from '../lib/adminSupabase';
import { cx } from '../utils/cx';
import { AdminOpsPageAlerts } from './adminOpsPageAlerts';
import { AdminOpsPageFunnel, type TAdminOpsFunnelDays } from './adminOpsPageFunnel';
import { AdminOpsPageRunsTable, sameScripts } from './adminOpsPageRunsTable';
import { AdminOpsPageStageStrip } from './adminOpsPageStageStrip';
import { AdminOpsPageUsage } from './adminOpsPageUsage';
import { AdminOpsPageWorker } from './adminOpsPageWorker';
import { AdminPageLogin } from './adminPageLogin';

type TPhase = 'checking' | 'signedOut' | 'verifying' | 'loading' | 'ready' | 'notOperator' | 'error';

/** 실행 기록 걸러 보기 — 스크립트(비우면 전부) · 실패만. 칸을 누르거나(①) 칩을 눌러(③) 바뀐다. */
export type TAdminOpsRunFilter = { scripts: TRunsQuery['scripts'] | null; failedOnly: boolean };

/**
 * 조용히 다시 읽는 간격. 운영자가 "analyze 끝났나" 를 보려고 켜 두는 화면이라 손 새로고침 없이 따라와야 하고,
 * 그렇다고 더 자주 읽을 일은 없다(심장이 60초에 한 번 뛴다 — `runLog.tick`).
 */
const REFRESH_MS = 60_000;

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const queryOf = (filter: TAdminOpsRunFilter, nowMs: number, before?: string): TRunsQuery => ({
  scripts: filter.scripts ?? undefined,
  failedOnly: filter.failedOnly ? { stalledBefore: stalledBefore(nowMs) } : undefined,
  before,
  limit: RUNS_PAGE_SIZE,
});

/** "42초 전" — 1초마다 바뀌는 것은 이 한 마디뿐이라 따로 떼어 화면 전체가 매초 다시 그려지지 않게 한다. */
function AdminOpsPageSince({ at }: { at: number }) {
  const [now, setNow] = useState(at);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return <span className="tabular-nums">{seconds < 60 ? `${seconds}초 전` : `${Math.floor(seconds / 60)}분 전`}</span>;
}

/**
 * 운영 현황 화면(`/admin/ops`) — "지금 어디가 막혀 있나, 아니면 다 괜찮나" 하나에 답한다
 * (docs/features/ops-dashboard.md · ADR-023 · todo/15 T3.4).
 *
 * 세션은 `/admin` 과 **같은 것**이다(`adminSession`·`adminSupabase`·`AdminPageLogin`) — 로그인 뒤 머무는 곳만 다르다.
 * 화면은 읽기만 한다. 기록을 고치는 버튼(중단된 행 닫기·재실행)은 없다 — 할 일은 터미널에 있고, 화면은 그 명령을 적어 줄 뿐이다.
 */
export function AdminOpsPage() {
  const [phase, setPhase] = useState<TPhase>('checking');
  const [session, setSession] = useState<TAdminSession | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [fatal, setFatal] = useState<string | null>(null);
  /** 다섯 칸·띠·머리글이 읽는 **7일** 집계. 흐름의 30일 토글은 이것을 바꾸지 않는다(재빌드 칸의 기간 수가 말없이 바뀌지 않게). */
  const [overview, setOverview] = useState<TOpsOverview | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  /** 조용한 새로고침이 실패했을 때 — 화면은 옛 수를 그대로 두고 머리글에 한 마디만 한다. */
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [runs, setRuns] = useState<TPipelineRun[]>([]);
  const [runsDone, setRunsDone] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState<TAdminOpsRunFilter>({ scripts: null, failedOnly: false });
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  /** Slack 링크의 `?run=<id>` 로 연 행 — 첫 장에 없을 수 있어 따로 든다. */
  const [pinnedRun, setPinnedRun] = useState<TPipelineRun | null>(null);
  const [funnelDays, setFunnelDays] = useState<TAdminOpsFunnelDays>(7);
  /** 흐름의 30일 집계 — 흐름 한 묶음만 읽는다. 7일이면 쓰지 않는다(위 `overview` 의 funnel). */
  const [overview30, setOverview30] = useState<TOpsOverview | null>(null);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  /** Realtime 채널 상태. null 은 아직 모름(붙는 중) — 그때는 아무 말도 하지 않는다. */
  const [realtime, setRealtime] = useState<TOpsRealtimeStatus | null>(null);

  const clientRef = useRef<SupabaseClient | null>(null);
  const sessionRef = useRef<TAdminSession | null>(null);
  const filterRef = useRef<TAdminOpsRunFilter>({ scripts: null, failedOnly: false });
  /** 조용한 새로고침이 겹치지 않게. 느린 응답 위에 다음 tick 이 또 쏘면 늦은 쪽이 새 값을 덮는다. */
  const refreshingRef = useRef(false);
  /** 걸러 보기를 빠르게 바꿀 때 늦게 온 옛 걸러 보기의 응답이 이기지 않게. */
  const runsSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  /** 장 넘김이 **오류로** 멈췄는가(다 읽어서가 아니라). 그렇다면 다음 새로고침이 성공할 때 다시 연다. */
  const doneByErrorRef = useRef(false);
  const funnelDaysRef = useRef<TAdminOpsFunnelDays>(7);
  /** 7일 ↔ 30일을 빠르게 오갈 때 늦게 온 30일 응답이 이기지 않게. */
  const funnelSeqRef = useRef(0);

  const resetToSignedOut = useCallback((why?: string) => {
    clearAdminSession();
    clientRef.current = null;
    sessionRef.current = null;
    setSession(null);
    setOverview(null);
    setRuns([]);
    setNotice(why);
    setFatal(null);
    setPhase('signedOut');
  }, []);

  /**
   * 부르기 전에 세션이 살아 있는가. 죽었으면 로그인 폼으로 보내고 false — 만료된 토큰으로 보내면 PostgREST 의 "JWT expired" 한 줄이
   * 표 밑에 뜨고 다음 60초 새로고침까지 그대로다. 모든 사용자 동작(칩·더 불러오기·기간 토글·새로고침)이 이것을 먼저 부른다.
   */
  const ensureSession = useCallback((): boolean => {
    if (sessionProblem(sessionRef.current, Math.floor(Date.now() / 1000)) === 'none') return true;
    resetToSignedOut('로그인이 만료됐어요. 다시 로그인해 주세요.');
    return false;
  }, [resetToSignedOut]);

  const loadOverview30 = useCallback(async (client: SupabaseClient) => {
    const seq = ++funnelSeqRef.current;
    try {
      const next = await fetchOpsOverview(client, 30);
      if (seq !== funnelSeqRef.current) return;
      setOverview30(next);
      setFunnelError(null);
    } catch (error) {
      if (seq === funnelSeqRef.current) setFunnelError(messageOf(error, '30일 흐름을 읽지 못했어요.'));
    }
  }, []);

  /** 흐름 기간 토글. 30일은 처음 고를 때만 받고(그 뒤로는 새로고침이 갱신한다), 7일은 이미 든 집계를 쓴다. */
  const changeFunnelDays = useCallback(
    (days: TAdminOpsFunnelDays) => {
      funnelDaysRef.current = days;
      setFunnelDays(days);
      if (days === 7) {
        funnelSeqRef.current += 1; // 날아가는 중인 30일 응답을 버린다
        setFunnelError(null);
        return;
      }
      if (clientRef.current && ensureSession()) void loadOverview30(clientRef.current);
    },
    [ensureSession, loadOverview30],
  );

  /**
   * 7일 집계 + 지금 걸러 보기의 첫 장을 함께. 첫 장은 이미 든 목록에 합친다(`mergeRuns`).
   * **둘을 따로 산다** — 실행 기록만 실패했다고 다섯 칸·띠까지 옛 값에 묶이면 안 된다(흐름의 30일과 같은 이유). 집계가 실패하면 던지고,
   * 실행 기록 실패는 표 쪽 한 줄(`runsError`)로만 말한다. 받은 첫 장을 돌려준다(실패면 null).
   */
  const refresh = useCallback(async (client: SupabaseClient): Promise<TPipelineRun[] | null> => {
    const filter = filterRef.current;
    const seq = runsSeqRef.current;
    const nowMs = Date.now();
    const [overviewResult, runsResult] = await Promise.allSettled([fetchOpsOverview(client, 7), fetchRuns(client, queryOf(filter, nowMs))]);
    if (overviewResult.status === 'rejected') throw overviewResult.reason;
    setOverview(overviewResult.value);
    setLoadedAt(Date.now());
    const firstPage = runsResult.status === 'fulfilled' ? runsResult.value : null;
    if (seq === runsSeqRef.current) {
      if (firstPage) {
        setRuns((current) => mergeRuns(current, firstPage));
        setRunsError(null);
        if (doneByErrorRef.current) {
          doneByErrorRef.current = false;
          setRunsDone(firstPage.length < RUNS_PAGE_SIZE);
        }
      } else {
        setRunsError(messageOf(runsResult.status === 'rejected' ? runsResult.reason : null, '실행 기록을 읽지 못했어요.'));
      }
    }
    // 30일을 보고 있으면 그것도 새로 — 실패해도 위의 갱신은 남긴다(흐름 한 묶음만 오류를 말한다).
    if (funnelDaysRef.current === 30) void loadOverview30(client);
    return firstPage;
  }, [loadOverview30]);

  const start = useCallback(
    async (next: TAdminSession) => {
      setFatal(null);
      setOverview(null);
      setRuns([]);
      setRunsDone(false);
      setRunsError(null);
      setPinnedRun(null);
      setOverview30(null);
      setRefreshError(null);
      setPhase('verifying');
      const client = createAdminClient(next.accessToken);
      clientRef.current = client;
      sessionRef.current = next;
      try {
        if (!(await isOperator(client))) {
          setPhase('notOperator');
          return;
        }
        setPhase('loading');
        const firstPage = await refresh(client);
        doneByErrorRef.current = firstPage === null;
        setRunsDone(firstPage === null || firstPage.length < RUNS_PAGE_SIZE);
        setPhase('ready');
      } catch (error) {
        setFatal(messageOf(error, '운영 현황을 불러오지 못했어요.'));
        setPhase('error');
        return;
      }
      /*
       * Slack 메시지의 링크(`/admin/ops/?run=<id>`). `useSearchParams` 는 정적 내보내기에서 Suspense 경계를 요구해, 마운트 effect 가
       * 부르는 여기서 `window.location.search` 를 직접 읽는다(화면은 `ssr: false`). 못 읽으면 그 행만 안 펼쳐지고 화면은 그대로다.
       */
      const runId = new URLSearchParams(window.location.search).get('run');
      if (!runId) return;
      try {
        const row = await fetchRun(client, runId);
        if (!row) return;
        setPinnedRun(row);
        setExpandedRun(row.id);
      } catch (error) {
        setRunsError(messageOf(error, '링크의 실행 기록을 읽지 못했어요.'));
      }
    },
    [refresh],
  );

  /**
   * 조용한 새로고침(60초 · 탭이 다시 보일 때 · 손 새로고침). **매번 세션부터 본다** — 12시간 뒤 토큰이 죽으면
   * 화면은 굳은 채 "N초 전" 만 늘어난다. 만료면 `/admin` 과 같은 자리(로그인 폼 + 같은 안내)로 보낸다.
   */
  const quietRefresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client || refreshingRef.current || !ensureSession()) return;
    refreshingRef.current = true;
    try {
      await refresh(client);
      setRefreshError(null);
    } catch (error) {
      setRefreshError(messageOf(error, '다시 읽지 못했어요.'));
    } finally {
      refreshingRef.current = false;
    }
  }, [ensureSession, refresh]);

  /*
   * 60초마다, **탭이 보일 때만**. 숨은 탭에서 밤새 읽을 이유가 없다. 다시 보이면 낡았을 때 한 번 곧바로 읽는다 —
   * 다음 tick 까지 최대 1분을 옛 수로 보여 주면 "돌아왔는데 아직 돌고 있음" 을 믿게 된다.
   */
  const loadedAtRef = useRef(0);
  useEffect(() => {
    loadedAtRef.current = loadedAt;
  }, [loadedAt]);
  useEffect(() => {
    if (phase !== 'ready') return;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void quietRefresh();
    };
    const timer = setInterval(tick, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAtRef.current > REFRESH_MS) void quietRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [phase, quietRefresh]);

  /*
   * Realtime(todo/17 T5.2) — 워커 심장·진행률·실행 행을 받는 대로 **상태만** 고친다(집계 rpc 를 다시 부르지 않는다, `adminOpsRealtime`).
   * 붙는 클라이언트는 `start` 가 만든 운영자 세션의 것이다 — 다시 로그인하면 phase 가 ready 를 떠났다 돌아오므로 옛 채널은 cleanup 이 뗀다.
   * 끊겼다 다시 붙으면 그 사이의 이벤트는 오지 않는다 — 한 번 조용히 다시 읽어 메운다. 60초 폴링은 그대로 남는다.
   */
  useEffect(() => {
    const client = clientRef.current;
    if (phase !== 'ready' || !client) return;
    let wasDown = false;
    const stop = subscribeOps(client, {
      worker: (worker) => setOverview((current) => current && { ...current, workers: upsertWorker(current.workers ?? [], worker) }),
      run: (run) => {
        setOverview((current) => current && applyRunToOverview(current, run));
        setRuns((current) => upsertRun(current, run, runMatchesFilter(run, filterRef.current, Date.now())));
        setPinnedRun((current) => (current?.id === run.id ? run : current));
      },
      status: (status) => {
        setRealtime(status);
        if (status === 'SUBSCRIBED' && wasDown) void quietRefresh();
        wasDown = status !== 'SUBSCRIBED';
      },
    });
    return () => {
      stop();
      setRealtime(null);
    };
  }, [phase, quietRefresh]);

  /** 걸러 보기가 바뀌면 목록을 비우고 첫 장부터. 순번으로 늦게 온 옛 걸러 보기의 응답을 버린다. */
  const changeRunFilter = useCallback(async (next: TAdminOpsRunFilter) => {
    const client = clientRef.current;
    if (!client || !ensureSession()) return;
    filterRef.current = next;
    setRunFilter(next);
    const seq = ++runsSeqRef.current;
    // 날아가는 중인 옛 걸러 보기의 다음 장이 잠금을 쥔 채면 새 목록의 감시판이 그냥 돌아선다 — 그 응답은 어차피 순번으로 버려진다.
    loadingMoreRef.current = false;
    doneByErrorRef.current = false;
    // 링크로 연 행은 처음 화면의 것이다 — 걸러 보기를 바꾸면 그 결과만 보여 준다(맞지 않는 행이 맨 위에 남지 않게).
    setPinnedRun(null);
    setRuns([]);
    setRunsDone(false);
    setRunsError(null);
    try {
      const page = await fetchRuns(client, queryOf(next, Date.now()));
      if (seq !== runsSeqRef.current) return;
      setRuns(page);
      setRunsDone(page.length < RUNS_PAGE_SIZE);
    } catch (error) {
      if (seq === runsSeqRef.current) {
        setRunsError(messageOf(error, '실행 기록을 읽지 못했어요.'));
        // 감시판이 실패한 장을 계속 다시 부르지 않게 — 다음 새로고침이 성공하면 다시 연다
        setRunsDone(true);
        doneByErrorRef.current = true;
      }
    }
  }, [ensureSession]);

  /**
   * 다음 장. 무한 스크롤 감시자는 커서·콜백이 바뀔 때마다 다시 걸려 같은 장을 두 번 부를 수 있다 — ref 로 막고, 합칠 때 id 로 한 번 더 거른다.
   */
  const loadMoreRuns = useCallback(async () => {
    const client = clientRef.current;
    const last = runs.at(-1);
    if (!client || !last || loadingMoreRef.current || runsDone || !ensureSession()) return;
    loadingMoreRef.current = true;
    const seq = runsSeqRef.current;
    try {
      const page = await fetchRuns(client, queryOf(filterRef.current, Date.now(), last.started_at));
      if (seq !== runsSeqRef.current) return;
      setRuns((current) => mergeRuns(current, page));
      if (page.length < RUNS_PAGE_SIZE) setRunsDone(true);
    } catch (error) {
      if (seq === runsSeqRef.current) {
        setRunsError(messageOf(error, '실행 기록을 더 읽지 못했어요.'));
        setRunsDone(true);
        doneByErrorRef.current = true;
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [ensureSession, runs, runsDone]);

  /** ① 칸을 누르면 그 스크립트로 걸러 본다. 이미 그 칸이면 전체로 돌린다. */
  const selectStage = useCallback(
    (key: TStageKey) => {
      const scripts = STAGE_SCRIPTS[key];
      if (!scripts) return;
      const current = filterRef.current;
      void changeRunFilter({ ...current, scripts: sameScripts(current.scripts ?? null, scripts) ? null : scripts });
    },
    [changeRunFilter],
  );

  const toggleRun = useCallback((id: string) => setExpandedRun((current) => (current === id ? null : id)), []);

  // 마운트 뒤에야 localStorage 를 읽는다 — `/admin` 과 같은 순서(만료된 세션과 처음 여는 화면을 가른다).
  useEffect(() => {
    void (async () => {
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

  const backLink = (
    <Link href="/admin/" className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
      ← 검수 화면
    </Link>
  );

  if (phase === 'checking') return <p className="px-5 pt-10 text-sm text-tertiary">불러오는 중이에요</p>;

  if (phase === 'signedOut') {
    return (
      <div>
        <PageHeader title="운영 현황" description="파이프라인이 돌고 있는지 봐요" actions={backLink} />
        <AdminPageLogin onSignedIn={signedIn} notice={notice} />
      </div>
    );
  }

  if (phase === 'verifying' || phase === 'loading') {
    // 다섯 칸 자리를 먼저 잡는다(높이 고정) — 수가 들어올 때 아래가 뛰지 않게(features 「빈 상태와 첫 화면」).
    return (
      <div>
        <PageHeader title="운영 현황" description={phase === 'verifying' ? '운영자인지 확인하고 있어요' : '기록을 불러오고 있어요'} />
        <div className="mt-4">
          <AdminOpsPageStageStrip stages={null} active={null} />
        </div>
      </div>
    );
  }

  if (phase === 'notOperator') {
    return (
      <div>
        <PageHeader title="운영 현황" actions={backLink} />
        <div className="px-4 pt-6 md:px-6">
          <p className="text-sm text-secondary">{session?.email ?? '이 계정'} 계정은 운영자가 아니에요.</p>
          <Button color="secondary" size="sm" className="mt-3" onClick={() => resetToSignedOut()}>
            다른 계정으로 로그인
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'error' || !overview) {
    return (
      <div>
        <PageHeader title="운영 현황" actions={backLink} />
        <div className="px-4 pt-6 md:px-6">
          <p className="text-sm text-error-primary">{fatal ?? '운영 현황을 불러오지 못했어요.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button color="primary" size="sm" onClick={() => session && void start(session)}>
              다시 시도
            </Button>
            <Button color="secondary" size="sm" onClick={() => resetToSignedOut()}>
              로그아웃
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /*
   * `Date.now()` 를 렌더에서 읽는다 — 판정과 상대 시각이 "지금" 에 기대므로 새로고침(60초)마다 다시 그려지면 충분하다.
   * 칸의 "3분 전" 이 1분 늦게 바뀌는 것은 괜찮고, 그것 때문에 매초 다섯 칸을 다시 그릴 이유는 없다.
   */
  // eslint-disable-next-line react-hooks/purity -- 위 주석: 새로고침마다 다시 그려지는 것으로 충분하다
  const nowMs = Date.now();
  const stages = stageHealth(overview, nowMs);
  const worst = worstStage(stages);
  const rebuild = rebuildHeadline(overview.rebuildRecent, nowMs);
  // 워커 키가 없으면(마이그레이션 전 응답) 칸을 그리지 않는다 — 모르는 것을 "워커 없음" 으로 말하지 않는다.
  const worker = overview.workers ? workerHealth(overview.workers, nowMs) : null;
  const workerRun = worker?.runId ? (Object.values(overview.runsLatest).find((row) => row?.id === worker.runId) ?? null) : null;
  const activeStage =
    (Object.keys(STAGE_SCRIPTS) as TStageKey[]).find((key) => STAGE_SCRIPTS[key] && sameScripts(STAGE_SCRIPTS[key], runFilter.scripts ?? null)) ?? null;

  return (
    <div className="pb-8">
      <PageHeader
        title="운영 현황"
        description="수집 → 분석 → 검수 → 반영 → 재빌드가 돌고 있는지 봐요"
        actions={
          <div className="flex items-center gap-3 text-xs text-tertiary">
            {backLink}
            <Button color="secondary" size="sm" onClick={() => void quietRefresh()}>
              새로고침
            </Button>
            <AdminOpsPageSince key={loadedAt} at={loadedAt} />
            {realtime && realtime !== 'SUBSCRIBED' ? <span title={realtime}>실시간 꺼짐 — 60초마다</span> : null}
          </div>
        }
      />
      <div className="px-4 pt-1 text-xs md:px-6">
        {/* `/admin` 머리글과 같은 줄(`rebuildHeadline`). 경고면 이 줄도 노랗다 — 여기는 탭 줄이 없어 띠로 옮기지 않는다. */}
        <p className={cx('min-h-4', rebuild.tone === 'warn' ? 'text-warning-primary' : 'text-tertiary')}>{rebuild.text}</p>
        {refreshError ? <p className="mt-0.5 text-error-primary">다시 읽지 못했어요 — 아래는 앞서 읽은 값이에요({refreshError})</p> : null}
      </div>

      {/* 주의가 있을 때만, **가장 심한 하나만**(features ①). 첫날(회색)은 띠가 없다. */}
      {worst ? (
        <p
          role="alert"
          className={cx(
            'mt-3 px-4 py-2 text-xs font-semibold md:px-6',
            worst.state === 'fail' ? 'bg-error-primary text-error-primary' : 'bg-warning-primary text-warning-primary',
          )}
        >
          {worst.reason}
          {worst.hint ? <span className="ml-2 font-normal">— 터미널에서 {worst.hint}</span> : null}
        </p>
      ) : null}

      {worker ? <AdminOpsPageWorker health={worker} run={workerRun} requestsQueued={overview.requestsQueued} nowMs={nowMs} /> : null}

      <section className="mt-4" aria-label="파이프라인">
        <AdminOpsPageStageStrip stages={stages} active={activeStage} onSelect={selectStage} />
      </section>

      {/* ② 흐름 — ① 바로 아래(첫날에도 기존 표로 채워져 비어 있지 않다, features 「빈 상태」). */}
      <AdminOpsPageFunnel
        funnel={funnelDays === 7 ? overview.funnel : (overview30?.funnel ?? null)}
        pendingNow={overview.funnel.pendingNow}
        days={funnelDays}
        onDays={changeFunnelDays}
        loading={funnelDays === 30 && !overview30 && !funnelError}
      />
      {funnelDays === 30 && funnelError ? <p className="mt-1 px-4 text-xs text-error-primary md:px-6">{funnelError}</p> : null}

      <AdminOpsPageRunsTable
        runs={runs}
        pinned={pinnedRun}
        nowMs={nowMs}
        scripts={runFilter.scripts ?? null}
        failedOnly={runFilter.failedOnly}
        onFilter={(next) => void changeRunFilter(next)}
        expandedId={expandedRun}
        onToggle={toggleRun}
        hasMore={!runsDone && runs.length > 0}
        onMore={loadMoreRuns}
        error={runsError}
      />

      <AdminOpsPageUsage usage={overview.usage30d} />
      <AdminOpsPageAlerts slackConfigured={overview.slackConfigured} />
    </div>
  );
}
