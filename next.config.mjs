import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import withSerwistInit from '@serwist/next';

const ROOT = import.meta.dirname;

/*
 * 프리캐시 항목의 revision.
 *
 * 정적 내보내기의 HTML 은 파일명에 해시가 붙지 않는다(`/place/xxx/index.html`).
 * 그래서 revision 을 null 로 둘 수 없고, 내용이 바뀌면 값도 바뀌어야 한다.
 * git 이 없는 프로젝트라 커밋 해시를 쓸 수 없어 `src/` 전체와 package.json 을 해싱한다.
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
  '/saved/',
  '/places/stay/',
  '/places/restaurant/',
  '/places/cafe/',
  ...places.map((place) => `/place/${place.id}/`),
];

/*
 * public/ 의 아이콘.
 *
 * @serwist/next 는 `additionalPrecacheEntries` 를 주면 public/ 을 훑는 자기 동작
 * (`globPublicPatterns`)을 아예 건너뛴다 — 둘은 보태지는 게 아니라 하나가 다른 하나를
 * 대신한다. 그래서 아이콘도 여기서 같이 넣어야 홈 화면에 추가한 뒤 오프라인에서 아이콘이 뜬다.
 * revision 은 파일 내용 해시라, 아이콘을 바꾸면 그 항목만 다시 받는다.
 */
const iconEntries = readdirSync(path.join(ROOT, 'public/icons')).map((name) => ({
  url: `/icons/${name}`,
  revision: createHash('sha256')
    .update(readFileSync(path.join(ROOT, 'public/icons', name)))
    .digest('hex'),
}));

const additionalPrecacheEntries = [
  ...routes.map((url) => ({ url, revision })),
  ...iconEntries,
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
  images: { unoptimized: true },
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
