# /next 병렬 — 레인 여럿을 한 작업 트리에서

> 최종 수정: 2026-10-21 (v2: 끝난 자리를 바로 채우며 계속 도는 감독은 [/next-auto](../next-auto/SKILL.md) — 이 문서는 한 번에 띄우고 거두는 모양으로 남는다. park 는 `lane-commit --park-now` 로 HEAD 에도 싣는다 — 전엔 작업 트리에만 남아 HEAD 는 그 줄을 「지금」 에 뒀다)
> 이전 2026-10-16 (v1: scratchpad 에서 회차마다 다시 만들던 레인 도구·규칙을 스킬로 옮겼다 — `lane-commit.mjs` 다섯 번째 복사 직전)

사용자가 "병렬로"·"N개 동시에" 라고 하면 이 문서대로 한다. 사람이 있을 때(이 세션의 서브에이전트 레인)의 모양이다.
무인(자는 동안)은 서브에이전트가 아니라 헤드리스 `claude -p` 레인이라 아래 「무인」 절만 다르다.

**레인 수는 요청한 수가 아니라 "파일이 안 겹치는 묶음" 의 수다.** 일이 그보다 많으면 한 레인에 차례로 싣는다.
같은 파일을 두 레인이 고치는 순간 저널·pathspec 이 서로를 되돌린다 — 수를 맞추려고 겹치게 나누지 않는다.

## 메인이 하는 일

1. **후보 고르기** — 「지금」 + 명세(번호 문서)의 `[ ]` 중 에이전트가 레포 안에서 끝낼 것. 빼는 것: 원격 쓰기·`db push`·마이그레이션이 드는 것,
   `claude -p` 대량 호출(eval extract 등)로만 확인되는 것, 권고가 "다음 평가에서 본다" 인 것, ADR 을 뒤집는 제품 방향(🙋 로 「기다림」 에 남긴다).
   구현 갈래(권고가 이미 적힌 "어떻게") 🙋 는 권고로 닫아 올려도 된다.
2. **발자국 표** — 후보마다 고칠 파일을 grep 으로 적고, 겹치는 것끼리 한 레인으로 묶는다. 허브 파일(`adminPage.tsx` 처럼 여럿이 닿는 곳)은 한 레인에 주고
   다른 레인은 "필요하면 고치지 말고 발견으로" 라고 적는다. **문서 머리 줄(`> 최종 수정`)도 문서마다 주인 한 레인** — 나머지는 문장만 보고하고 메인이 뒤에 붙인다.
3. **선점** — 일(줄) 하나에 오래 사는 `sleep` 하나: `nohup sleep 36000 >/dev/null 2>&1 & echo $!`. 한 주인은 한 줄만 쥔다(`take` 를 다시 하면 RESUME)
   — 레인이 일 둘을 차례로 하면 pid 둘. 새 줄을 「지금」 에 넣을 때는 **`.claude/next-claims.lock` 을 잡고 넣은 직후 바로 `take`** 를 한 스크립트로
   (잠금은 10초면 stale — 짧게, 앵커는 사라지지 않는 `\n\n## 기다림`). 다른 세션이 끼면 엉뚱한 줄을 받으니 `CLAIMED` 줄 제목으로 pid ↔ 일을 다시 맞춘다.
4. **NOW 커밋** — 넣은 줄·걷은 🙋·머리 줄을 저널로 `lane-commit.mjs` 에(아래). 레인의 `--drop-now` 가 HEAD 판을 고치므로 레인보다 먼저.
5. **레인 띄우기** — 한 메시지에 Agent 여럿(백그라운드). 프롬프트는 "먼저 이 문서의 「레인 규칙」 을 읽어라" + 레인별: pid 와 줄 제목 · 명세 링크 ·
   주인 표(코드·문서) · 쓰지 말 파일 · 검증 수단(Playwright 절대경로 · 로그인 화면 제약) · 판단이 큰 레인만 `model: "opus"`.
6. **뒤** — 레인 보고의 문서 문장을 주인 없는 문서에 붙이고, 「발견」 을 명세로 옮기고(지금 할 만하면 「지금」 에), 화면이 바뀐 것은 메인이 Chrome 으로 한 번
   (원격 쓰기 버튼은 누르지 않는다), `sleep` pid 를 `kill` 한다(남의 프로세스는 건드리지 않는다).

## 레인 규칙

너는 같은 작업 트리(develop)에서 다른 레인·다른 Claude 세션과 **동시에** 일한다. 레포 `CLAUDE.md` 규칙(프론트 편집 순서 · owner-prefix · 시맨틱 색 토큰 ·
`src/components/base/` 는 복사본(`bottom-sheet.tsx` 만 예외) · 문서 갱신 정책)을 그대로 지킨다. 출력 스타일의 "사용자에게 코드 기여 요청" 은 **무시**하고
끝까지 직접 구현한다. 사용자에게 질문하지 않는다 — 판단해서 진행하고 근거를 메모에 적는다.

**선점 — `take`·`release` 금지.** 메인이 미리 잡아 두었다. 끝낼 때만 `NEXT_CLAIM_OWNER=<pid> node .claude/skills/next/claim.mjs done`(작업 트리 NOW.md 에서
내 줄을 지운다) → 바로 lane-commit. 사람이 꼭 필요해 못 끝내면 `… claim.mjs park 🧑|🙋 "<이유 · 명령/권고>"` 뒤 `lane-commit … --park-now "<제목 앞부분>"`(그 옮김을 HEAD 에도 — 산출물·메모가 있으면 같이) → 보고.

