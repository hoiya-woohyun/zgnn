'use client';

import Link from 'next/link';
import { ChevronRight, Heart, LinkExternal01 } from '@untitledui/icons';
import { showAppStatus } from '../lib/appStatus';
import { AuthorAvatar } from '../components/authorAvatar';
import { StickyMorphTitle } from '../components/layout/stickyMorphTitle';
import { Section } from '../components/layout/section';
import { maxWeightKg } from '../lib/dogProfile';
import { carrierSummary } from '../lib/eligibility';
import { dogCallNames } from '../lib/korean';
import { META, SOURCE_LINE } from '../lib/places';
import { useAppStore, useDog, useSavedCount } from '../store/useAppStore';

const CARD_CLASS =
  'flex items-center gap-3 rounded-2xl border border-secondary bg-primary px-4 py-4 transition-colors hover:bg-secondary';

const RESET_ROW_CLASS =
  'flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-primary transition-colors hover:bg-secondary disabled:cursor-default disabled:text-quaternary disabled:hover:bg-transparent';

/**
 * 비우기 두 줄(12 U2.6) — 다음 여행 때 준비물 15개를 하나씩 풀거나 하트를 하나씩 끄지 않게.
 * 확인 창 대신 **되돌리기**다(셸 토스트, 프로필 삭제와 같은 어법) — 확인 창은 매번 한 번 더 누르게 하고, 실수는 되돌리기가 더 잘 막는다.
 * 지운 값은 이 클로저만 붙잡는다. 비울 것이 없으면 줄을 끈다.
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
      durationMs: 6000,
    });
  };

  const handleClearSaved = () => {
    const { savedIds, savedNotes } = useAppStore.getState();
    clearSaved();
    showAppStatus('저장한 곳을 비웠어요', {
      action: { label: '되돌리기', onPress: () => useAppStore.setState({ savedIds, savedNotes }) },
      durationMs: 6000,
    });
  };

  return (
    <div className="divide-y divide-secondary overflow-hidden rounded-2xl border border-secondary bg-primary">
      <button type="button" className={RESET_ROW_CLASS} onClick={handleClearChecked} disabled={checkedCount === 0}>
        준비물 체크 모두 풀기
        <span className="font-normal text-tertiary">{checkedCount}개</span>
      </button>
      <button type="button" className={RESET_ROW_CLASS} onClick={handleClearSaved} disabled={savedCount === 0}>
        저장 비우기
        <span className="font-normal text-tertiary">{savedCount}곳</span>
      </button>
    </div>
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
      <p className="px-4 text-sm text-tertiary md:px-6">우리 강아지, 저장한 곳, 자료 출처</p>

      <Section title="우리 강아지" className="mt-6">
        {dog ? (
          <Link href="/dog" className={CARD_CLASS}>
            <div className="min-w-0 flex-1">
              <p className="text-md font-bold text-primary">{dogCallNames(dog.dogs.map((d) => d.name))}</p>
              <p className="mt-0.5 text-sm text-tertiary">
                {dog.dogs.length}마리 · 최대 {maxWeightKg(dog)}kg · {carrierSummary(dog.carrier)}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-secondary">
              수정
              <ChevronRight size={16} aria-hidden="true" />
            </span>
          </Link>
        ) : (
          <Link href="/dog" className={CARD_CLASS}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-primary">우리 강아지 등록하기</p>
              <p className="text-sm text-tertiary">등록하면 갈 수 있는 곳을 바로 보여드려요</p>
            </div>
            <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-quaternary" />
          </Link>
        )}
      </Section>

      <Section className="mt-4">
        {/* 보조 진입점이다 — `/saved` 는 홈 아래(주 진입점은 홈 카드, 홈 탭에 불이 들어온다. `navItems.ts`·`parentRouteOf`). */}
        <Link href="/saved" className={CARD_CLASS}>
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-camellia-wash text-camellia"
          >
            <Heart size={20} className="fill-camellia" />
          </span>
          <p className="min-w-0 flex-1 text-sm font-bold text-primary">저장한 곳</p>
          <span className="flex shrink-0 items-center gap-1 text-sm text-tertiary">
            {savedCount}곳
            <ChevronRight size={20} aria-hidden="true" className="text-quaternary" />
          </span>
        </Link>
      </Section>

      <Section title="다음 여행 준비" className="mt-8">
        <SettingsPageResetRows />
      </Section>

      <Section title="정보" className="mt-8">
        <div className="rounded-2xl border border-secondary bg-primary px-4 py-4">
          <div className="flex items-center gap-3">
            <AuthorAvatar className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-primary">{META.author}</p>
              <p className="text-sm text-tertiary">{SOURCE_LINE}</p>
            </div>
          </div>
          <a
            href={META.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-lg bg-secondary px-4 text-sm font-semibold text-brand-secondary transition-colors hover:bg-tertiary"
          >
            원본 노션 보기
            <LinkExternal01 size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="mt-3 px-1 text-sm text-tertiary">방문 전 영업시간과 동반 조건을 한 번 더 확인해 주세요.</p>
      </Section>
    </div>
  );
}
