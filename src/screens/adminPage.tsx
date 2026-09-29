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
  fetchActivePlaces,
  fetchPendingCandidates,
  flagsFor,
  groupPending,
  previewFor,
  type TCandidateGroup,
  type TPlaceRow,
  type TRejectReason,
} from '../lib/adminCandidates';
import {
  ADMIN_SESSION_KEY,
  clearAdminSession,
  readAdminSession,
  sessionProblem,
  type TAdminSession,
} from '../lib/adminSession';
import { createAdminClient, isOperator } from '../lib/adminSupabase';
import { AdminPageGroupCard, type TAdminPageGroupState, type TApproveChoice } from './adminPageGroupCard';
import { AdminPageLogin } from './adminPageLogin';

/**
 * 운영자 검수 화면(ADR-018). 후보(candidates)를 묶어 보여 주고, "맞아요" 한 번으로 `places` 까지 반영한다.
 *
 * 상태 머신: `checking`(저장된 세션 확인) → `signedOut` → `verifying`(운영자인가) → `notOperator`
 *            → `loading`(후보·장소 조회) → `ready` | `error`.
 * 갈래를 문구 하나로 뭉개지 않는 이유 — 비운영자에게 RLS 는 빈 결과를 주므로 "후보가 없어요" 와
 * "운영자 계정이 아니에요" 가 같은 화면이 되기 쉽다. 그러면 사람이 진짜로 다 끝난 줄 안다.
 *
 * 쓰기는 전부 `src/lib/adminApply.ts` 가 한다 — 이 파일은 상태와 문구만 소유한다.
 * 실패를 **삼키지 않는다**: 카드 안에 빨간 한 줄로 남긴다. 삼키면 사람이 두 번 누르고 장소가 두 개 생긴다.
 *
 * 뒤로가기·상태바 인셋·스와이프는 셸 몫이라 여기서 아무것도 붙이지 않는다(ADR-007 · ADR-010 · ADR-014).
 */

const PAGE_SIZE = 20;
/** 끝난 카드가 초록 한 줄로 남아 있는 시간. 바로 지우면 "눌렀는데 아무 일도 안 났다" 로 보인다. */
const DONE_LINGER_MS = 3000;

type TPhase = 'checking' | 'signedOut' | 'verifying' | 'notOperator' | 'loading' | 'ready' | 'error';

type TFilter = 'all' | 'auto' | 'ask' | 'new' | 'policy';