**편집 금지.** 코드 파일을 고치기 전에 `git diff HEAD -- <파일>` 이 비어 있어야 한다 — 아니면 남의 것이니 「발견」 으로. 다른 레인의 파일(주인 표)도 「발견」 으로.
`docs/todo/NOW.md` 는 Edit 하지 않는다(claim.mjs·lane-commit 만). 번호 문서(14 등)는 **내 태스크 줄의 `- [ ]` → `- [x]` + 바로 밑 `    > 메모(<날짜>): …` 만**, 문서 머리 줄은 안 건드린다.
주인이 아닌 문서에 줄을 더해야 하면 고치지 말고, **처음부터 저널 파일**(`<scratch>/<문서이름>-journal.json`, 판 번호는 `vNN` 자리표시)로 남기고 보고에는 그 경로만 적는다
— 보고 메시지는 길면 잘려서, 문장으로 보내면 메인이 다시 물어야 한다(2026-10-16 레인 C).

**커밋 — 한 일 = 한 커밋, 끝나는 대로 바로.** (중간에 한도로 끊겨도 끝낸 것은 남는다.) `git add`·`commit`·`rm`·`mv` 를 직접 치지 않는다(인덱스를 남과 공유한다):

```
node .claude/skills/next/lane-commit.mjs --msg <scratch>/msg.txt \
  --files src/a.ts,src/a.test.ts --edits <scratch>/journal.json --drop-now "<NOW 줄 제목 앞부분>"
```

- `--files` 내 코드 파일(작업 트리 내용 통째 · 지운 파일은 삭제로). `--edits` **docs/ 아래 편집은 전부 저널로** — `[{ "file", "old"(HEAD 에 정확히 1번), "new" }]`,
  node 로 `JSON.stringify` 해서 만든다. HEAD 판에 저널만 다시 적용해 커밋하고 작업 트리에도 적용한다. ADR·features 의 주인이면 머리에 `> 최종 수정` 을 쌓는다(그 문서의 모양대로).
- 메시지는 `git log -5` 모양: `fix(<영역>) - 14 W…: <무엇을 왜 — 한 문단> … 테스트 n · tsc 0 · eslint 0 · <화면 확인·수치>` + 빈 줄 + Co-Authored-By 줄.
- 찍힌 `COMMITTED <해시>` 를 보고에 쓴다.

**검증.** `pnpm vitest run <경로>` · `pnpm tsc --noEmit -p .` · `pnpm eslint <내 파일>`(남의 파일 에러는 내 것이 아님을 확인하고 보고). **공유 트리에서 `pnpm build` 금지**
— 빌드가 필요하면 `git worktree add --detach <scratch>/wt` → `pnpm install --frozen-lockfile --prefer-offline` → 빌드 → `git worktree remove --force`.
dev 서버(7727·7728)를 죽이지 않는다. 화면은 headless Playwright 스크립트(메인이 준 절대경로 import, 스크립트는 내 scratch)로 `http://localhost:7727` 에 —
`next dev` 라 SW 가 없다. Chrome 확장·Playwright MCP 는 쓰지 않는다(한 브라우저를 나눠 못 쓴다). zustand 상태는 `page.addInitScript` 로 localStorage 에 심는다(키는 `src/store/`).
`/admin` 은 headless 에 운영자 세션이 없어 로그인 화면뿐이다 — 단위 테스트 + `page.route` 가짜 응답까지만, 실제 화면은 메인이 Chrome 으로 본다.
touch 리스너는 마우스 끌기로 못 건드린다 — CDP `Input.dispatchTouchEvent` 로 보고 그렇게 적는다.

**보고(최종 메시지).** 짧게: 커밋 해시와 한 줄 · 원인 · 검증 수치 · 주인 아닌 문서에 붙일 문장 · 「발견」(고치지 않은 것, 한 줄씩) · park 했으면 이유.

## lane-commit.mjs 가 하는 일·함정

개인 인덱스(`read-tree HEAD`) → 내 파일·저널 → `commit-tree` → `update-ref HEAD 새 옛`(비교 교체, HEAD 가 움직였으면 8번까지 다시) → 작업 트리에도 저널 →
공유 인덱스의 그 경로를 `git reset -q`. 레인끼리는 `.git/lane-commit.lock` 으로 줄 선다.

- 저널 "이미 적용" 판정은 `new` 가 내용에 있는가다 — `new` 가 `old` 를 품는 덧붙이기도 그래서 두 번 붙지 않는다.
- 작업 트리 적용을 빼먹으면 작업 트리가 HEAD 뒤에 남아 남의 경로 커밋이 내 줄을 되돌린다(그래서 커밋 뒤 작업 트리에도 적용한다).
- 레인이 쓴 테스트는 vitest 로(`node:test` 는 `scripts/**/*.test.mjs` 에서 "No test suite"). zsh 는 따옴표 없는 `$VAR` 를 단어로 안 나눈다.

## 무인

자는 동안처럼 사람이 없으면 레인을 서브에이전트가 아니라 별도 프로세스로: `claude -p "<레인 지시>" --permission-mode auto --permission-prompts none --output-format stream-json --verbose`
(권한 요청이 자동 거부라 "막히면 건너뛰기" 가 저절로 된다). 띄울 때 이 세션의 `CLAUDECODE`·`CLAUDE_PID`·`CLAUDE_CODE_SESSION_*`·메시징 소켓 env 를 `env -u` 로 빼고,
레인마다 `NEXT_CLAIM_OWNER=<sleep pid>`. 감독은 nohup 스크립트로 떼어 둔다(한도로 감독 세션이 멈춰도 돈다 — 대기 조건 → 레인 → 한도면 30분 쉼 → NONE 4번이면 끝).
