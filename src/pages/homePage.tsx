import { Link, useNavigate } from 'react-router';
import { Heart, Map01 } from '@untitledui/icons';
import { HomeTypeCard } from './homeTypeCard';
import { Button } from '../components/base/button';
import { META, PLACE_TYPES, TYPE_META, countByType } from '../lib/places';
import { checklistProgress } from '../lib/checklist';
import { useAppStore, useSavedCount } from '../store/useAppStore';
import type { TSeasonFilter } from '../store/useAppStore';

const SEASON_CHIPS: { label: string; value: TSeasonFilter }[] = [
  { label: '사계절', value: null },
  { label: '여름', value: '여름' },
  { label: '겨울', value: '겨울' },
];

function PawMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9 text-white" aria-hidden="true">
      <ellipse cx="14.5" cy="15.5" rx="5" ry="6.4" fill="currentColor" />
      <ellipse cx="25.5" cy="11.5" rx="5" ry="6.8" fill="currentColor" />
      <ellipse cx="36" cy="16.5" rx="4.8" ry="6.2" fill="currentColor" />
      <path
        d="M25 24.5c6.4 0 11.4 4.4 11.4 9.4 0 4.2-3.4 6.6-7.6 6.6-2.2 0-3 -.9-5.1-.9-2.1 0-2.9.9-5.1.9-4.2 0-7.6-2.4-7.6-6.6 0-5 5.6-9.4 14-9.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const savedCount = useSavedCount();
  const season = useAppStore((state) => state.season);
  const setSeason = useAppStore((state) => state.setSeason);
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  // 준비물 화면과 같은 계절 기준으로 센다. 두 화면이 다른 숫자를 보여주면 안 된다.
  const progress = checklistProgress(season, checkedItemIds);

  const startChecklist = (value: TSeasonFilter) => {
    setSeason(value);
    navigate('/checklist');
  };

  return (
    <div>
      {/* 히어로는 AppShell 의 중앙 정렬 폭을 넘어 화면 끝까지 깔리는 유일한 구역이라
          여기만 px-4 md:px-6, 그 아래부터는 계약서가 정한 좌우 패딩을 그대로 쓴다. */}
      <header
        className="basalt px-4 pb-16 text-white md:px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)' }}
      >
        <PawMark />
        <h1 className="mt-3 text-display-sm font-bold">강아지랑 제주</h1>
        <p className="mt-1.5 text-sm text-white/65">짱구누나의 반려견 동반 제주 가이드</p>

        <dl className="mt-7 flex overflow-hidden rounded-2xl border border-white/12 bg-white/6">
          {PLACE_TYPES.map((type, index) => (
            <div key={type} className={`flex-1 px-3 py-2.5 ${index > 0 ? 'border-l border-white/12' : ''}`}>
              <dt className="text-xs text-white/55">{TYPE_META[type].label}</dt>
              <dd className="text-lg font-bold text-white">
                {countByType[type]}
                <span className="text-sm font-normal text-white/55">곳</span>
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="px-4 md:px-6">
        <section className="-mt-10 rounded-2xl border border-secondary bg-primary p-5 shadow-lg">
          <p className="whitespace-pre-line text-sm text-secondary">{META.intro}</p>
          <p className="mt-3 text-right text-sm font-semibold text-brand-secondary">{META.author}</p>
        </section>
      </div>

      <section className="mt-8 px-4 md:px-6">
        <h2 className="text-lg font-bold text-primary">어디로 갈까요</h2>
        <div className="mt-3 space-y-3">
          {PLACE_TYPES.map((type) => (
            <HomeTypeCard key={type} type={type} />
          ))}
        </div>

        <Button color="primary" size="lg" iconLeading={Map01} href="/map" className="mt-3 w-full">
          지도로 보기
        </Button>
      </section>

      <section className="mt-8 px-4 md:px-6">
        <h2 className="text-lg font-bold text-primary">여행 준비물</h2>
        <div className="mt-3 rounded-2xl border border-secondary bg-primary p-4">
          <p className="text-sm text-tertiary">{META.itemsIntro.split('\n')[0]}</p>

          {/* 계절칩은 필터가 아니라 '고르면 바로 준비물로 이동'하는 진입점이다.
              그래도 지금 스토어에 저장된 계절은 보여줘야 해서 토글형 버튼 + aria-pressed 로 만든다. */}
          <div className="mt-3 flex gap-2" role="group" aria-label="계절 선택">
            {SEASON_CHIPS.map((chip) => {
              const active = season === chip.value;
              return (
                <Button
                  key={chip.label}
                  type="button"
                  size="sm"
                  color={active ? 'primary' : 'secondary'}
                  aria-pressed={active}
                  onClick={() => startChecklist(chip.value)}
                >
                  {chip.label}
                </Button>
              );
            })}
          </div>

          <Link
            to="/checklist"
            className="mt-4 flex h-12 items-center justify-between rounded-lg bg-secondary px-4 text-sm font-semibold text-primary transition-colors hover:bg-tertiary"
          >
            준비물 {progress.total}가지 확인하기
            <span className="text-sm font-semibold text-tertiary">{progress.checked}개 챙김</span>
          </Link>
        </div>
      </section>

      <section className="mt-8 px-4 md:px-6">
        <Link
          to="/saved"
          className="flex items-center gap-3 rounded-2xl border border-secondary bg-primary px-4 py-4 transition-colors hover:bg-secondary"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-camellia-wash text-camellia"
          >
            <Heart size={20} className="fill-camellia" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-primary">저장한 곳 {savedCount}</p>
            <p className="text-sm text-tertiary">
              {savedCount > 0 ? '지도에서 한 번에 볼 수 있어요' : '마음에 드는 곳의 하트를 눌러보세요'}
            </p>
          </div>
        </Link>
      </section>

      <footer className="mt-10 px-4 pb-8 text-sm text-quaternary md:px-6">
        <p>
          모든 정보는 {META.author}님이 정리한 자료입니다.{' '}
          <a
            href={META.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-secondary underline underline-offset-2"
          >
            원본 노션 보기
          </a>
        </p>
        <p className="mt-2">방문 전 영업시간과 동반 조건을 한 번 더 확인해 주세요.</p>
      </footer>
    </div>
  );
}
