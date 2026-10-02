'use client';

import { useState } from 'react';
import { Button } from '../components/base/button';
import { reopenSummary, type TPostCounts, type TReopenPlan } from '../lib/adminPosts';

type TAdminPagePostsPanelProps = {
  /** undefined = 아직 못 셌다(조회 중이거나 실패 — `error` 가 이유). 건수 자체는 머리글(`PageHeader`)이 말한다. */
  counts?: TPostCounts;
  error?: string;
  /** 확인 날짜가 빈 시드 수(11 H.6). null = 칸이 없거나 장소 목록을 못 읽었다 — 그때는 줄을 안 그린다. */
  seedTargets: number | null;
  /** 시드에 확인 날짜를 찍는다 — 결과 한 줄을 돌려주고, 실패하면 던진다. */
  onSeedVerify: () => Promise<string>;
  /** 옛 규칙으로 버려진 글을 다시 열 계획(읽기만). */
  onPlanReopen: () => Promise<TReopenPlan>;
  /** 계획대로 되돌린다 — 결과 한 줄을 돌려주고, 실패하면 던진다. */
  onReopen: (plan: TReopenPlan) => Promise<string>;
};

type TStep = { busy?: boolean; confirming?: boolean; plan?: TReopenPlan; done?: string; error?: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : '처리하지 못했어요.');

/**
 * 수집 완료 칸(`blog_posts`, 09 D4·D5) — **다음 명령**을 말하고, 차이 게이트(11)로 넘어가는 **한 번짜리 준비 두 단계**를 버튼으로 둔다.
 *
 * 버튼이 분석을 돌리지는 않는다: 수집·분석은 네이버 키와 `claude -p` 구독이 있는 사용자 터미널에서만 돈다(ADR-016·018).
 * 여기 버튼 둘은 DB 만 바꾼다(운영자 세션 · 새 GRANT 없음) — 11 런북의 `02-seed-verified-at.sql` · `03-reopen-already-have.sql` 과 같은 규칙이다.
 * 순서가 중요해 위에서 아래로 번호를 붙였다: ① 시드 확인 날짜를 먼저 찍어야 ② 다시 연 옛 글이 시드를 바꾸자고 하지 않는다.
 */
export function AdminPagePostsPanel({ counts, error, seedTargets, onSeedVerify, onPlanReopen, onReopen }: TAdminPagePostsPanelProps) {
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
          미분석 {counts.unanalyzed.toLocaleString('ko-KR')}건 — 터미널에서 <code>pnpm data:analyze --limit 30</code> 를 돌리면 읽어요.
        </p>
      ) : (
        <p>미분석 글이 없어요 — 새 글은 터미널에서 <code>pnpm data:collect</code> 로 모아요.</p>
      )}
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
                ② 옛 규칙으로 기존 가게를 건너뛴 글 {oldPosts.toLocaleString('ko-KR')}건 다시 열기 — 다음 <code>pnpm data:analyze</code> 가 사이트와 대 보며 다시 읽어요.
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
    </div>
  );
}