const FILTERS: { key: TFilter; label: string; match: (group: TCandidateGroup) => boolean }[] = [
  { key: 'all', label: '전체', match: () => true },
  { key: 'auto', label: '일치', match: (group) => group.tier === 'auto' },
  { key: 'ask', label: '확인요청', match: (group) => group.tier === 'ask' },
  { key: 'new', label: '신규', match: (group) => group.tier === 'new' },
  { key: 'policy', label: '조건문 있음', match: (group) => group.hasPolicyText },
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
  const [filter, setFilter] = useState<TFilter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);

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

  const start = useCallback(async (next: TAdminSession) => {
    setFatal(null);
    setStranded(undefined);
    setPhase('verifying');
    const client = createAdminClient(next.accessToken);
    clientRef.current = client;
    try {
      if (!(await isOperator(client))) {
        setPhase('notOperator');
        return;
      }
      setPhase('loading');
      const [rows, places] = await Promise.all([fetchPendingCandidates(client), fetchActivePlaces(client)]);
      placesRef.current = places;
      setGroups(groupPending(rows));
      setStates({});
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
  }, []);

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
    (key: string): boolean => {
      if (sessionProblem(session, Math.floor(Date.now() / 1000)) !== 'none') {
        resetToSignedOut('로그인이 만료됐어요. 다시 로그인해 주세요.');
        return false;
      }
      if (writingRef.current) {
        // 조용히 넘기지 않는다 — 아무 말도 없으면 "눌렀는데 아무 일도 안 났다" 가 되고 사람이 계속 누른다.
        patchState(key, { error: '다른 묶음을 처리하고 있어요 — 끝나면 다시 눌러 주세요.' });
        return false;
      }
      writingRef.current = true;
      return true;
    },
    [patchState, resetToSignedOut, session],
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
      if (!beginWrite(group.key)) return;
      patchState(group.key, { busy: 'approving', error: undefined });
      try {
        const outcome = await approveGroup(client, group, placesRef.current, {
          nowIso: new Date().toISOString(),
          newId: newPlaceId,
          asNew: choice?.asNew,
          mergeInto: choice?.mergeInto,
        });
        if (outcome.kind === 'blocked') {
          patchState(group.key, { busy: undefined, error: outcome.reason });
          return;
        }
        if (outcome.kind === 'needsDecision') {
          patchState(group.key, { busy: undefined, similar: outcome.similar });
          return;
        }
        const what =
          outcome.kind === 'created'
            ? `올렸어요 · ${outcome.placeName}`
            : `${outcome.placeName} 에 채웠어요${outcome.patchKeys.length ? ` (${outcome.patchKeys.join(', ')})` : ' — 채울 빈 칸은 없었어요'}`;
        // 거짓말을 하지 않는 자리다. DB 에는 들어갔지만 정적 사이트는 다시 빌드돼야 보인다(ADR-015).
        patchState(group.key, { busy: undefined, similar: undefined, done: `${what} · 사이트에는 다음 빌드에서 보여요` });
        removeLater(group.key);
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
        writingRef.current = false;
      }
    },
    [beginWrite, patchState, removeLater],
  );

  const reject = useCallback(
    async (group: TCandidateGroup, reason: TRejectReason, note: string) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite(group.key)) return;
      patchState(group.key, { busy: 'rejecting', error: undefined });
      try {
        await rejectGroup(client, group, reason, note);
        patchState(group.key, { busy: undefined, rejecting: false, done: `반려했어요 · ${reason}` });
        removeLater(group.key);
      } catch (error) {
        patchState(group.key, { busy: undefined, error: messageOf(error, '반려하지 못했어요.') });
      } finally {
        writingRef.current = false;
      }
    },
    [beginWrite, patchState, removeLater],
  );

  const saveRegion = useCallback(
    async (group: TCandidateGroup, regionRaw: string) => {
      const client = clientRef.current;
      if (!client) return;
      if (!beginWrite(group.key)) return;
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
        writingRef.current = false;
      }
    },
    [beginWrite, patchState],
  );

  const cards = useMemo(
    () =>
      groups.map((group) => {
        const preview = previewFor(group.lead.extracted);
        return { group, preview, flags: [...flagsFor(group), ...preview.flags] };
      }),
    [groups],
  );

  const activeFilter = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0];
  const filtered = cards.filter((card) => activeFilter.match(card.group));
  const pendingRows = groups.reduce((total, group) => total + group.rows.length, 0);

  // 구간을 바꾸면 '더 보기' 도 처음으로 — 효과가 아니라 여기서 함께 바꾼다(같은 사건의 두 결과다).
  const pickFilter = (next: TFilter) => {
    setFilter(next);
    setShown(PAGE_SIZE);
  };

  if (phase === 'checking') {
    return <p className="px-5 pt-10 text-sm text-tertiary">불러오는 중이에요</p>;
  }

  if (phase === 'signedOut') {
    return (
      <div>
        <PageHeader title="후보 검수" description="블로그에서 찾은 장소를 확인하고 올려요" />
        <AdminPageLogin onSignedIn={signedIn} notice={notice} />
      </div>
    );
  }

  if (phase === 'verifying' || phase === 'loading') {
    return (
      <div>
        <PageHeader title="후보 검수" description={phase === 'verifying' ? '운영자인지 확인하고 있어요' : '후보를 불러오고 있어요'} />
      </div>
    );
  }

  if (phase === 'notOperator') {
    return (
      <div>
        <PageHeader title="후보 검수" />
        <div className="px-4 pt-6 md:px-6">
          <p className="text-sm text-secondary">
            운영자 계정이 아니에요. 이 화면은 `operators` 에 등록된 계정만 쓸 수 있어요.
          </p>
          <Button color="secondary" size="lg" className="mt-4" onClick={signOut}>
            다른 계정으로 로그인
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div>
        <PageHeader title="후보 검수" />
        <div className="px-4 pt-6 md:px-6">
          <p className="text-sm text-error-primary">{fatal}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button color="primary" size="lg" onClick={() => session && void start(session)}>
              다시 시도
            </Button>
            <Button color="secondary" size="lg" onClick={signOut}>
              로그아웃
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const expiry = new Date(session.expiresAt * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="pb-8">
      <PageHeader
        title="후보 검수"
        description={`검수 대기 ${pendingRows}건 · 묶음 ${groups.length}`}
        actions={
          <Button color="secondary" size="sm" className="h-11" onClick={signOut}>
            로그아웃
          </Button>
        }
      />
      <div className="px-4 pt-1.5 text-xs text-tertiary md:px-6">
        <p>
          로그인 {session.email} · 만료 {expiry}
        </p>
        <p className="mt-0.5">올린 장소는 사이트가 다시 빌드된 뒤에 보여요(자동 빌드를 연결하기 전에는 Vercel 에서 Redeploy).</p>
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

      <div className="mt-4 flex flex-wrap gap-2 px-4 md:px-6" role="group" aria-label="구간 걸러 보기">
        {FILTERS.map((entry) => {
          const count = cards.filter((card) => entry.match(card.group)).length;
          const active = entry.key === filter;
          return (
            <Button
              key={entry.key}
              size="sm"
              color={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              className="h-11"
              onClick={() => pickFilter(entry.key)}
            >
              {entry.label} {count}
            </Button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            Icon={CheckDone01}
            title="검수할 후보가 없어요"
            description="터미널에서 pnpm data:analyze 로 새 글을 분석하면 여기 쌓여요."
          />
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-4 pt-6 text-sm text-tertiary md:px-6">이 조건에 맞는 묶음이 없어요.</p>
      ) : (
        <>
          <ul className="mt-4 space-y-3 px-4 md:px-6">
            {filtered.slice(0, shown).map(({ group, preview, flags }) => {
              const state = states[group.key] ?? {};
              return (
                <AdminPageGroupCard
                  key={group.key}
                  group={group}
                  preview={preview}
                  flags={flags}
                  state={state}
                  expanded={expanded === group.key}
                  onToggle={() => setExpanded((prev) => (prev === group.key ? null : group.key))}
                  onApprove={(choice) => void approve(group, choice)}
                  onStartReject={() => patchState(group.key, { rejecting: true, error: undefined })}
                  onCancelReject={() => patchState(group.key, { rejecting: false })}
                  onReject={(reason, note) => void reject(group, reason, note)}
                  onPickRegion={(regionRaw) => patchState(group.key, { regionDraft: regionRaw })}
                  onSaveRegion={(regionRaw) => void saveRegion(group, regionRaw)}
                />
              );
            })}
          </ul>

          {filtered.length > shown && (
            <div className="mt-4 px-4 md:px-6">
              <Button
                color="secondary"
                size="lg"
                className="w-full"
                onClick={() => setShown((prev) => prev + PAGE_SIZE)}
              >
                더 보기 ({filtered.length - shown}개 남음)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
