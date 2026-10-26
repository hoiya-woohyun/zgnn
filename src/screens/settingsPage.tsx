'use client';

import { useState } from 'react';
import { Heart, MarkerPin02, Plus } from '@untitledui/icons';
import { showAppStatus, STATUS_UNDO_MS } from '../lib/appStatus';
import { AuthorAvatar } from '../components/authorAvatar';
import { ReportSheet } from '../components/reportSheet';
import { StickyMorphTitle } from '../components/layout/stickyMorphTitle';
import { Section } from '../components/layout/section';
import { dogWeightSummary } from '../lib/dogProfile';
import { suggestTraceText } from '../lib/placeReport';
import { carrierSummary } from '../lib/eligibility';
import { dogNamesAsWritten } from '../lib/korean';
import { META, SOURCE_LINE } from '../lib/places';
import { useAppStore, useDog, useSavedCount } from '../store/useAppStore';
import { GroupList, GroupListBand } from '../components/groupList';
import { GroupListRow } from '../components/groupListRow';

/**
 * 비우기 두 줄(12 U2.6) — 다음 여행 때 준비물 15개를 하나씩 풀거나 하트를 하나씩 끄지 않게.
 * 확인 창 대신 **되돌리기**다(셸 토스트, 프로필 삭제와 같은 어법) — 확인 창은 매번 한 번 더 누르게 하고, 실수는 되돌리기가 더 잘 막는다.
 * 지운 값은 이 클로저만 붙잡는다. 비울 것이 없으면 줄을 끈다.
 *
 * 두 줄은 그룹 리스트의 두 행이고(22 G2.0 · G2.0a — 카드도 면도 없이 크림 위 구분선), 글자는 경고색이다(14 W261010.7h — "지우는 줄인지 모르겠다").
 * 붙어 있어도 행 높이 52 에 구분선이 있어 옆 행을 잘못 누르지 않는다. 비울 것이 없으면 회색 + aria-disabled.
 */
function SettingsPageResetRows() {
  const checkedCount = useAppStore((state) => state.checkedItemIds.length);
  const savedCount = useSavedCount();
  const clearChecked = useAppStore((state) => state.clearChecked);
  const clearSaved = useAppStore((state) => state.clearSaved);

  const handleClearChecked = () => {
    const { checkedItemIds } = useAppStore.getState();
    clearChecked();
    showAppStatus('준비물 체크를 모두 풀었어요', {
      action: { label: '되돌리기', onPress: () => useAppStore.setState({ checkedItemIds }) },
      durationMs: STATUS_UNDO_MS,
    });
  };

  // `clearSaved` 는 날짜 묶음·순서까지 지운다 — 되돌리기도 그 넷을 함께 붙잡아야 날짜별 목록이 돌아온다.
  const handleClearSaved = () => {
    const { savedIds, savedNotes, tripDays, tripOrder } = useAppStore.getState();
    clearSaved();
    showAppStatus('저장한 곳을 비웠어요', {
      action: { label: '되돌리기', onPress: () => useAppStore.setState({ savedIds, savedNotes, tripDays, tripOrder }) },
      durationMs: STATUS_UNDO_MS,
    });
  };

  return (
    <GroupList title="다음 여행 준비">
      <GroupListRow
        title="준비물 체크 모두 풀기"
        value={`${checkedCount}개`}
        trail="none"
        tone="danger"
        inactive={checkedCount === 0}
        onPress={handleClearChecked}
      />
      <GroupListRow
        title="저장 비우기"
        value={`${savedCount}곳`}
        trail="none"
        tone="danger"
        inactive={savedCount === 0}
        onPress={handleClearSaved}
      />
    </GroupList>
  );
}

/**
 * 장소 알려 주기(14 W261010.29b) — 둘러보기 목록 맨 끝·0곳 화면에만 있던 입구를 여기에도 둔다. 긴 목록을 끝까지 내려야만
 * 보이는 입구는 알려 주고 싶은 사람이 못 찾는다(tremor-34) — 설정은 "앱에 무언가 하는 곳" 을 찾을 때 여는 자리다.
 * 시트는 둘러보기·홈 동네 카드와 같은 장소 제안(`suggest`)이다. 검색어가 없으니 미리 채울 글도 없다.
 * 보낸 뒤엔 둘째 줄이 "알려 주셨어요 — ‘…’" 로 바뀐다(14 W261019.16, haeun-18b — 그대로면 보냈는지 헷갈려 또 누른다).
 * 머리 없이 혼자 서던 줄을 '정보' 그룹의 한 행으로 넣었다(22 G2.0a) — 행 하나짜리 묶음이 띠 둘 사이에 떠 있지 않게.
 * 시트는 닫혀 있으면 그리지 않으므로(react-aria 오버레이) 그룹의 구분선 사이에 끼지 않는다.
 */
