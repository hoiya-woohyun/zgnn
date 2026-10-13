// 묶음 소개 패스(docs/todo/13 §5.3 A2) — 분석 끝에 **어느 묶음을** 다시 만들고 **무엇을** 저장하나. DB 는 만지지 않는다: 후보 행·저장된 지문을 받고,
// 저장은 주입받은 `save`(analyze-candidates.mjs 가 `group_intros` upsert 를 넘긴다), Claude 는 주입받은 `run` 이다(synthesizeGroupIntro 와 같은 틀).
//
// 정한 것 —
//  - 자리는 대표 행의 `extracted` 가 아니라 표 `group_intros` 의 한 줄, 열쇠는 묶음 키(`groupCandidates` 의 key)다. 대표는 confidence 가 바뀌면
//    다른 행이 되지만 키는 대표와 무관하다. 대상은 신규 묶음(`name:` 키)뿐 — 기존 장소의 소개는 사람이 쓴 글이다(`isIntroGroup`).
//  - 다시 만드는 때는 재료의 지문(`materialsFingerprint`)이 저장된 것과 다를 때다. 재료가 둘 이상인 묶음만 부르고 저장한다 —
//    하나 이하면 Claude 를 안 부르는 묶음이라(그 요약 그대로 · 없음) 화면이 같은 함수(groupIntroMaterials.mjs)로 그 자리에서 낸다.
//  - 분석 끝(기본)에는 **이번 실행에 후보가 붙은 묶음** + **저장된 줄이 낡은 묶음**(제외·재분석으로 요약이 바뀐 것)만 부른다.
//    저장된 줄이 없는 옛 묶음(밀린 것)은 `--synth-only` 일 때만 — 표를 올린 뒤 첫 분석이 수백 번을 부르지 않게(2026-10-13 실측 신규 묶음 358).
//  - 부른 결과는 거부·충돌이어도 지문과 함께 저장한다 — 안 그러면 늘 거부되는 묶음을 실행마다 다시 부른다.
//    실패(한도·시간 초과·응답 형식·저장)는 저장하지 않고 이 실행 동안 패스를 내린다(제안 패스와 같다) — 다음 실행이 지문으로 다시 집는다.
//  - 서버 홉은 마감(`--deadline`) 안에서만 — 부르기 전마다 `canStartWithin`. 못 한 묶음 중 저장된 줄이 없는 '이번 실행' 묶음은 다음 실행에서 밀린 것이 된다.
import { groupCandidates } from './reviewCandidates.mjs';
import { canStartWithin } from './analyzeCandidates.mjs';
import { isQuotaExhausted } from './extractPlaces.mjs';
import { groupIntroInput, isIntroGroup, materialsFingerprint, synthesisMaterials } from './groupIntroMaterials.mjs';
import { synthesizeGroupIntro } from './synthesizeGroupIntro.mjs';

export const GROUP_INTROS_TABLE = 'group_intros';

/**
 * 종합 한 번의 추정(서버 홉 마감용) — Claude 1회, 입력은 본문이 아니라 요약 몇 줄이다. 실측 전 값이라 제안(`PROPOSE_ESTIMATE_MS` 60초)보다 짧게만 잡았다.
 * 첫 회 실행(13 §5.3 A3 의 🧑)의 `종합` 계량기 줄을 보고 고친다.
 */
export const SYNTH_ESTIMATE_MS = 40_000;

/**
 * 후보 행들 → 소개를 다는 묶음들(재료·지문까지). 묶는 것은 /admin 과 같은 `groupCandidates` 라 키가 화면과 같다.
 * @param {readonly object[]} rows  pending 후보(`post_url` · `match_place_id` · `extracted`)
 */
export function introGroupsOf(rows) {
  return groupCandidates(rows)
    .filter(isIntroGroup)
    .map((group) => {
      const input = groupIntroInput(group);
      const materials = synthesisMaterials(input.posts);
      return { key: group.key, ...input, materials, fingerprint: materialsFingerprint(materials), postUrls: group.posts };
    });
}

const WHY_RANK = { touched: 0, stale: 1, backlog: 2 };

/**
 * 부를 묶음 고르기. 순수. 앞자리일수록 먼저 부른다 — 이번 실행 묶음 → 낡은 줄 → 밀린 것, 같은 자리면 재료 많은 것(종합이 가장 많이 바꾸는 곳).
 * @param {ReturnType<typeof introGroupsOf>} groups
 * @param {ReadonlyMap<string, string>} stored  묶음 키 → 저장된 지문
 * @param {{ touchedUrls?: ReadonlySet<string>, backlog?: boolean }} [opts]  이번 실행에 후보가 붙은 글 주소 · 밀린 묶음까지(`--synth-only`)
 * @returns {{ targets: (ReturnType<typeof introGroupsOf>[number] & { why: 'touched' | 'stale' | 'backlog' })[], fresh: number, single: number, waiting: number }}
 *   fresh = 지문이 같아 그대로 · single = 재료 하나 이하(부르지 않는다) · waiting = 밀린 채 둔 것(기본 경로에서만)
 */
