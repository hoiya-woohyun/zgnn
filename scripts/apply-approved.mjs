// 사람이 Studio 에서 승인한 후보(candidates.status='approved')를 places 에 반영한다(`pnpm data:apply`).
// 병합 규칙(빈 칸만 채움 · 신규는 draft)은 scripts/analyze/applyApproved.mjs 의 순수 함수에 있고 여기는 I/O 만.
// docs/todo/03-analyze-and-review.md 가 정본.
//
// 한 후보당 순서: places 반영(update 또는 insert) → place_sources 링크 → 후보를 merged 로. PostgREST 에는 트랜잭션이
// 없어 중간에 죽으면 후보는 approved 로 남고 다음 실행이 다시 시도한다. 신규 insert 직후 후보에 match_place_id 를
// 먼저 적어 두는 이유가 그것이다 — 그 뒤 단계에서 죽으면 재실행은 "보강" 경로로 가서 같은 가게를 두 번 만들지 않는다.
// (insert 와 그 write-back 사이에서 죽는 창은 남는다 — 그때는 장소가 고아로 남고 재실행이 하나 더 만든다. Studio 에서 정리.)
// 한 건이 실패해도 다음 건은 계속하고, 실패 수가 exit code 가 된다(Actions 로그가 곧 관측).
//
// 분석 때 '신규'(tier new) 였던 후보만 insert 전에 현재 places(archived 제외, 이 실행이 방금 만든 draft 포함)와 **다시 대조**한다 —
// 같은 새 가게가 글 둘에서 따로 승인되면 분석 시점엔 서로 몰라 둘 다 '신규' 인데, 여기서 두 번째를 첫 번째로 합친다(toRecheckCandidate).
// tier 가 auto/ask 인데 match_place_id 가 비어 있으면 **사람이 비운 것**이다 — 재대조로 되살리지 않고 신규로 존중한다(리뷰 지적).
// archived 장소로는 병합하지 않는다 — 폐업한 곳에 후보가 조용히 merged 로 사라진다(리뷰 지적). 실패로 남겨 사람이 본다.
// ask 후보를 사람이 "신규가 맞다" 고 판단했다면 Studio 에서 match_place_id 를 **비운 뒤** approved 로 — 이 스크립트는 match_place_id 가
// 있으면 그것을 믿는다(docs/todo/03 의 승인 절차).
//
// `--dry-run`: DB 에 아무것도 쓰지 않고 무엇을 할지 한 줄씩만 찍는다. 읽기는 한다(patch 를 계산하려면 기존 행이 필요).
// 로그에 시크릿·응답 본문·헤더를 남기지 않는다 — 후보 id · 장소 id/이름 · 채울 컬럼명 · error.message 만(docs/todo/05).
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mergeIntoExisting, toNewPlaceRow, toRecheckCandidate } from './analyze/applyApproved.mjs';
import { matchPlace, THRESHOLD } from './analyze/matchPlace.mjs';
import { fromPlaceRow } from './lib/placeFields.mjs';

const dryRun = process.argv.includes('--dry-run');
console.log(dryRun ? '모드: dry-run — DB 에 쓰지 않는다' : '모드: 반영 — places · place_sources · candidates 에 쓴다');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. .env.local 을 확인하세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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

// 신규 후보 재대조용 현재 장소 목록(archived 제외). 이 실행이 draft 를 만들면 여기에도 넣어 다음 후보가 그것과 대조되게 한다.
const { data: placeRows, error: placesError } = await supabase.from('places').select('*').neq('status', 'archived');
if (placesError) throw new Error(`places 조회 실패: ${placesError.message}`);
const existing = placeRows.map(fromPlaceRow);
const rowById = new Map(placeRows.map((row) => [row.id, row]));

let merged = 0;
let created = 0;
let failed = 0;

for (const candidate of candidates) {
  console.log(`후보 ${candidate.id} (${candidate.extracted?.name ?? '이름 없음'})`);
  try {
    let placeId;
    let kind;

    // 분석 때 신규였던 후보라도 현재 places 에 같은 가게가 이미 있으면(다른 글이 먼저 승인돼 draft 가 됐거나, 사람이 손으로 넣었거나) 보강으로 돌린다.
    let targetId = candidate.match_place_id;
    if (!targetId && candidate.extracted?.match?.tier === 'new') {
      const rechecked = matchPlace(toRecheckCandidate(candidate), existing);
      if (rechecked.match && rechecked.confidence >= THRESHOLD.AUTO_MERGE) {
        console.log(`  신규 후보지만 이미 있는 장소와 일치 → 보강으로: ${rechecked.match.name} (${rechecked.confidence.toFixed(2)}, ${rechecked.reason})`);
        targetId = rechecked.match.id;
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
      if (target.status === 'archived') throw new Error(`${target.name}(${target.id}) 은 archived — 폐업한 곳에는 병합하지 않는다. Studio 에서 확인`);

      const patch = mergeIntoExisting(target, candidate.extracted);
      if (patch) {
        await write(`보강 ${target.name}(${target.id}) ← ${Object.keys(patch).join(', ')}`, () =>
          supabase.from('places').update(patch).eq('id', target.id),
        );
        Object.assign(target, patch);
        // 대조 장부(existing)도 같이 갱신 — 방금 채운 좌표를 다음 후보의 재대조가 봐야 한다(안 그러면 9km 밖 동명 가게와 합쳐진다, 리뷰 지적).
        const idx = existing.findIndex((place) => place.id === target.id);
        if (idx >= 0) existing[idx] = fromPlaceRow(target);
      } else {
        console.log(`  보강 ${target.name}(${target.id}) — 채울 빈 칸 없음, update 생략`);
      }
      placeId = target.id;
      kind = 'merged';
    } else {
      const row = toNewPlaceRow(candidate, { id: randomUUID() });
      await write(`신규 ${row.name}(${row.id}) draft 로 insert`, () => supabase.from('places').insert(row));
      // 같은 실행의 다음 후보가 이 draft 와 대조되게 목록에도 넣는다(dry-run 도 같은 경로 — 무엇이 합쳐질지 미리 보인다).
      existing.push(fromPlaceRow(row));
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

    // status 만 바꾼다. reviewed_at 은 사람이 승인한 시각이라 그대로 둔다.
    await write(`후보 ${candidate.id} → merged`, () => supabase.from('candidates').update({ status: 'merged' }).eq('id', candidate.id));

    // 끝까지 간 뒤에만 센다 — 중간에 실패한 후보는 "실패" 한 건이지 "보강" 한 건이 아니다.
    if (kind === 'merged') merged += 1;
    else created += 1;
  } catch (e) {
    failed += 1;
    console.error(`  실패: ${e.message}`);
  }
}

const prefix = dryRun ? '[dry-run] ' : '';
console.log(`${prefix}반영 ${merged + created}건 (보강 ${merged} · 신규 ${created} · 실패 ${failed})`);
// process.exit() 은 파이프로 나가던 stdout 을 잘라먹을 수 있다 — 요약 한 줄이 Actions 의 유일한 관측이라 자연 종료를 기다린다.
process.exitCode = Math.min(failed, 255);
