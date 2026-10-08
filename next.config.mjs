import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import withSerwistInit from '@serwist/next';

const ROOT = import.meta.dirname;

/*
 * 배포 식별자(커밋 앞 7자). 사용자 제보가 "어느 데이터를 보고 한 말인가" 를 이것으로 싣는다(ADR-021 · docs/todo/10 T1.5).
 * Vercel 은 `VERCEL_GIT_COMMIT_SHA` 를 주고, 로컬은 git 에게 묻고, 둘 다 없으면 'dev'. 공개값이다 — 커밋 해시는 시크릿이 아니고
 * `check-bundle` 의 패턴(키 접두·JWT·남의 supabase 호스트) 어디에도 걸리지 않는다.
 */
const appBuild = (() => {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
})();

/**
 * 서버 워커(ADR-028)를 깨울 주소. 프로덕션 사이트는 `vercel.json` rewrite 로 같은 출처의 `/api/worker/run` 이다(CORS 를 열지 않는다).
 * 로컬 dev·HEAD 분리 빌드에는 그 rewrite 가 없어 비워 둔다 — 비면 `/admin` 이 깨우지 않고 로컬 워커(`pnpm data`)에 맡긴다.
 * 일부러 붙여 보려면 `NEXT_PUBLIC_WORKER_URL` 을 준다(`src/lib/adminWorkerWake.ts`).
 * 끝 슬래시는 일부러다 — `trailingSlash: true` 라 Vercel 이 `/api/worker/run` 을 먼저 `/run/` 으로 308 하고, rewrite 는 끝 슬래시까지 엄격하게 맞춘다
 * (`vercel.json` 의 슬래시 붙은 규칙이 그 길이다. 슬래시 없는 규칙만 있으면 배포는 초록인데 깨우기가 전부 404 — 2026-10-08 실측).
 */
const workerWakeUrl = process.env.NEXT_PUBLIC_WORKER_URL ?? (process.env.VERCEL_ENV === 'production' ? '/api/worker/run/' : '');

/*
 * 프리캐시 항목의 revision.
 *
 * 정적 내보내기의 HTML 은 파일명에 해시가 붙지 않는다(`/place/xxx/index.html`).
 * 그래서 revision 을 null 로 둘 수 없고, 내용이 바뀌면 값도 바뀌어야 한다.
 * 커밋 해시 대신 `src/` 전체와 설정·잠금 파일을 해싱한다 — 커밋하지 않은 워킹트리로
 * 빌드해도 내용이 바뀐 만큼 revision 이 따라오게 하려는 것이다.
 */
const hashInto = (dir, hash) => {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) hashInto(full, hash);
    else hash.update(name).update(readFileSync(full));
  }
};

const revisionHash = createHash('sha256');
hashInto(path.join(ROOT, 'src'), revisionHash);
// 잠금 파일까지 넣는 이유: 의존성만 올려도 번들 파일명이 바뀐다. src/ 만 보면 그때
// revision 이 그대로라, 이미 방문한 사람의 HTML 이 사라진 청크를 계속 가리킨다.
revisionHash.update(readFileSync(path.join(ROOT, 'package.json')));
revisionHash.update(readFileSync(path.join(ROOT, 'pnpm-lock.yaml')));
// 이 파일도 넣는다. 프리캐시 목록과 빌드 설정이 여기 있어서, 라우트를 더하거나 설정만
// 바꿔도 HTML 내용이 달라진다. src/ 만 보면 그때 revision 이 그대로다.
revisionHash.update(readFileSync(path.join(ROOT, 'next.config.mjs')));
// 배포 식별자도 넣는다 — 번들에 박히는 값이라, 문서만 바뀐 커밋에서도 JS 청크 이름이 바뀐다. 안 넣으면 revision 이
// 그대로라 이미 방문한 사람의 프리캐시 HTML 이 사라진 청크를 가리킨다(위 잠금 파일과 같은 이유).
revisionHash.update(appBuild);
const revision = revisionHash.digest('hex').slice(0, 16);

/*
 * 정적 내보내기의 HTML 은 webpack 이 만드는 자산이 아니라 빌드 뒤에 따로 쓰인다.
 * 그래서 Serwist 가 모은 매니페스트에는 JS·CSS 만 들어오고 화면 주소는 하나도 없다.
 * 라우트 목록을 여기서 직접 만들어 넣어야 오프라인에서 화면이 뜬다.
 * `trailingSlash: true` 라 주소는 모두 슬래시로 끝난다.
 */
