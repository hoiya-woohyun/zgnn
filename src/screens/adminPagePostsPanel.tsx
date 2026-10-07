'use client';

import { SearchLg } from '@untitledui/icons';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/base/button';
import { Checkbox } from '../components/base/checkbox';
import { Input } from '../components/base/input';
import { CARD_SURFACE } from '../components/cardSurface';
import { EmptyState } from '../components/layout/emptyState';
import { NO_AUTOFILL } from '../components/noAutofill';
import {
  NEXT_POSTS,
  postPageCount,
  reopenSummary,
  rereadSummary,
  type TBacklogCount,
  type TPostBacklog,
  type TPostCounts,
  type TPostFilter,
  type TPostPage,
  type TPostRow,
  type TReopenPlan,
} from '../lib/adminPosts';
import { cx } from '../utils/cx';
import { AdminPagePostsPanelRow } from './adminPagePostsPanelRow';

type TAdminPagePostsPanelProps = {
  /** undefined = 아직 못 셌다(조회 중이거나 실패 — `error` 가 이유). 건수 자체는 머리글(`PageHeader`)이 말한다. */
  counts?: TPostCounts;
  error?: string;
  /** 미분석 글의 집계·다음 30건(todo/13 T4.4). undefined = 아직 읽는 중(이 칸을 처음 열 때 읽는다). */
  backlog?: { data?: TPostBacklog; error?: string };
  /** 확인 날짜가 빈 시드 수(11 H.6). null = 칸이 없거나 장소 목록을 못 읽었다 — 그때는 줄을 안 그린다. */
  seedTargets: number | null;
  /** 시드에 확인 날짜를 찍는다 — 결과 한 줄을 돌려주고, 실패하면 던진다. */
  onSeedVerify: () => Promise<string>;
  /** 옛 규칙으로 버려진 글을 다시 열 계획(읽기만). */
  onPlanReopen: () => Promise<TReopenPlan>;
  /** 계획대로 되돌린다 — 결과 한 줄을 돌려주고, 실패하면 던진다. */
  onReopen: (plan: TReopenPlan) => Promise<string>;
  /** 이 칸이 열려 있나 — 글 목록은 처음 열 때 읽는다(칸은 `hidden` 으로 늘 마운트돼 있다). */
  active: boolean;
} & TPostListActions;

/** 글 목록(09 T3.2)의 읽기·쓰기. 쓰기는 결과 한 줄을 돌려주고 실패하면 던진다 — 건수·후보 목록을 다시 읽는 것은 `adminPage` 몫이다. */
type TPostListActions = {
  onFetchPosts: (query: { filter: TPostFilter; page: number; excludedApplied: boolean }) => Promise<TPostPage>;
  onExcludePosts: (urls: string[], note: string) => Promise<string>;
  onUnexcludePosts: (urls: string[]) => Promise<string>;
  /** 읽기만(잠금 없이). */
  onPlanReread: (rows: TPostRow[]) => Promise<TReopenPlan>;
  onReread: (plan: TReopenPlan) => Promise<string>;
};

type TStep = { busy?: boolean; confirming?: boolean; plan?: TReopenPlan; done?: string; error?: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : '처리하지 못했어요.');

const n = (value: number) => value.toLocaleString('ko-KR');

