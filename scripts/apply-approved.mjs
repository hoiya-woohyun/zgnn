// 사람이 Studio 에서 승인한 후보(candidates.status='approved')를 places 에 반영한다(`pnpm data:apply`).
// 병합 규칙(빈 칸만 채움 · 신규는 draft)은 scripts/analyze/applyApproved.mjs 의 순수 함수에 있고 여기는 I/O 만.
// docs/todo/03-analyze-and-review.md 가 정본.
//
// 한 후보당 순서: places 반영(update 또는 insert) → place_sources 링크 → 후보를 merged 로. PostgREST 에는 트랜잭션이
// 없어 중간에 죽으면 후보는 approved 로 남고 다음 실행이 다시 시도한다. 신규 insert 직후 후보에 match_place_id 를
// 먼저 적어 두는 이유가 그것이다 — 그 뒤 단계에서 죽으면 재실행은 "보강" 경로로 가서 같은 가게를 두 번 만들지 않는다.
// (insert 와 그 write-back 사이에서 죽는 창은 남는다 — 그때는 장소가 고아로 남고 재실행이 하나 더 만든다. Studio 에서 정리.)
// 한 건이 실패해도 다음 건은 계속하고, 실패 수가 exit code 가 된다(사용자 터미널의 로그가 곧 관측).
//
// 분석 때 '신규'(tier new) 였던 후보만 insert 전에 현재 places(상태 무관 — archived 도, 이 실행이 방금 만든 draft 도 포함)와 **다시 대조**한다 —
// 같은 새 가게가 글 둘에서 따로 승인되면 분석 시점엔 서로 몰라 둘 다 '신규' 인데, 여기서 두 번째를 첫 번째로 합친다(toRecheckCandidate).
// tier 가 auto/ask 인데 match_place_id 가 비어 있으면 **사람이 비운 것**이다 — 재대조로 되살리지 않고 신규로 존중한다(리뷰 지적).
// archived 장소로는 병합하지 않는다 — 내린 곳에 후보가 조용히 merged 로 사라진다(리뷰 지적). 영구 실패로 남겨 사람이 /admin 에서 정한다.
// ask 후보를 사람이 "신규가 맞다" 고 판단했다면 Studio 에서 match_place_id 를 **비운 뒤** approved 로 — 이 스크립트는 match_place_id 가
// 있으면 그것을 믿는다(docs/todo/03 의 승인 절차).
//
// `--dry-run`: DB 에 아무것도 쓰지 않고 무엇을 할지 한 줄씩만 찍는다. 읽기는 한다(patch 를 계산하려면 기존 행이 필요).
// 로그에 시크릿·응답 본문·헤더를 남기지 않는다 — 후보 id · 장소 id/이름 · 채울 컬럼명 · error.message 만(docs/todo/05).
import { randomUUID } from 'node:crypto';
import { mergeIntoExisting, toNewPlaceRow, toRecheckCandidate } from './analyze/applyApproved.mjs';
import { matchPlace, THRESHOLD } from './analyze/matchPlace.mjs';
import { toMatchablePlace } from './lib/placeFields.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

// 인자는 --dry-run 하나뿐. 모르는 인자(--dryrun 오타)로 실제 쓰기가 도는 일이 없게 거부한다(analyze 의 parseArgs 와 같은 원칙).
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== '--dry-run');
if (unknown.length > 0) {
  console.error(`알 수 없는 인자: ${unknown.join(' ')} — 사용법: pnpm data:apply [--dry-run]`);
  process.exit(1);
}
const dryRun = argv.includes('--dry-run');
console.log(dryRun ? '모드: dry-run — DB 에 쓰지 않는다' : '모드: 반영 — places · place_sources · candidates 에 쓴다');

const supabase = createSupabase();

// 쓰기는 전부 이 한 곳을 지난다 — dry-run 분기를 호출처마다 두면 하나를 빠뜨리는 순간 dry-run 이 DB 를 건드린다.
async function write(label, run) {
  if (dryRun) {
    console.log(`  [dry-run] ${label}`);
    return;
  }
  const { error } = await run();
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log(`  ${label}`);
}

// 지금 규모(주 수십 건)는 supabase-js 기본 1000행 제한에 한참 못 미친다 — 늘어나면 range() 로 페이지네이션.
const { data: candidates, error: candidatesError } = await supabase
  .from('candidates')
  .select('*')
  .eq('status', 'approved')
  .order('created_at', { ascending: true });
if (candidatesError) throw new Error(`candidates 조회 실패: ${candidatesError.message}`);

