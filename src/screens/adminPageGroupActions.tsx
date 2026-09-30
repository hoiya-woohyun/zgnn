'use client';

import type { ReactNode } from 'react';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { Select } from '../components/base/select';
import { REGION_OPTIONS, type TCandidateGroup, type TRejectReason } from '../lib/adminCandidates';
import type { TLatestPlan } from '../lib/adminLatest';
import { lastNoteLine, noteLineText, PLACE_STATUS_COLOR, PLACE_STATUS_LABEL } from '../lib/adminPlaces';
import type { TAdminPageGroupState, TApproveChoice } from './adminPageGroupCard';
import { AdminPageRejectForm } from './adminPageRejectForm';

const BUSY_LABEL: Record<NonNullable<TAdminPageGroupState['busy']>, string> = {
  approving: '반영하고 있어요…',
  rejecting: '반려하고 있어요…',
  savingRegion: '저장하고 있어요…',
  savingEdit: '저장하고 있어요…',
};

/** 레일의 맨 위 — **누르면 무슨 일이 일어나는 상황인가.** 버튼보다 먼저 읽힌다. */
function Situation({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-primary">{title}</p>
      {children && <div className="mt-1 space-y-0.5 text-xs text-tertiary">{children}</div>}
    </div>
  );
}

/** 버튼 한 무리. 폭을 레일에 채워 세로로 쌓는다 — 좁은 레일에서 가로로 늘어놓으면 줄마다 접히는 자리가 달라진다. */
function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

/** 버튼 밑 한 줄 — 무엇이 되돌릴 수 없어지는지. 버튼 **바로 밑**이라야 누르기 전에 읽힌다. */
const Caption = ({ children }: { children: ReactNode }) => <p className="text-xs text-tertiary">{children}</p>;

/**
 * 펼친 줄의 **결정 레일** — 한 줄에서 누를 수 있는 것이 전부 여기 모인다(2026-09-30).
 *
 * 그 전에는 버튼이 근거(비교표·블로그 글) **밑**에 있어서, 줄을 펼칠 때마다 수백 px 을 내려가야 눌렀다. 게다가 갈래마다
 * 주 버튼 · 반려/고치기 줄 · 분홍 링크(`새 장소로`) · 최신본 상자가 세 줄 두 덩어리로 흩어졌고, 위험한 쪽(복제본을 만들 수 있는
 * `새 장소로`)이 주 버튼과 같은 분홍이었다(사용자 요청: 버튼이 잘 모여 있는지).
 *
 * 순서가 곧 위계다 — **상황 → 주 결정 → 최신본으로 저장 → 고치기·반려 → 빠져나가는 길.**
 * 빠져나가는 길(`새 장소로`)은 회색 링크로 맨 밑에 둔다. 짝을 버리는 선택이라 한 번 더 읽고 누르는 자리여야 한다.
 *
 * 넓은 화면(`lg`)에서는 근거 오른쪽에 붙어 **스크롤을 따라온다**(sticky) — 긴 근거를 읽는 동안 버튼이 화면 밖으로 나가지 않게.
 * 좁은 화면에서는 근거 **위**에 선다(카드가 `order` 로 정한다).
 *
 * 갈래 셋과 그 안의 가드는 옮기기 전과 한 글자도 다르지 않다 — 각 버튼이 싣는 `TApproveChoice` 가 곧 안전장치다.
 */