const places = JSON.parse(readFileSync(path.join(ROOT, 'src/data/places.json'), 'utf8'));

const routes = [
  '/',
  '/map/',
  '/checklist/',
  '/settings/',
  '/saved/',
  '/dog/',
  '/places/stay/',
  '/places/restaurant/',
  '/places/cafe/',
  ...places.map((place) => `/place/${place.id}/`),
];

/*
 * public/ 의 아이콘과 이미지.
 *
 * @serwist/next 는 `additionalPrecacheEntries` 를 주면 public/ 을 훑는 자기 동작
 * (`globPublicPatterns`)을 아예 건너뛴다 — 둘은 보태지는 게 아니라 하나가 다른 하나를
 * 대신한다. 그래서 아이콘도 여기서 같이 넣어야 홈 화면에 추가한 뒤 오프라인에서 아이콘이 뜬다.
 * revision 은 파일 내용 해시라, 파일을 바꾸면 그 항목만 다시 받는다.
 *
 * public/ 에 새 디렉터리를 만들면 여기 목록에도 더해야 한다 — 빌드는 통과하고 온라인에선
 * 보이는데 오프라인에서만 조용히 빠지는 자리다.
 */
const publicEntries = ['icons', 'images'].flatMap((dir) =>
  readdirSync(path.join(ROOT, 'public', dir))
    // 하위 디렉터리는 건너뛴다 — readFileSync 가 EISDIR 로 빌드를 멈춘다.
    .filter((name) => statSync(path.join(ROOT, 'public', dir, name)).isFile())
    .map((name) => ({
      url: `/${dir}/${name}`,
      revision: createHash('sha256')
        .update(readFileSync(path.join(ROOT, 'public', dir, name)))
        .digest('hex'),
    })),
);

const additionalPrecacheEntries = [
  ...routes.map((url) => ({ url, revision })),
  ...publicEntries,
  // 오프라인에서 모르는 주소로 들어왔을 때 보여줄 화면.
  { url: '/404.html', revision },
  // app/manifest.ts 가 만드는 웹 매니페스트. public/ 이 아니라 라우트라 직접 넣는다.
  { url: '/manifest.webmanifest', revision },
];

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries,
  reloadOnOnline: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  /*
   * 폰에서 `next dev` 를 LAN 주소로 볼 때 필요하다.
   *
   * Next 16 은 localhost 가 아닌 출처의 `/_next/*` 요청을 403 으로 막고 HMR 웹소켓
   * 핸드셰이크도 거절한다. 그러면 HTML 과 링크는 멀쩡한데 **하이드레이션만 죽어서**,
   * 버튼을 눌러도 시트가 안 열리고 스크롤해도 접히는 줄이 안 나타난다 — "iOS 사파리에서만
   * 고장" 처럼 보이는 자리다(데스크톱은 localhost 로 보니까). 콘솔에 남는 단서는
   * `ws://<IP>:7727/_next/hmr ... ERR_INVALID_HTTP_RESPONSE` 하나뿐이다.
   *
   * 사설 대역을 통째로 적는다. 특정 IP 를 박아 두면 공유기가 주소를 다시 나눠 줄 때마다
   * 같은 고장이 돌아오는데, 그때 단서가 위 한 줄뿐이라 원인을 다시 찾게 된다.
   *
   * 개발 서버에만 적용된다 — `output: 'export'` 산출물에는 아무 영향이 없다.
   */
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_APP_BUILD: appBuild, NEXT_PUBLIC_WORKER_URL: workerWakeUrl },
  /*
   * `next dev` 가 프로젝트 루트에 AGENTS.md / CLAUDE.md 를 자동 생성하는 기능을 끈다.
   * 이 레포는 `.claude/` 와 사용자 전역 규칙을 이미 쓰고 있어서, Next 가 만든 파일이
   * Claude Code 에 프로젝트 지침으로 잘못 읽힌다.
   */
  agentRules: false,
  experimental: {
    /*
     * Untitled UI 스타터킷이 켜 두고 오는 설정이라 그대로 둔다.
     * `@untitledui/icons` 는 아이콘 수백 개를 배럴 하나로 내보내서, 이게 없으면
     * 아이콘 하나만 써도 빌드가 그 모듈 전체를 훑는다. 아이콘 패키지 한 곳에만 걸린다.
     */
    optimizePackageImports: ['@untitledui/icons'],
  },
};

export default withSerwist(nextConfig);