// 신규 후보 재대조용 현재 장소 목록. 이 실행이 draft 를 만들면 여기에도 넣어 다음 후보가 그것과 대조되게 한다.
// **archived 도 읽는다**(2026-09-29, analyze-candidates.mjs:130 과 같은 이유): 빼면 내린 곳을 쓴 후보가 재대조에서
// '신규' 가 돼 같은 가게가 새 id 로 되살아난다. 짝이 잡히면 아래 archived 가드(:108)가 permanent 로 멈춰 사람에게 넘긴다.
const { data: placeRows, error: placesError } = await supabase.from('places').select('*').order('id');
if (placesError) throw new Error(`places 조회 실패: ${placesError.message}`);
// 86곳이 있어야 정상이다. 비어 있으면 다른 프로젝트·잘못된 키다 — 그대로 가면 재대조가 무력화돼 신규가 전부 draft 로 들어간다(analyze 와 같은 가드).
if (placeRows.length === 0) {
  console.error('places 가 비어 있다 — link 된 프로젝트(supabase/.temp/project-ref)가 맞는지 확인. 아무것도 반영하지 않고 멈춘다.');
  process.exit(1);
}
const existing = placeRows.map(toMatchablePlace);
const rowById = new Map(placeRows.map((row) => [row.id, row]));

let merged = 0;
let created = 0;
let failed = 0;
let returned = 0; // 영구 실패 → pending 으로 되돌린 수
let publishedMerged = 0; // published 장소의 빈 칸을 채운 수 — 다음 pull 에서 사람 재확인 없이 화면에 나간다(설계 검토 RP-3). 따로 센다.

