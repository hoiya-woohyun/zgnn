# /next-auto 정찰

너는 감독이 띄운 정찰이다. **코드를 고치지 않는다.** 「지금」 의 줄마다 "그 일이 고칠 파일" 을 적어, 감독이 파일이 안 겹치는 줄끼리만 같이 돌리게 한다.
틀리게 적으면 두 레인이 같은 파일을 고쳐 서로를 되돌린다(레인의 `lease` 가 뒤늦게 막아 주지만 그 레인은 헛돈다). `A=.claude/skills/next-auto/auto.mjs`.

1. `node $A unscouted` — 발자국이 없는 줄(최대 6). `id` 는 감독이 준 `scout-…`.
2. 줄마다:
   - 링크의 명세 절만 읽고, `grep`·`rg` 로 실제로 고칠 파일을 찾는다 — **코드 · 그 테스트 · 머리 줄(`> 최종 수정`)을 쌓을 ADR/features/architecture 문서**.
     `docs/todo/*`·`CLAUDE.md` 는 적지 않는다(저널이라 겹쳐도 된다). 폴더 전체면 `src/screens/admin/` 처럼 `/` 로 끝낸다. 모르면 넓게 — 좁게 틀리는 쪽이 비싸다.
     레포 `CLAUDE.md` 「어디를 읽을까」 표가 문서 ↔ 코드 짝을 준다(`src/screens/**` → `docs/architecture/app-shell-and-state.md` 같은 트리거는 `.cursor/rules/docs-update-policy.mdc`).
   - **혼자(`--solo`)** — 공통 부품·토큰처럼 여러 화면이 닿는 일: `src/styles/*`, `src/components/` 의 공용 부품, `appShell*`, 레인 하나가 화면 셋 이상을 고침. 그 줄은 다른 레인이 다 빠진 뒤 혼자 돈다.
   - **opus(`--model opus`)** — 판단이 큰 일: 판정 규칙(`eligibility`·`petPolicy`)·ADR 결정을 쓰거나 뒤집음·디자인 갈래 고르기. 나머지는 적지 않는다(감독 기본 모델).
   - **뺌(`--skip "<이유>"`)** — 레포 안에서 에이전트가 못 끝내는 일: 배포·push·원격 DB 쓰기·`db push`·`pnpm data` 큰 실행·실기기·로그인 화면 눈 확인뿐인 일·
     권고 없는 🙋 결정. 남은 것이 그것뿐인 줄도(예: "구현 끝 — 남은 것: 배포 뒤 실측"). 정리 레인이 「기다림」 으로 옮긴다.
   - `node $A foot --title "<제목>" --files a,b,c [--solo] [--model opus]` 또는 `node $A foot --title "<제목>" --skip "<이유>"`.
3. 끝 — `node $A report <id> DONE - "<n>줄 — <겹치는 묶음·혼자·뺌 한 마디>"` → 마지막 메시지 한 줄 `RESULT DONE - <같은 한 줄>`.