export function AdminPageGroupActions({
  group,
  state,
  regionOk,
  latest,
  latestAvailable,
  onApprove,
  onStartReject,
  onCancelReject,
  onReject,
  onPickRegion,
  onSaveRegion,
  onEdit,
}: {
  group: TCandidateGroup;
  state: TAdminPageGroupState;
  regionOk: boolean;
  /** 최신본으로 덮으면 바뀌는 칸. 없으면(짝 행을 못 찾음) 그 버튼을 안 그린다. */
  latest: TLatestPlan | null;
  /** 이 갈래에서 최신본으로 저장이 뜻이 있나 — 카드가 정해 근거 쪽 전·후 목록과 같은 조건을 쓴다. */
  latestAvailable: boolean;
  onApprove: (choice?: TApproveChoice) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onReject: (reason: TRejectReason, note: string) => void;
  onPickRegion: (regionRaw: string) => void;
  onSaveRegion: (regionRaw: string) => void;
  onEdit: () => void;
}) {
  const busy = state.busy;
  const matched = group.lead.places;
  const pairId = group.lead.match_place_id;
  const matchedArchived = matched?.status === 'archived';
  const matchedDraft = matched?.status === 'draft';
  const similarArchived = state.similar?.status === 'archived';

  // 반려 폼은 레일 **안에서** 열린다 — 누른 자리에서 이어서 고르고, 근거는 옆에 그대로 남는다.
  if (state.rejecting) {
    return <AdminPageRejectForm inline busy={busy === 'rejecting'} onCancel={onCancelReject} onSubmit={onReject} />;
  }

  const latestButton = (choice: TApproveChoice, caption: string) =>
    latestAvailable && latest ? (
      latest.changes.length ? (
        <>
          <Button color="secondary" size="sm" isDisabled={Boolean(busy)} isLoading={busy === 'approving'} onClick={() => onApprove(choice)}>
            최신본으로 저장하기 · {latest.changes.length}칸
          </Button>
          <Caption>{caption}</Caption>
        </>
      ) : (
        <Caption>새 분석이 지금 장소 값과 같아요 — 최신본으로 덮을 칸이 없어요.</Caption>
      )
    ) : null;

  const tools = (
    <div className="grid grid-cols-2 gap-1.5">
      {/*
        * '고치기' 는 **세 갈래 전부에** 선다. 닮은 정도 0.4~0.85 구간이 곧 "상호 검색이 동명의 다른 가게를 집었나" 를
        * 가리는 자리라, 거기서 고칠 길이 없으면 틀린 주소를 그대로 올리거나 쓸 만한 후보를 버린다.
        * 지역이 비어 승인이 막힌 줄에서도 연다 — 이름·주소가 틀려서 지역을 못 정한 경우가 있다.
        */}
      <Button color="secondary" size="sm" isDisabled={Boolean(busy)} onClick={onEdit}>
        고치기
      </Button>
      <Button color="secondary" size="sm" isDisabled={Boolean(busy)} onClick={onStartReject}>
        반려하기
      </Button>
    </div>
  );

  let body: ReactNode;
  if (state.archived) {
    /*
     * 짝지은 장소가 **내린 곳**이다. 이 갈래가 소프트 삭제의 방어선이고, 여기서 '새 장소로' 를
     * 권하지 않는 것이 요점이다 — 그러면 내린 가게의 복제본이 새 id 로 사이트에 다시 올라가
     * 내린 일 자체가 무효가 된다. 다시 열었으면 되살려 합치고, 폐업 그대로면 반려한다.
     */
    const note = noteLineText(lastNoteLine(state.archived.note));
    body = (
      <>
        <Situation title={<>내린 곳과 같은 가게예요 · {state.archived.placeName}</>}>
          {note && <p>{note}</p>}
          <p>다시 연 가게면 되살려 주세요. 아니면 반려해요.</p>
        </Situation>
        <Stack>
          <Button
            color="primary"
            size="sm"
            isDisabled={Boolean(busy)}
            isLoading={busy === 'approving'}
            /*
             * **짝 id 를 실어 보낸다.** 안 실으면 `decideTarget` 이 짝을 다시 계산하는데, 그 사이 다른 카드를
             * 승인했으면 패널이 말한 장소와 **다른 장소**로 합쳐진다 — 조용한 오병합이다.
             */
            onClick={() => onApprove({ mergeInto: state.archived?.placeId, restoreArchived: true })}
          >
            되살려서 합치기
          </Button>
          <Caption>게시로 되돌리고 빈 칸만 채워요.</Caption>
          {latestButton(
            { mergeInto: state.archived.placeId, restoreArchived: true, overwrite: true },
            '되살리면서 왼쪽 목록의 칸을 새 분석 값으로 바꿔요.',
          )}
        </Stack>
        {tools}
        {/*
          * 같은 이름의 **다른** 가게는 실제로 있다. 그 길을 막지 않고 맨 밑에 둔다 — 무엇을 버리는지(위의 이름·사유) 읽은 뒤에만
          * 닿는 자리다. `confirmedDifferent` 가 `approveGroup` 의 복제본 가드를 지나가게 하는 유일한 표식이다.
          */}
        <Escape
          busy={busy}
          label="정말 다른 가게예요 — 새 장소로"
          caption="같은 가게면 두 번 생겨요."
          onClick={() => onApprove({ asNew: true, confirmedDifferent: true })}
        />
      </>
    );
  } else if (state.similar) {
    /*
     * 0.4~0.85 구간. 코드가 정하면 어느 쪽이든 조용히 틀린다 — 합치면 오병합, 새로 만들면 이웃 가게의 중복이다.
     * 그래서 닮은 이유(reason)를 그대로 보여 주고 사람이 고른다. 여기서는 '새 장소로' 가 빠져나가는 길이 아니라
     * **동등한 두 선택 중 하나**라 주 무리에 선다.
     */
    const similar = state.similar;
    const archiveNote = similarArchived ? noteLineText(lastNoteLine(similar.archiveNote)) : null;
    body = (
      <>
        <Situation
          title={
            <>
              같은 가게일까요? · {similar.name}{' '}
              {similarArchived && (
                <Badge type="color" size="sm" color="warning">
                  내림
                </Badge>
              )}
            </>
          }
        >
          {/* 이름 없는 괄호 소수(0.62)를 "62% 확실" 로 읽는 오독을 없앤다. */}
          <p>
            닮은 정도 {Math.round(similar.confidence * 100)}% · {similar.reason}
          </p>
          {archiveNote && <p>{archiveNote}</p>}
          {similarArchived && <p>같은 가게면 되살려서 합쳐 주세요. 새 장소로 올리면 같은 가게가 두 번 생겨요.</p>}
        </Situation>
        <Stack>
          <Button
            color="primary"
            size="sm"
            isDisabled={Boolean(busy)}
            isLoading={busy === 'approving'}
            /* 내린 곳이면 합치기 전에 되살려야 한다 — 안 그러면 `approveGroup` 이 archived 가드에서 되돌려 보낸다. */
            onClick={() => onApprove({ mergeInto: similar.id, restoreArchived: similarArchived || undefined })}
          >
            {similarArchived ? '같은 곳이에요 — 되살려서 합치기' : '같은 곳이에요 — 여기에 합치기'}
          </Button>
          {latestButton(
            { mergeInto: similar.id, restoreArchived: similarArchived || undefined, overwrite: true },
            `${similar.name} 의 칸을 새 분석 값으로 바꿔요.`,
          )}
          <Button
            color="secondary"
            size="sm"
            isDisabled={Boolean(busy)}
            /* 이웃이 내린 곳이면 여기서 만드는 새 장소가 곧 복제본이라, '내림' 배지를 보고 누른 것을 확인으로 넘긴다. */
            onClick={() => onApprove({ asNew: true, confirmedDifferent: similarArchived || undefined })}
          >
            {similarArchived ? '정말 다른 가게예요 — 새 장소로' : '다른 곳이에요 — 새 장소로'}
          </Button>
        </Stack>
        {/* 애매한 것이 모이는 구간이라 목록글·홍보글이 그대로 여기 온다 — 반려 길이 없으면 새로고침해야 한다. */}
        {tools}
      </>
    );
  } else {
    body = (
      <>
        <Situation
          title={
            pairId ? (
              <>
                기존 장소에 합쳐요 ·{' '}
                {matched?.status === 'published' ? (
                  <a className="text-brand-secondary underline" href={`/place/${matched.id}/`}>
                    {matched.name}
                  </a>
                ) : (
                  (matched?.name ?? '짝지은 장소')
                )}{' '}
                {matched && matched.status !== 'published' && (
                  <Badge type="color" size="sm" color={PLACE_STATUS_COLOR[matched.status]}>
                    {PLACE_STATUS_LABEL[matched.status]}
                  </Badge>
                )}
              </>
            ) : group.tier === 'new' ? (
              '새 장소로 올라가요'
            ) : (
              '새 장소로 올라가요 · 짝을 비웠어요'
            )
          }
        >
          {/*
            * 병합 승인은 초안 대상을 **게시로 올린다**(`adminApply.ts`). '안 보여요' 만 적으면 그 줄과 승인 버튼이
            * 둘 다 "사이트는 안 바뀐다" 로 읽혀, 게시를 일으키는 버튼 앞에서 정반대를 말하게 된다.
            */}
          {matchedDraft && <p>아직 사이트에 없는 곳이에요 — 합치면 함께 게시돼요.</p>}
          {matchedArchived && <p>짝이 내린 곳이에요 — 누르면 되살릴지 물어봐요.</p>}
        </Situation>
        <Stack>
          {regionOk ? (
            <>
              <Button color="primary" size="sm" isDisabled={Boolean(busy)} isLoading={busy === 'approving'} onClick={() => onApprove()}>
                맞아요, 장소로 올리기
              </Button>
              {/*
                * 누르기 전에 무엇이 되돌릴 수 없어지는지 말한다. **갈래가 셋인 이유**는 `decideTarget` 이 셋이어서다:
                * 짝이 있으면 그리로 합치고, 짝이 없어도 `tier === 'new'` 면 **재대조**가 돌아 점수가 높으면 기존 장소로
                * 합쳐진다. 그 갈래를 "새로 생겨요" 로 뭉개면 운영자가 되돌리려고 합쳐 넣은 원래 장소를 내린다.
                */}
              <Caption>
                {pairId
                  ? matchedDraft
                    ? '빈 칸만 채우고 그 곳을 게시해요 · 되돌릴 수 없어요'
                    : '빈 칸만 채워요 · 합친 내용은 되돌릴 수 없어요'
                  : group.tier === 'new'
                    ? '같은 가게가 이미 있으면 거기 합쳐져요 · 결과는 누른 뒤에 알려 줘요'
                    : "되돌릴 땐 '올린 장소' 에서 내려요"}
              </Caption>
              {latestButton({ mergeInto: pairId, overwrite: true }, `${matched?.name ?? '기존 장소'} 의 칸을 새 분석 값으로 바꿔요.`)}
            </>
          ) : (
            /*
             * 지역이 없으면 반영을 막는다 — 읍·면 칩이 비고 상세 헤더가 '기타' 가 되기 때문이다.
             * 선택지는 기존 86곳이 쓰는 표기뿐이다(새 표기를 만들면 그 장소 혼자 다른 칩을 단다).
             */
            <div className="rounded-lg bg-secondary px-3 py-2">
              <p className="text-xs text-secondary">지역이 없어 아직 올릴 수 없어요. 하나 골라 주세요.</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <Select
                  aria-label="지역 고르기"
                  size="sm"
                  placeholder="지역 고르기"
                  selectedKey={state.regionDraft ?? null}
                  onSelectionChange={(key) => key && onPickRegion(String(key))}
                  isDisabled={Boolean(busy)}
                >
                  {REGION_OPTIONS.map((option) => (
                    <Select.Item key={option} id={option}>
                      {option}
                    </Select.Item>
                  ))}
                </Select>
                <Button
                  color="primary"
                  size="sm"
                  isDisabled={Boolean(busy) || !state.regionDraft}
                  isLoading={busy === 'savingRegion'}
                  onClick={() => state.regionDraft && onSaveRegion(state.regionDraft)}
                >
                  지역 저장
                </Button>
              </div>
            </div>
          )}
        </Stack>
        {tools}
        {/*
          * 짝이 잘못 붙은 경우 — 사람이 짝을 비우는 대신 여기서 신규로 보낸다.
          * **짝이 내린 곳이면 감춘다**: 그 경우 이 버튼은 내린 가게의 복제본을 새 id 로 게시하는 길이 되고,
          * 같은 일은 '내린 곳' 갈래의 '정말 다른 가게예요' 를 지나야 한다(무엇을 버리는지 보고 누른다).
          */}
        {group.tier !== 'new' && pairId && regionOk && !matchedArchived && (
          <Escape busy={busy} label="짝이 틀렸어요 — 새 장소로 올리기" caption="짝을 무시하고 새로 만들어요." onClick={() => onApprove({ asNew: true })} />
        )}
      </>
    );
  }

  return (
    // 좁은 화면에서 레일이 근거 위로 오면 한 줄을 다 먹는다 — 버튼이 화면 폭으로 늘어나 주 버튼과 나머지가 구별되지 않아 폭을 묶는다.
    <div className="max-w-md space-y-3">
      {body}
      {busy && <p className="text-xs text-tertiary">{BUSY_LABEL[busy]}</p>}
      {state.error && <p className="text-xs text-error-primary">{state.error}</p>}
    </div>
  );
}

/**
 * 빠져나가는 길 — 짝을 **버리는** 선택. 회색 링크로 선 아래 맨 밑에 둔다. 분홍 링크이던 동안 주 버튼과 같은 색이라
 * 한 레일에서 가장 위험한 버튼이 가장 눈에 띄었다.
 */
function Escape({ busy, label, caption, onClick }: { busy: TAdminPageGroupState['busy']; label: string; caption: string; onClick: () => void }) {
  return (
    <div className="border-t border-secondary pt-2">
      <Button color="link-gray" size="sm" isDisabled={Boolean(busy)} onClick={onClick}>
        {label}
      </Button>
      <Caption>{caption}</Caption>
    </div>
  );
}