/** 건수 표 하나 — 이름과 수 두 칸. 긴 표는 칸 안에서 스크롤한다(검색어가 수십 개라 탭 전체를 밀지 않게). */
function AdminPagePostsBacklogTable({ caption, head, rows }: { caption: string; head: string; rows: TBacklogCount[] }) {
  return (
    <div className="max-h-72 min-w-0 flex-1 overflow-y-auto rounded-lg border border-secondary bg-primary sm:max-w-80">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-primary text-tertiary">
          <tr>
            <th className="px-3 py-1.5 text-left font-semibold">{head}</th>
            <th className="px-3 py-1.5 text-right font-semibold">건수</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-1 text-secondary">{row.key}</td>
              <td className="px-3 py-1 text-right tabular-nums text-secondary">{n(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PICKED_CHIP = 'ring-2! ring-brand!';

type TBulkStep = { mode?: 'exclude' | 'reread'; plan?: TReopenPlan; busy?: boolean; error?: string };

/**
 * 수집한 글 목록(09 T3.2) — 세 칩이 전체를 나눈다(미분석 · 분석됨 · 제외, 분석된 뒤 제외한 글은 제외에만). 미분석 칩의 수는 머리글과 같은 `unanalyzed` 다.
 * 고른 것은 **이 칸만의 집합**(글 url) — 검수 대기의 `selected` 와 키 공간이 달라 섞지 않는다. 걸러 보기·페이지를 바꾸면 비운다(안 보이는 줄에 일괄이 걸리지 않게).
 * 쓰기가 끝나면 지금 페이지를 다시 읽는다 — 제외한 줄이 칩 밖으로 나가 페이지가 줄면 마지막 페이지로 물러선다.
 */
function AdminPagePostsList({
  counts,
  active,
  onFetchPosts,
  onExcludePosts,
  onUnexcludePosts,
  onPlanReread,
  onReread,
}: { counts: TPostCounts; active: boolean } & TPostListActions) {
  const excludedApplied = counts.excluded !== null;
  const [filter, setFilter] = useState<TPostFilter>('unanalyzed');
  const [page, setPage] = useState(0);
  const [load, setLoad] = useState<{ data?: TPostPage; error?: string; busy?: boolean }>({});
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [bulk, setBulk] = useState<TBulkStep>({});
  const [bulkNote, setBulkNote] = useState('');
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const askedRef = useRef(false);

  const read = async (nextFilter: TPostFilter, nextPage: number) => {
    setLoad((prev) => ({ ...prev, busy: true, error: undefined }));
    try {
      let data = await onFetchPosts({ filter: nextFilter, page: nextPage, excludedApplied });
      const last = postPageCount(data.total) - 1;
      if (nextPage > last) {
        data = await onFetchPosts({ filter: nextFilter, page: last, excludedApplied });
        setPage(last);
      }
      setLoad({ data });
    } catch (error) {
      setLoad({ error: messageOf(error) });
    }
  };

  // 칸을 처음 열 때 한 번(백로그와 같은 길). 탭을 오가는 것만으로는 다시 읽지 않는다 — 쓰기 뒤와 칩·페이지를 누를 때만.
  useEffect(() => {
    if (!active || askedRef.current) return;
    askedRef.current = true;
    void read(filter, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번만. 그 뒤의 읽기는 손잡이(칩·페이지·쓰기)가 부른다.
  }, [active]);

  const go = (nextFilter: TPostFilter, nextPage: number) => {
    setFilter(nextFilter);
    setPage(nextPage);
    setPicked(new Set());
    setBulk({});
    setNotice(undefined);
    void read(nextFilter, nextPage);
  };

  /** 쓰기 하나 — 결과를 말하고, 고른 것을 비우고, 지금 페이지를 다시 읽는다. 실패는 던진다(부른 쪽 줄에 남는다). */
  const afterWrite = async (write: () => Promise<string>) => {
    const said = await write();
    setNotice(said);
    setPicked(new Set());
    setBulk({});
    setBulkNote('');
    await read(filter, page);
  };

  const rows = load.data?.rows ?? [];
  const pickedRows = rows.filter((row) => picked.has(row.url));
  const allPicked = rows.length > 0 && pickedRows.length === rows.length;
  const locked = Boolean(bulk.busy);
  const pageCount = postPageCount(load.data?.total ?? 0);
  const chips: { key: TPostFilter; label: string }[] = [
    { key: 'unanalyzed', label: `미분석 ${n(counts.unanalyzed)}` },
    { key: 'analyzed', label: '분석됨' },
    ...(excludedApplied ? [{ key: 'excluded' as const, label: `제외 ${n(counts.excluded ?? 0)}` }] : []),
  ];

  const toggle = (url: string, next: boolean) =>
    setPicked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(url);
      else copy.delete(url);
      return copy;
    });

  const runBulk = async (write: () => Promise<string>) => {
    setBulk((prev) => ({ ...prev, busy: true, error: undefined }));
    try {
      await afterWrite(write);
    } catch (error) {
      setBulk((prev) => ({ ...prev, busy: false, error: messageOf(error) }));
    }
  };
  const planBulkReread = async () => {
    setBulk({ mode: 'reread', busy: true });
    try {
      setBulk({ mode: 'reread', plan: await onPlanReread(pickedRows) });
    } catch (error) {
      setBulk({ error: messageOf(error) });
    }
  };

  return (
    <section aria-label="수집한 글 목록" className="mt-6 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <Button
            key={chip.key}
            size="sm"
            color="secondary"
            className={filter === chip.key ? PICKED_CHIP : undefined}
            aria-pressed={filter === chip.key}
            isDisabled={load.busy || locked}
            onClick={() => go(chip.key, 0)}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <Checkbox
            size="sm"
            isSelected={allPicked}
            isIndeterminate={pickedRows.length > 0 && !allPicked}
            isDisabled={locked}
            onChange={(next) => setPicked(next ? new Set(rows.map((row) => row.url)) : new Set())}
            label={<span className="text-xs text-secondary">이 페이지 {rows.length}건 전부 고르기</span>}
          />
          {pickedRows.length > 0 && !bulk.mode && (
            <>
              <span className="font-semibold text-primary">{pickedRows.length}건 고름</span>
              {excludedApplied && filter !== 'excluded' && (
                <Button color="secondary" size="sm" isDisabled={locked} onClick={() => setBulk({ mode: 'exclude' })}>
                  분석 제외
                </Button>
              )}
              {filter === 'excluded' && (
                <Button
                  color="secondary"
                  size="sm"
                  isDisabled={locked}
                  isLoading={bulk.busy}
                  onClick={() => void runBulk(() => onUnexcludePosts(pickedRows.map((row) => row.url)))}
                >
                  제외 해제
                </Button>
              )}
              {filter === 'analyzed' && (
                <Button color="secondary" size="sm" isDisabled={locked} isLoading={bulk.busy} onClick={() => void planBulkReread()}>
                  다시 읽기
                </Button>
              )}
              <Button color="link-gray" size="sm" isDisabled={locked} onClick={() => setPicked(new Set())}>
                고름 풀기
              </Button>
            </>
          )}
        </div>
      )}

      {bulk.mode === 'exclude' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-primary">{pickedRows.length}건 분석 제외</span>
          <div className="min-w-48 flex-1">
            <Input {...NO_AUTOFILL} aria-label="제외 사유(선택)" placeholder="제외 사유 (선택) — 예: 광고 글" value={bulkNote} onChange={setBulkNote} isDisabled={locked} size="sm" />
          </div>
          <Button
            color="secondary"
            size="sm"
            isLoading={bulk.busy}
            isDisabled={locked || pickedRows.length === 0}
            onClick={() => void runBulk(() => onExcludePosts(pickedRows.map((row) => row.url), bulkNote))}
          >
            {pickedRows.length}건 제외
          </Button>
          <Button color="secondary" size="sm" isDisabled={locked} onClick={() => setBulk({})}>
            취소
          </Button>
        </div>
      )}
      {bulk.mode === 'reread' && bulk.plan && (
        <div className="space-y-1.5 text-xs">
          <p className="text-tertiary">{rereadSummary(bulk.plan)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              color="secondary"
              size="sm"
              isLoading={bulk.busy}
              isDisabled={locked || bulk.plan.posts.length === 0}
              onClick={() => bulk.plan && void runBulk(() => onReread(bulk.plan as TReopenPlan))}
            >
              {bulk.plan.posts.length}건 다시 읽기
            </Button>
            <Button color="secondary" size="sm" isDisabled={locked} onClick={() => setBulk({})}>
              취소
            </Button>
          </div>
        </div>
      )}
      {bulk.error && <p className="text-xs text-error-primary">{bulk.error}</p>}
      {notice && <p className="text-xs text-success-primary">{notice}</p>}

      {load.error ? (
        <p className="text-xs text-error-primary">{load.error}</p>
      ) : !load.data ? (
        <p className="text-xs text-tertiary">글 목록을 읽고 있어요</p>
      ) : rows.length === 0 ? (
        <EmptyState
          Icon={SearchLg}
          title={filter === 'excluded' ? '분석에서 뺀 글이 없어요' : filter === 'analyzed' ? '분석된 글이 없어요' : '미분석 글이 없어요'}
          description={filter === 'excluded' ? '광고·목록 글은 줄의 분석 제외로 빼요.' : '새 글은 터미널에서 pnpm data collect 로 모아요.'}
        />
      ) : (
        <ul className={cx(CARD_SURFACE, 'divide-y divide-secondary', load.busy && 'opacity-60')}>
          {rows.map((row) => (
            <AdminPagePostsPanelRow
              key={row.url}
              row={row}
              excludedApplied={excludedApplied}
              selected={picked.has(row.url)}
              onSelect={(next) => toggle(row.url, next)}
              locked={locked || Boolean(load.busy)}
              onExclude={(note) => afterWrite(() => onExcludePosts([row.url], note))}
              onUnexclude={() => afterWrite(() => onUnexcludePosts([row.url]))}
              onPlanReread={() => onPlanReread([row])}
              onReread={(plan) => afterWrite(() => onReread(plan))}
            />
          ))}
        </ul>
      )}

      {load.data && (
        <div className="flex items-center justify-center gap-3 text-xs text-secondary">
          <Button color="secondary" size="sm" isDisabled={page === 0 || load.busy || locked} onClick={() => go(filter, page - 1)}>
            이전
          </Button>
          <span className="tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button color="secondary" size="sm" isDisabled={page + 1 >= pageCount || load.busy || locked} onClick={() => go(filter, page + 1)}>
            다음
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * 수집 완료 칸(`blog_posts`, 09 D4·D5) — **다음 명령**을 말하고, 차이 게이트(11)로 넘어가는 **한 번짜리 준비 두 단계**를 버튼으로 둔다.
 *
 * 버튼이 분석을 돌리지는 않는다: 수집·분석은 네이버 키와 `claude -p` 구독이 있는 사용자 터미널에서만 돈다(ADR-016·018).
 * 여기 버튼 둘은 DB 만 바꾼다(운영자 세션 · 새 GRANT 없음) — 11 런북의 `02-seed-verified-at.sql` · `03-reopen-already-have.sql` 과 같은 규칙이다.
 * 순서가 중요해 위에서 아래로 번호를 붙였다: ① 시드 확인 날짜를 먼저 찍어야 ② 다시 연 옛 글이 시드를 바꾸자고 하지 않는다.
 */
export function AdminPagePostsPanel({ counts, error, backlog, seedTargets, onSeedVerify, onPlanReopen, onReopen, active, ...listActions }: TAdminPagePostsPanelProps) {
  const [seed, setSeed] = useState<TStep>({});
  const [reopen, setReopen] = useState<TStep>({});

  if (error) return <p className="px-4 pt-6 text-sm text-error-primary md:px-6">{error}</p>;
  if (!counts) return <p className="px-4 pt-6 text-sm text-tertiary md:px-6">수집한 글을 세고 있어요</p>;

  const oldPosts = counts.existing?.alreadyHavePosts.length ?? 0;
  const showSeed = (seedTargets ?? 0) > 0 || Boolean(seed.done);
  const showReopen = oldPosts > 0 || Boolean(reopen.done);

  const runSeed = async () => {
    setSeed({ busy: true });
    try {
      setSeed({ done: await onSeedVerify() });
    } catch (e) {
      setSeed({ error: messageOf(e) });
    }
  };
  const planReopen = async () => {
    setReopen({ busy: true });
    try {
      setReopen({ confirming: true, plan: await onPlanReopen() });
    } catch (e) {
      setReopen({ error: messageOf(e) });
    }
  };
  const runReopen = async (plan: TReopenPlan) => {
    setReopen({ busy: true, confirming: true, plan });
    try {
      setReopen({ done: await onReopen(plan) });
    } catch (e) {
      setReopen({ confirming: true, plan, error: messageOf(e) });
    }
  };

  return (
    <div className="space-y-2 px-4 pt-6 text-sm text-secondary md:px-6">
      {counts.unanalyzed > 0 ? (
        <p>
          미분석 {counts.unanalyzed.toLocaleString('ko-KR')}건 — 터미널에서 <code>pnpm data analyze --limit 30</code> 를 돌리면 읽어요.
        </p>
      ) : (
        <p>미분석 글이 없어요 — 새 글은 터미널에서 <code>pnpm data collect</code> 로 모아요.</p>
      )}
      {/*
        * 미분석이 **어디에 쌓여 있고 다음에 무엇을 읽나**(todo/13 T4.4). 숫자 하나로는 어느 검색어를 더 모을지·어디서 멈출지를 정할 수 없었다.
        * 다음 30건은 분석 스크립트의 집중 글 조건 그대로지만 블로그당 상한·한 가게 블로그 후순위는 터미널에서만 정해진다 — 그래서 "대략" 이라고 말한다.
        */}
      {counts.unanalyzed > 0 &&
        (!backlog ? (
          <p className="text-xs text-tertiary">미분석 글을 검색어·달별로 세고 있어요</p>
        ) : backlog.error ? (
          <p className="text-xs text-error-primary">{backlog.error}</p>
        ) : backlog.data ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AdminPagePostsBacklogTable caption="미분석 글 — 검색어별" head="검색어" rows={backlog.data.tally.byKeyword} />
              <AdminPagePostsBacklogTable caption="미분석 글 — 달별" head="글 날짜(달)" rows={backlog.data.tally.byMonth} />
            </div>
            <section aria-label="다음에 읽을 글" className="pt-2">
              <p className="text-xs font-semibold text-secondary">
                다음에 읽을 글 {backlog.data.next.length}건{' '}
                <span className="font-normal text-tertiary">— 대략 · 블로그당 상한은 터미널이 정해요</span>
              </p>
              {backlog.data.next.length === 0 ? (
                <p className="mt-1 text-xs text-tertiary">제목이 한 가게 후기로 보이는 미분석 글이 없어요 — 분석은 나머지 글을 최신순으로 읽어요.</p>
              ) : (
                <ol className="mt-1 divide-y divide-secondary text-xs">
                  {backlog.data.next.map((post) => (
                    <li key={post.url} className="flex flex-wrap items-baseline gap-x-2 py-1">
                      <a className="min-w-0 text-brand-secondary underline" href={post.url} target="_blank" rel="noopener noreferrer">
                        {post.title ?? post.url}
                      </a>
                      <span className="text-tertiary">
                        {post.posted_at ?? '날짜 없음'} · {post.keyword ?? '검색어 없음'}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {backlog.data.next.length === NEXT_POSTS ? null : backlog.data.next.length > 0 ? (
                <p className="mt-1 text-xs text-tertiary">나머지 자리는 분석이 제목과 무관하게 최신 글로 채워요.</p>
              ) : null}
            </section>
          </>
        ) : null)}
      {/*
        * 차이 게이트(11 U1)가 일하는 것이 보이는 자리 — 이미 있는 가게를 쓴 글 중 사이트와 같은 말·확인 날짜보다 옛 글·근거 약함으로 후보가 안 된 것.
        * 다른 말을 한 글은 검수 대기의 `갱신`·`보강` 으로 갔다. 못 셌으면 아무 말도 안 한다(0 으로 그리면 "게이트가 다 버렸다" 로 읽힌다).
        */}
      {counts.existing && counts.existing.total > 0 && (
        <p className="text-xs text-tertiary">
          이미 있는 가게를 쓴 글 {counts.existing.total.toLocaleString('ko-KR')} · 같은 말 {counts.existing.same.toLocaleString('ko-KR')} · 옛 글{' '}
          {counts.existing.stale.toLocaleString('ko-KR')} · 근거 약함 {counts.existing.weak.toLocaleString('ko-KR')} — 후보로 안 올렸어요(다른 말을 한 글은 검수 대기의 갱신·보강)
        </p>
      )}
      {/* 신규인데 동반 근거를 못 찾은 가게(ADR-019 v6) — 버린 게 아니라 업체명 재검색(결정 7)을 기다리는 줄이다. */}
      {counts.existing && counts.existing.noPetEvidence > 0 && (
        <p className="text-xs text-tertiary">
          신규지만 글에 동반 근거가 없던 가게 {counts.existing.noPetEvidence.toLocaleString('ko-KR')} — 후보로 안 올렸어요(목록 글의 이름 나열이 대부분 · 업체명 재검색이 생기면 다시 봐요)
        </p>
      )}
      {counts.excluded === null ? (
        <p className="text-xs text-tertiary">글 단위 분석 제외는 DB 마이그레이션이 적용된 뒤에 쓸 수 있어요(미적용).</p>
      ) : null}

      {(showSeed || showReopen) && (
        <section aria-label="기존 가게 갱신 준비" className="mt-4 space-y-3 rounded-lg border border-secondary bg-primary p-3 text-xs">
          <p className="font-semibold text-secondary">기존 가게 갱신 준비 — 한 번만, 위에서부터</p>

          {showSeed && (
            <div className="space-y-1.5">
              <p>
                ① 시드 {seedTargets ?? 0}곳에 확인 날짜(2026-09-20) 찍기 — 그 전 글이 시드를 바꾸자고 하지 않게 해요.{' '}
                <span className="text-tertiary">다음 빌드부터 상세에 &ldquo;2026년 9월 확인&rdquo; 이 보여요.</span>
              </p>
              {seed.done ? (
                <p className="text-success-primary">{seed.done}</p>
              ) : (
                <Button color="secondary" size="sm" isLoading={seed.busy} isDisabled={seed.busy || reopen.busy} onClick={() => void runSeed()}>
                  확인 날짜 찍기
                </Button>
              )}
              {seed.error && <p className="text-error-primary">{seed.error}</p>}
            </div>
          )}

          {showReopen && (
            <div className="space-y-1.5">
              <p>
                ② 옛 규칙으로 기존 가게를 건너뛴 글 {oldPosts.toLocaleString('ko-KR')}건 다시 열기 — 다음 <code>pnpm data analyze</code> 가 사이트와 대 보며 다시 읽어요.
              </p>
              {reopen.done ? (
                <p className="text-success-primary">{reopen.done}</p>
              ) : reopen.confirming && reopen.plan ? (
                <>
                  <p className="text-tertiary">{reopenSummary(reopen.plan)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      color="secondary"
                      size="sm"
                      isLoading={reopen.busy}
                      isDisabled={reopen.busy || reopen.plan.posts.length === 0}
                      onClick={() => reopen.plan && void runReopen(reopen.plan)}
                    >
                      {reopen.plan.posts.length}건 되돌리기
                    </Button>
                    <Button color="secondary" size="sm" isDisabled={reopen.busy} onClick={() => setReopen({})}>
                      취소
                    </Button>
                  </div>
                </>
              ) : (
                <Button color="secondary" size="sm" isLoading={reopen.busy} isDisabled={reopen.busy || seed.busy} onClick={() => void planReopen()}>
                  다시 열 글 살펴보기
                </Button>
              )}
              {reopen.error && <p className="text-error-primary">{reopen.error}</p>}
            </div>
          )}
        </section>
      )}

      <AdminPagePostsList counts={counts} active={active} {...listActions} />
    </div>
  );
}
