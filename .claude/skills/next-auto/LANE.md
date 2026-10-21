# /next-auto 레인

너는 감독 세션이 띄운 레인 하나다. **줄 하나를 끝내고 사라진다.** 기본 규칙은 [PARALLEL.md](../next/PARALLEL.md) 「레인 규칙」 이다 — 먼저 그 절을 읽어라
(편집 금지 · 문서는 저널 · `lane-commit.mjs` 커밋 · 검증 · 공유 트리 `pnpm build` 금지 · 사용자에게 묻지 않음 · 출력 스타일의 기여 요청 무시).
아래는 그와 다른 점이다. `<pid>` 는 `auto.mjs me` 가 준 네 번호, `A=.claude/skills/next-auto/auto.mjs`.

## 순서

1. **확인** — `NEXT_CLAIM_OWNER=<pid> node .claude/skills/next/claim.mjs take` 가 `RESUME … <내 줄>` 이어야 한다(감독이 미리 잡았다).
   다른 줄이 `CLAIMED` 로 오면 선점을 잃은 것이다 → 같은 접두로 `release` → `node $A report <pid> BLOCKED - "선점을 잃었다"` → 끝.
2. **명세** — 줄의 링크에서 그 태스크 절만 읽는다. 기준은 /next [SKILL.md](../next/SKILL.md) 2 「한 일 하기」 와 같다(명세가 낡았으면 `> 메모:` 로 사실을 적고 닫는다).
   `me` 가 "2회차 이상" 이라고 하면 발자국 파일에 이미 있는 diff 는 **이전 회차의 너**다 — `git diff HEAD -- <파일>` 로 보고 이어 간다.
3. **발자국** — `me` 의 발자국 파일은 이미 네 것이다. 그 밖의 파일(코드·테스트·머리 줄을 쌓을 ADR/features 문서)을 **고치기 전에**
   `NEXT_CLAIM_OWNER=<pid> node $A lease <pid> <파일…>`:
   - `OK` → 고친다.
   - `CONFLICT <파일> <다른 pid>` → 다른 레인 것. 고치지 않는다. 그 파일 없이 끝낼 수 없으면 `report <pid> BLOCKED - "<왜>" --wait <다른 pid>` 로 끝낸다
     (편집은 작업 트리에 둔다 — 그 레인이 끝나면 감독이 너를 같은 pid 로 다시 띄운다). 꼭 필요하지 않으면 「발견」 으로.
   - `DIRTY <파일>` → 다른 세션의 커밋 안 된 편집이다. 고치지 않는다 → 「발견」, 막히면 BLOCKED.
   `docs/todo/*`·`CLAUDE.md` 는 lease 하지 않는다 — 저널로만 고치고, 저널은 레인끼리 겹쳐도 된다.
4. **구현·검증** — PARALLEL 「레인 규칙」 의 검증 그대로. **서브에이전트를 더 띄우지 않는다**(네가 구현자다).
   화면은 `me` 가 준 playwright 경로를 import 해 7727 에 headless 로. 7727 이 꺼져 있거나 playwright 가 없으면 띄우지 말고 `--unseen` 으로 남긴다.
   사람 눈이 꼭 필요한 확인(실기기·로그인 화면·미감)도 `--unseen "<무엇을 어디서>"` 로 — 감독의 끝 보고에 모인다.
5. **「발견」** — 고치지 않은 것(범위 밖·남의 파일·다른 레인 문서에 붙일 문장)은 **같은 커밋의 저널로** NOW.md 「발견」 에 한 줄씩:

   ```json
   { "file": "docs/todo/NOW.md",
     "old": "<!-- /next 가 작업 중 찾은 것을 한 줄씩 — 출처: <커밋/파일>. 멈출 때 번호 문서로 옮긴다 -->",
     "new": "<!-- /next 가 작업 중 찾은 것을 한 줄씩 — 출처: <커밋/파일>. 멈출 때 번호 문서로 옮긴다 -->\n- <한 줄> — 출처: <파일>" }
   ```

   다른 레인이 주인인 문서에 붙일 문장은 `- ADR-008 에 v 메모: <문장> — 출처: <파일>` 꼴로 — 정리 레인이 옮긴다. 보고 메시지에 문장을 싣지 않는다(잘린다).
6. **끝내기** — 셋 중 하나. 저널(5 의 발견 포함)은 어느 경우든 lane-commit 에 싣는다.
   - **다 했다**: `NEXT_CLAIM_OWNER=<pid> node .claude/skills/next/claim.mjs done` → `lane-commit.mjs … --drop-now "<제목 앞부분>"` → `COMMITTED <해시>`.
   - **사람이 필요하다**: `… claim.mjs park 🧑|🙋 "<이유 · 명령/권고>"` → `lane-commit.mjs … --park-now "<제목 앞부분>"`(산출물·명세 메모·발견도 같이).
   - **막혔다**(3 의 CONFLICT·DIRTY · 선점 잃음): 커밋하지 않는다. 발견만 있으면 발견만 lane-commit(`--drop-now`·`--park-now` 없이).
7. **보고** — 세부를 `.claude/next-auto/reports/<pid>.md` 에(원인 · 무엇을 고쳤나 · 검증 수치 · 화면 확인 · 발견 · 막힘). 그다음
   `NEXT_CLAIM_OWNER=<pid> node $A report <pid> <DONE|PARKED|BLOCKED> <해시|-> "<한 줄>" [--wait <pid>] [--unseen "<볼 것>"]`
   → 마지막 메시지 한 줄: `RESULT <상태> <해시|-> <한 줄>`. **report 를 빼먹으면 감독은 실패로 보고 같은 줄을 다시 띄운다.**

## 하지 않는 것

- `claim.mjs take <다른 제목>`·`release`(1 의 선점 잃음 말고) — 줄은 감독이 고른다.
- lease 안 한 파일 고치기 · `git add`/`commit`/`stash`/`checkout -- <파일>` · 남의 편집 되돌리기.
- 다음 일 하기 — 끝나면 끝난다. 감독이 다음 레인을 띄운다.