for (const candidate of candidates) {
  console.log(`후보 ${candidate.id} (${candidate.extracted?.name ?? '이름 없음'})`);
  try {
    let placeId;
    let kind;
    let patchKeys = [];

    // 분석 때 신규였던 후보라도 현재 places 에 같은 가게가 이미 있으면(다른 글이 먼저 승인돼 draft 가 됐거나, 사람이 손으로 넣었거나) 보강으로 돌린다.
    let targetId = candidate.match_place_id;
    if (!targetId && candidate.extracted?.match?.tier === 'new') {
      const rechecked = matchPlace(toRecheckCandidate(candidate), existing);
      if (rechecked.match && rechecked.confidence >= THRESHOLD.AUTO_MERGE) {
        console.log(`  신규 후보지만 이미 있는 장소와 일치 → 보강으로: ${rechecked.match.name} (${rechecked.confidence.toFixed(2)}, ${rechecked.reason})`);
        targetId = rechecked.match.id;
      } else if (rechecked.match && rechecked.confidence >= THRESHOLD.ASK) {
        // ask 구간은 코드가 정하지 않는다 — 신규로 넣으면 이웃 가게의 중복 draft 가 되고, 합치면 오병합이다(설계 검토 RP-7). pending 으로 되돌려 사람이 정한다.
        //
        // 닮은 그 곳이 **내린 곳이면 안내가 달라진다.** 평소 안내의 둘째 갈래("tier 를 'ask' 로 바꿔서 다시 승인")를
        // 그대로 따르면 `!targetId && tier === 'new'` 가 거짓이 돼 재대조가 건너뛰어지고, 내린 가게의 **복제본**이
        // draft 로 insert 된다 — 2026-09-29 에 corpus 가 archived 까지 읽게 되면서 생긴 갈래다(초안이라 사이트에는
        // 안 나가지만, '올린 장소' 에 초안 한 줄로 남아 사람이 그걸 또 게시할 수 있다). 그래서 그 말을 하지 않는다.
        const archivedMatch = rechecked.match.status === 'archived';
        throw Object.assign(
          new Error(
            `기존 ${rechecked.match.name}(${rechecked.match.id}) 과 ${rechecked.confidence.toFixed(2)} 로 닮았다(${rechecked.reason}) — ` +
              (archivedMatch
                ? "그 곳은 **내린 곳**이다. 다시 연 가게면 /admin 에서 '되살려서 합치기', 아니면 /admin 에서 반려한다(여기서 신규로 넣으면 복제본이 된다)"
                : "같은 곳이면 match_place_id 를 채워서, 다른 곳이면 extracted.match.tier 를 'ask' 로 바꿔서 다시 승인"),
          ),
          { permanent: true },
        );
      }
    }

    if (targetId) {
      let target = rowById.get(targetId);
      if (!target) {
        const { data, error } = await supabase.from('places').select('*').eq('id', targetId).maybeSingle();
        if (error) throw new Error(`places 조회 실패: ${error.message}`);
        target = data;
      }
      if (!target) throw new Error(`match_place_id ${targetId} 가 places 에 없다`);
      if (target.status === 'archived') {
        throw Object.assign(new Error(`${target.name}(${target.id}) 은 archived — 내린 곳에는 병합하지 않는다. 다시 연 가게면 /admin 에서 '되살려서 합치기'`), { permanent: true });
      }

      const patch = mergeIntoExisting(target, candidate.extracted, { postUrl: candidate.post_url });
      if (patch) {
        patchKeys = Object.keys(patch);
        const geoTag = patch.lat !== undefined && candidate.extracted?.geoSource ? ` [geo:${candidate.extracted.geoSource}]` : '';
        await write(`보강 ${target.name}(${target.id}${target.status === 'published' ? ' · published' : ''}) ← ${patchKeys.join(', ')}${geoTag}`, () =>
          supabase.from('places').update(patch).eq('id', target.id),
        );
        if (target.status === 'published') publishedMerged += 1;
        Object.assign(target, patch);
        // 대조 장부(existing)도 같이 갱신 — 방금 채운 좌표를 다음 후보의 재대조가 봐야 한다(안 그러면 9km 밖 동명 가게와 합쳐진다, 리뷰 지적).
        const idx = existing.findIndex((place) => place.id === target.id);
        if (idx >= 0) existing[idx] = toMatchablePlace(target);
      } else {
        console.log(`  보강 ${target.name}(${target.id}) — 채울 빈 칸 없음, update 생략`);
      }
      placeId = target.id;
      kind = 'merged';
    } else {
      const row = toNewPlaceRow(candidate, { id: randomUUID() });
      await write(`신규 ${row.name}(${row.id}) draft 로 insert`, () => supabase.from('places').insert(row));
      // 같은 실행의 다음 후보가 이 draft 와 대조되게 목록에도 넣는다(dry-run 도 같은 경로 — 무엇이 합쳐질지 미리 보인다).
      existing.push(toMatchablePlace(row));
      rowById.set(row.id, row);
      // insert 직후 후보에 새 id 를 묶어 둔다 — 아래 단계에서 죽어도 재실행이 두 번째 insert 를 하지 않게(파일 머리 주석).
      await write(`후보 ${candidate.id} ← match_place_id ${row.id}`, () =>
        supabase.from('candidates').update({ match_place_id: row.id }).eq('id', candidate.id),
      );
      placeId = row.id;
      kind = 'created';
    }

    // place_sources 는 (place_id, post_url) 복합 PK 라 둘 다 NOT NULL. 글 링크가 없는 후보는 출처를 못 남긴다 — 건너뛰고 말한다.
    if (candidate.post_url) {
      await write(`출처 place_sources (${placeId}, ${candidate.post_url})`, () =>
        supabase
          .from('place_sources')
          .upsert({ place_id: placeId, post_url: candidate.post_url }, { onConflict: 'place_id,post_url', ignoreDuplicates: true }),
      );
    } else {
      console.log(`  출처 없음 — post_url 이 비어 있어 place_sources 를 건너뜀`);
    }

    // status 와, 어느 장소의 어느 칸을 채웠는지(extracted.applied) — 되돌릴 때 그 칸을 null 로 하면 된다(빈 칸만 채웠으므로, 설계 검토 RP-4).
    // reviewed_at 은 사람이 승인한 시각이라 그대로 둔다(트리거가 approved·rejected 에만 찍는다).
    const applied = { placeId, kind, patchKeys, at: new Date().toISOString() };
    await write(`후보 ${candidate.id} → merged (applied: ${kind}${patchKeys.length ? ` ${patchKeys.join(',')}` : ''})`, () =>
      supabase.from('candidates').update({ status: 'merged', extracted: { ...(candidate.extracted ?? {}), applied } }).eq('id', candidate.id),
    );

    // 끝까지 간 뒤에만 센다 — 중간에 실패한 후보는 "실패" 한 건이지 "보강" 한 건이 아니다.
    if (kind === 'merged') merged += 1;
    else created += 1;
  } catch (e) {
    // 다음 실행에도 같을 실패(type other · 이름 없음 · archived 대상)는 approved 로 두면 매 실행 빨갛게 반복된다 — pending 으로 되돌리고
    // reviewer_note 에 사유를 덧붙여 사람이 Studio 에서 보게 한다. 일시 실패(DB 오류)만 failed 로 세어 exit code 에 반영.
    if (e?.permanent === true) {
      const note = `${candidate.reviewer_note ? `${candidate.reviewer_note}\n` : ''}[data:apply 반영 불가] ${e.message}`;
      try {
        await write(`후보 ${candidate.id} → pending (반영 불가: ${e.message})`, () =>
          supabase.from('candidates').update({ status: 'pending', reviewer_note: note }).eq('id', candidate.id),
        );
        returned += 1;
      } catch (writeError) {
        failed += 1;
        console.error(`  실패: ${e.message} (pending 되돌리기도 실패: ${writeError.message})`);
      }
      continue;
    }
    failed += 1;
    console.error(`  실패: ${e.message}`);
  }
}

// published 로 올라가길 기다리는 draft — 승인만 하고 잊으면 화면에 영영 안 뜬다(설계 검토 RP-2). 요약에 같이 찍는다.
const { count: draftCount } = await supabase.from('places').select('*', { count: 'exact', head: true }).eq('status', 'draft');
const prefix = dryRun ? '[dry-run] ' : '';
console.log(
  `${prefix}반영 ${merged + created}건 (보강 ${merged}${publishedMerged ? ` — published ${publishedMerged}` : ''} · 신규 ${created} · 실패 ${failed}${returned ? ` · pending 되돌림 ${returned}` : ''})` +
    ` · published 대기 draft ${draftCount ?? '?'}곳${(draftCount ?? 0) > 0 ? ' — Studio 에서 status 를 올려야 화면에 뜬다(pnpm data:review status)' : ''}`,
);
// process.exit() 은 파이프로 나가던 stdout 을 잘라먹을 수 있다 — 요약 한 줄이 사용자가 보는 유일한 관측이라 자연 종료를 기다린다.
process.exitCode = Math.min(failed, 255);