export function pickSynthTargets(groups, stored, { touchedUrls = new Set(), backlog = false } = {}) {
  const targets = [];
  let fresh = 0;
  let single = 0;
  let waiting = 0;
  for (const group of groups) {
    if (group.materials.length < 2) {
      single += 1;
      continue;
    }
    const have = stored.get(group.key);
    if (have === group.fingerprint) {
      fresh += 1;
      continue;
    }
    const why = group.postUrls.some((url) => touchedUrls.has(url)) ? 'touched' : have !== undefined ? 'stale' : backlog ? 'backlog' : null;
    if (!why) {
      waiting += 1;
      continue;
    }
    targets.push({ ...group, why });
  }
  targets.sort((a, b) => WHY_RANK[a.why] - WHY_RANK[b.why] || b.materials.length - a.materials.length || a.key.localeCompare(b.key));
  return { targets, fresh, single, waiting };
}

/**
 * 종합 결과 → `group_intros` 한 줄. 거부·충돌도 같은 모양이다(`intro` null) — 지문이 있어야 다음 실행이 다시 부르지 않는다.
 * @param {{ key: string, fingerprint: string }} group
 * @param {{ intro: string | null, sentences: object[], conflict: object | null, reasons: string[] }} result  `synthesizeGroupIntro` 의 결과
 * @param {{ model: string, promptVersion: string }} meta
 */
export function toGroupIntroRow(group, result, meta, now = new Date()) {
  return {
    group_key: group.key,
    fingerprint: group.fingerprint,
    intro: result.intro ?? null,
    sentences: result.sentences ?? [],
    conflict: result.conflict ?? null,
    reasons: result.reasons ?? [],
    model: meta.model,
    prompt_version: meta.promptVersion,
    updated_at: now.toISOString(),
  };
}

const outcomeLabel = (result) => (result.conflict ? '충돌' : result.intro ? `소개 ${result.sentences.length}문장` : `거부(${result.reasons.length})`);

/**
 * 고른 묶음을 차례로 — 부르기 전마다 상한(`limit`)·마감(`deadline`)을 보고, 실패 하나면 멈춘다. `dryRun` 이면 부르지 않고 센다.
 * 로그는 묶음 이름·요약 수·결과 종류만 — 소개·충돌 문장은 블로그에서 파생된 말이라 찍지 않는다(05).
 * @param {{
 *   targets: ReturnType<typeof pickSynthTargets>['targets'],
 *   run: (args: string[], input: string) => Promise<string>, meter?: { add: (usage: unknown) => void },
 *   save: (row: ReturnType<typeof toGroupIntroRow>) => Promise<void>, meta: { model: string, promptVersion: string },
 *   deadline?: number | null, limit?: number | null, dryRun?: boolean, tick?: () => Promise<void>, log?: (line: string) => void, now?: () => number,
 * }} opts
 * @returns {Promise<{ done: number, conflict: number, rejected: number, failed: number, left: number, rateLimited: Error | null }>}  left = 부르지 못하고 남긴 묶음
 */
export async function runSynthPass({ targets, run, meter, save, meta, deadline = null, limit = null, dryRun = false, tick, log = console.log, now = Date.now }) {
  const out = { done: 0, conflict: 0, rejected: 0, failed: 0, left: 0, rateLimited: null };
  if (dryRun) {
    out.left = targets.length;
    return out;
  }
  for (const [index, group] of targets.entries()) {
    const stop = limit != null && index >= limit ? `상한 ${limit}회` : !canStartWithin(now(), deadline, SYNTH_ESTIMATE_MS) ? '시간 예산' : null;
    if (stop) {
      out.left = targets.length - index;
      log(`  묶음 소개 ${stop} — 남은 ${out.left}묶음은 다음 실행이`);
      break;
    }
    await tick?.();
    try {
      const result = await synthesizeGroupIntro(run, group, meter);
      await save(toGroupIntroRow(group, result, meta));
      out.done += 1;
      if (result.conflict) out.conflict += 1;
      else if (!result.intro) out.rejected += 1;
      log(`  묶음 소개 ${group.name} — 요약 ${group.materials.length}개 → ${outcomeLabel(result)}`);
    } catch (e) {
      out.failed += 1;
      out.left = targets.length - index - 1;
      if (isQuotaExhausted(e)) out.rateLimited = e;
      log(`  묶음 소개 실패(${group.name}) — 이 실행 동안 패스를 내린다(남은 ${out.left}묶음은 다음 실행이): ${e.message}`);
      break;
    }
  }
  return out;
}
