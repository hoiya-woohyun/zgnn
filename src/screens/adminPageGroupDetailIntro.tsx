'use client';

import { Badge } from '../components/base/badges';
import type { TCandidateGroup } from '../lib/adminCandidates';
import { introPostLinks, type TGroupIntroView } from '../lib/adminGroupIntro';

/** 출처 글 이름표 몇 개 — 제목 링크, 넘치면 "외 N편". */
function PostLinks({ group, posts }: { group: TCandidateGroup; posts: readonly string[] }) {
  if (!posts.length) return null;
  const { links, rest } = introPostLinks(group, posts);
  return (
    <span className="block text-tertiary">
      출처{' '}
      {links.map((link, index) => (
        <span key={link.url}>
          {index > 0 && ' · '}
          <a className="text-brand-secondary underline" href={link.url} target="_blank" rel="noopener noreferrer">
            {link.title}
          </a>
        </span>
      ))}
      {rest > 0 && ` 외 ${rest}편`}
    </span>
  );
}

/** 대체값이 왜 대표(또는 다녀온 글 하나)의 요약인지 — 종합 상태(`synth`)를 한 줄로. 종합 대상이 아니면 아무 말도 안 한다. */
function fallbackNote(intro: TGroupIntroView): string | null {
  const whose = intro.source === 'summary' ? '다녀온 글의 요약' : '대표 글의 요약';
  if (intro.synth === 'waiting') return `아직 묶음 종합 전이라 ${whose}이에요.`;
  if (intro.synth === 'rejected') return `묶음 종합이 규칙에 걸려(${intro.synthReasons.slice(0, 2).join(' · ') || '이유 없음'}) ${whose}이에요.`;
  return null;
}

/**
 * 펼친 줄의 '소개' 칸 — 등록하면 사이트에 나갈 소개와 **문장마다 그 출처 글**(13 §5.3 A3). 무엇을 쓸지는 `chooseGroupIntro` 가 정했고 여기는 그린다.
 *  - 종합: 문장마다 출처 글 이름표.
 *  - 충돌: 소개 없음 + 글별 요약(같은 요약은 하나로, 편수와 출처) — 운영자는 제외·재분석으로 가른다.
 *  - 규칙에 걸림: 소개 없이 등록된다는 말 + 걸린 글(취소선)과 이유.
 */
export function AdminPageGroupDetailIntro({ group, intro }: { group: TCandidateGroup; intro: TGroupIntroView }) {
  if (intro.source === 'conflict' && intro.conflict) {
    return (
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-center gap-1.5 text-secondary">
          <Badge type="color" size="sm" color="warning">
            요약이 갈려요
          </Badge>
          {intro.conflict.reason}
        </p>
        <p className="text-tertiary">합치지 않았어요 — 이대로 등록하면 소개 없이 올라가요. 글을 열어 보고 제외하거나 재분석으로 갈라 주세요.</p>
        <ul className="space-y-1.5">
          {intro.materials.map((material) => (
            <li key={material.text}>
              <span className="block whitespace-pre-line text-primary">
                {material.text}
                {material.posts.length > 1 && <span className="text-tertiary"> (글 {material.posts.length}편)</span>}
              </span>
              <PostLinks group={group} posts={material.posts} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (intro.dropped.length) {
    return (
      <div className="space-y-1">
        <p className="font-semibold text-warning-primary">소개 없이 등록돼요 — {intro.dropped.join(' · ')}</p>
        {intro.droppedText && <p className="whitespace-pre-line text-quaternary line-through">{intro.droppedText}</p>}
        {fallbackNote(intro) && <p className="text-tertiary">{fallbackNote(intro)}</p>}
      </div>
    );
  }
  if (!intro.text) return <p className="text-tertiary">소개 문장이 없어요</p>;
  const note = fallbackNote(intro);
  return (
    <div className="space-y-1">
      {intro.source === 'synth' && <p className="text-tertiary">다녀온 글의 요약 {intro.materials.length}개를 묶음 하나로 종합했어요.</p>}
      {intro.sentences.length ? (
        intro.sentences.map((sentence) => (
          <p key={sentence.text} className="whitespace-pre-line text-secondary">
            {sentence.text}
            <PostLinks group={group} posts={sentence.posts} />
          </p>
        ))
      ) : (
        <p className="whitespace-pre-line text-secondary">{intro.text}</p>
      )}
      {note && <p className="text-tertiary">{note}</p>}
    </div>
  );
}
