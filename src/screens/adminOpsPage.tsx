'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/base/button';
import { PageHeader } from '../components/layout/pageHeader';
import { fetchOpsOverview, fetchRuns, mergeRuns, RUNS_PAGE_SIZE, type TOpsOverview, type TPipelineRun, type TRunsQuery } from '../lib/adminOps';
import { stageHealth, stalledBefore, worstStage } from '../lib/adminOpsHealth';
import { rebuildHeadline } from '../lib/adminRebuild';
import { ADMIN_SESSION_KEY, clearAdminSession, readAdminSession, sessionProblem, type TAdminSession } from '../lib/adminSession';
import { createAdminClient, isOperator } from '../lib/adminSupabase';
import { cx } from '../utils/cx';
import { AdminOpsPageStageStrip } from './adminOpsPageStageStrip';
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

  const clientRef = useRef<SupabaseClient | null>(null);
  const sessionRef = useRef<TAdminSession | null>(null);
  const filterRef = useRef<TAdminOpsRunFilter>({ scripts: null, failedOnly: false });
  /** 조용한 새로고침이 겹치지 않게. 느린 응답 위에 다음 tick 이 또 쏘면 늦은 쪽이 새 값을 덮는다. */
  const refreshingRef = useRef(false);
  /** 걸러 보기를 빠르게 바꿀 때 늦게 온 옛 걸러 보기의 응답이 이기지 않게. */
  const runsSeqRef = useRef(0);

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

  /** 7일 집계 + 지금 걸러 보기의 첫 장을 함께. 첫 장은 이미 든 목록에 합친다(`mergeRuns`). */
  const refresh = useCallback(async (client: SupabaseClient) => {
    const filter = filterRef.current;
    const seq = runsSeqRef.current;
    const nowMs = Date.now();
    const [nextOverview, firstPage] = await Promise.all([fetchOpsOverview(client, 7), fetchRuns(client, queryOf(filter, nowMs))]);
    setOverview(nextOverview);
    setLoadedAt(Date.now());
    if (seq === runsSeqRef.current) setRuns((current) => mergeRuns(current, firstPage));
  }, []);

  const start = useCallback(
    async (next: TAdminSession) => {
      setFatal(null);
      setOverview(null);
      setRuns([]);
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
        await refresh(client);
        setPhase('ready');
      } catch (error) {
        setFatal(messageOf(error, '운영 현황을 불러오지 못했어요.'));
        setPhase('error');
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
    if (!client || refreshingRef.current) return;
    if (sessionProblem(sessionRef.current, Math.floor(Date.now() / 1000)) !== 'none') {
      resetToSignedOut('로그인이 만료됐어요. 다시 로그인해 주세요.');
      return;
    }
    refreshingRef.current = true;
    try {
      await refresh(client);
      setRefreshError(null);
    } catch (error) {
      setRefreshError(messageOf(error, '다시 읽지 못했어요.'));
    } finally {
      refreshingRef.current = false;
    }
  }, [refresh, resetToSignedOut]);

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

      <section className="mt-4" aria-label="파이프라인">
        <AdminOpsPageStageStrip stages={stages} active={null} />
      </section>

      {/* ② 흐름(T3.6) · ③ 실행 기록(T3.7) · ④ 사용량 · ⑤ 알림(T3.8) 이 여기 선다. */}
      <p className="px-4 pt-6 text-xs text-tertiary md:px-6">실행 기록 {runs.length}건</p>
    </div>
  );
}
