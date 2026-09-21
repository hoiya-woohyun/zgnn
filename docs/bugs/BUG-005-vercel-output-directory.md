# BUG-005 — Vercel 배포가 빌드는 다 끝내고 마지막에 죽는다 (`out/routes-manifest.json` 없음)

> 최종 수정: 2026-09-21 (v3: 재현 때 손으로 넣은 `.vercel/.env.production.local` 이 남아 있던 것을 이력 주석으로 — 빌드는 이제 anon 키라 값을 넣을 일이 없다(ADR-016 v4))
> 이전 (v2: 프로덕션 배포로 수정 확인. 로컬 재현 절차의 `.env.local` 값 참조 제거(ADR-016 — 로컬엔 값이 없다))
> 이전 (v1: 신설)

## 증상

`vercel.json` 을 커밋한 뒤(`d512234`) 프로덕션 배포가 **Error** 로 끝난다. 빌드 로그를 보면
막히는 데가 없다 — `pull 완료: places 86`, `✓ Compiled successfully`, `✓ Generating static pages (98/98)`,
`번들 유출 검사 통과: 530 파일` 까지 전부 초록이고, 그 다음 줄에서 죽는다:

```
Error: The file "/vercel/path0/out/routes-manifest.json" couldn't be found.
  1. The "Output Directory" setting in your project is misconfigured. Ensure it matches your Next.js "distDir" …
```

이전 배포(3시간 전)는 그대로 살아 있으므로 **사이트는 안 죽는다.** 새 커밋만 반영되지 않는다.

## 재현 조건

- `vercel.json` 에 `"framework": "nextjs"` 와 `"outputDirectory": "out"` 이 **같이** 있다.
- 로컬에서도 그대로 재현된다: `vercel pull --environment=production` 뒤 `vercel build --prod` → 같은 메시지.
  (당시엔 `SUPABASE_SERVICE_ROLE_KEY` 가 Sensitive 라 `vercel pull` 이 `[SENSITIVE]` 자리표시자를 내려받아, `.vercel/.env.production.local` 의 그 줄을
  실제 값으로 손으로 바꿔야 `data:pull` 이 통과했다 — **그 파일이 지워지지 않은 채 남아 보안 리뷰에서 발견됐다**(ADR-016 v4 "잔존 위험" #1).
  이제는 빌드가 publishable(anon) 키로 돌아 Vercel env 에 Supabase 시크릿이 없고, 로컬 `vercel build` 도 값을 손으로 넣을 일이 없다.
  두 파일 다 gitignored.)

## 원인

Vercel 의 Next.js 빌더(`@vercel/next`)는 `next build` 가 끝난 뒤 **`.next/` 의 매니페스트**
(`routes-manifest.json` 등)를 읽어 라우팅을 만들고, `output: 'export'` 는 그 뒤에 따로 감지해 `out/` 을
정적으로 서빙한다. `outputDirectory` 를 `out` 으로 못 박으면 빌더가 매니페스트까지 `out/` 에서 찾는다 —
정적 내보내기 폴더에 그런 파일은 없으니 실패한다.

"정적 사이트니까 Output Directory 는 `out`" 이 직관이라 걸리기 쉽다. `framework: "nextjs"` 일 때 그 값은
**비워 두는 것이 맞다**(대시보드 기본값도 `null`). `out` 을 지정하는 건 Framework Preset 을 Other 로 두고
Next 빌더를 아예 안 쓸 때의 이야기다.

## 수정

`vercel.json` 에서 `outputDirectory` 한 줄을 뺐다(`03f5712`). `buildCommand` 와 `framework` 는 그대로.

```diff
   "buildCommand": "pnpm data:pull && pnpm build",
-  "outputDirectory": "out",
   "framework": "nextjs"
```

로컬 `vercel build --prod` 로 확인: `.vercel/output/static/` 에 `index.html`·`sw.js`·`manifest.webmanifest`·
`place/*`(86) 이 들어가고 `Build completed successfully`. **`vercel build` 는 배포하지 않는다** — 배포 설정을
Vercel 을 건드리지 않고 검증할 수 있는 경로다.

## 아직 열려 있는 것

- 이 수정은 브랜치에 push 됐다(2026-09-21). Vercel Preview → `main` 머지 → 프로덕션 배포에서 확인한다.
- 대시보드의 Output Directory 를 손으로 `out` 으로 바꿔도 같은 고장이 난다. `vercel.json` 에 없는 설정은
  대시보드 값이 이기므로, 다시 이 증상이 나면 `vercel pull` 로 `.vercel/project.json` 의 `settings.outputDirectory` 를 본다.

## 관련

- [todo/04 — 4a 빌드가 DB 를 읽는다](../todo/04-deploy-and-propagate.md)
- [CLAUDE.md — 조용히 깨지는 것들](../../CLAUDE.md)