function SettingsPageSuggest() {
  const [open, setOpen] = useState(false);
  const [sentName, setSentName] = useState<string | null>(null);
  return (
    <>
        <GroupListRow
          icon={<MarkerPin02 size={20} />}
          title="장소 알려 주기"
          subtitle={sentName ? suggestTraceText(sentName) : '여기 없는 곳에서도 강아지와 함께했나요?'}
          trail="none"
          onPress={() => setOpen(true)}
          dataEv="settings.suggest"
        />
      <ReportSheet
        isOpen={open}
        onOpenChange={setOpen}
        title="여기도 강아지랑 갈 수 있어요"
        lead="가게 이름과 동네를 적어 주세요. 운영자가 찾아보고 확인되면 올릴게요."
        placeId={null}
        kinds={['suggest']}
        noteRequired
        notePlaceholder="예: 카페 바당, 애월읍"
        onSent={(row) => setSentName(row.note ?? '')}
      />
    </>
  );
}

/**
 * '우리 강아지' 행의 앞 그림 — 이름 첫 글자 원 32(22 G2.0a · B-17). 사람 실루엣 아이콘이 강아지 자리에 서 있었다.
 * 등록 전이면 같은 원에 + — 누르면 등록이라는 뜻. 글자는 14/600 하나(단계를 늘리지 않는다).
 */
function SettingsPageDogInitial({ name }: { name: string }) {
  const initial = [...name.trim()][0] ?? '';
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-tertiary text-sm font-semibold text-secondary">
      {initial || <Plus size={16} aria-hidden="true" />}
    </span>
  );
}

/**
 * 설정 탭. 강아지 프로필·저장한 곳·자료 출처처럼 "장소를 고르는 일" 이 아닌 것들을 한곳에 모은다.
 *
 * 저장한 곳이 탭에서 여기 안으로 들어온 이유: 탭 다섯 자리 중 하나를 목록 하나가 차지하기엔
 * 프로필(판정의 입력)이 더 자주 손봐야 하는 것이 됐다 — 마리별 이름이 생기면서 옛 프로필의
 * '둘째'·'셋째' 를 고칠 자리가 필요했다. 저장 개수는 홈 카드와 여기 행에서 계속 보인다.
 */
export function SettingsPage() {
  const dog = useDog();
  const savedCount = useSavedCount();

  return (
    <div>
      {/* 준비물과 같은 제목 줄 — 올라가다 상단에 붙어 헤더로 접힌다(StickyMorphTitle). 설정은 짧아 요약·진행 막대는 없다. */}
      <StickyMorphTitle title="설정" />

      {/* 면 없는 그룹 넷, 사이는 8px 띠(22 G2.0a · design-audit B-17). 띠는 화면 폭 전체라 그룹의 좌우 여백 밖에 둔다. */}
      <Section className="mt-2">
        <GroupList title="우리 강아지">
          {dog ? (
            // 제목은 이름만 서는 자리 — 적은 그대로('단풍'). 애칭('단풍이')은 문장 안에서 부를 때만(14 W261010.33h)
            <GroupListRow
              href="/dog"
              icon={<SettingsPageDogInitial name={dog.dogs[0]?.name ?? ''} />}
              title={dogNamesAsWritten(dog.dogs.map((d) => d.name))}
              subtitle={`${dogWeightSummary(dog)} · ${carrierSummary(dog.carrier)}`}
              value="수정"
            />
          ) : (
            <GroupListRow
              href="/dog"
              icon={<SettingsPageDogInitial name="" />}
              title="우리 강아지 등록하기"
              subtitle="등록하면 갈 수 있는 곳을 바로 보여드려요"
            />
          )}
        </GroupList>
      </Section>
      <GroupListBand className="mt-3" />

      <Section>
        {/* `/saved` 는 설정 밑의 화면이다(`parentRouteOf`). 홈 카드·지도에서도 열리고, 그때는 들어온 탭에 불이 들어온다(`ownerRootOf`). */}
        <GroupList title="내 여행">
          <GroupListRow href="/saved" icon={<Heart size={20} />} title="저장한 곳" value={`${savedCount}곳`} />
        </GroupList>
      </Section>
      <GroupListBand className="mt-3" />

      <Section>
        <SettingsPageResetRows />
      </Section>
      <GroupListBand className="mt-3" />

      <Section>
        <GroupList title="정보">
          <GroupListRow
            icon={<AuthorAvatar className="size-5" />}
            title={META.author}
            subtitle={SOURCE_LINE}
          />
          <SettingsPageSuggest />
          <GroupListRow externalHref={META.sourceUrl} title="원본 노션 보기" trail="external" />
        </GroupList>
        <p className="mt-3 pb-4 text-sm text-tertiary">방문 전 영업시간과 동반 조건을 한 번 더 확인해 주세요.</p>
      </Section>
    </div>
  );
}
