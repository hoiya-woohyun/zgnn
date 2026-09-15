# PWA · 서비스워커 · 오프라인

> 최종 수정: 2026-09-15 (v1: 신설)

## 개요

스토어 배포 없이 "홈 화면에 추가" 로 앱처럼 쓰는 것이 목표다(→ [ADR-001](../decisions/ADR-001-pwa-static-export.md)).
서비스워커는 `@serwist/next` 가 만들고, 손으로 쓰는 것은 `src/app/sw.ts` 하나다.

```
src/app/sw.ts ──(next build --webpack)──▶ public/sw.js ──▶ out/sw.js
next.config.mjs: additionalPrecacheEntries (라우트 HTML 93개 + 매니페스트 + 아이콘 4 + 404)
```

## 빌드는 webpack, dev 는 Turbopack

- `@serwist/next` 는 webpack 플러그인이라 `build` 에 `--webpack` 이 **필수**다. 빼면 빌드는 통과하지만 `sw.js` 가 안 생겨 PWA 가 조용히 사라진다.
- `dev` 는 `--turbopack`. 개발 모드에서는 플러그인이 `disable: true` 라 서비스워커를 만들지 않으므로 webpack 을 쓸 이유가 없다.
  플래그를 명시하는 이유는 Next 16 이 "webpack 설정은 있는데 turbopack 설정이 없다" 며 멈추기 때문이다.

## 프리캐시 목록을 직접 만드는 이유

정적 내보내기의 HTML 은 webpack 자산이 아니라 컴파일 뒤 따로 쓰인다. 그냥 두면 매니페스트에 JS·CSS 만 들어오고 화면 주소가 하나도 안 들어온다.
그래서 `next.config.mjs` 가 `places.json` 에서 라우트 93개(홈·지도·준비물·저장·종류 3·장소 86)를 만들어 `additionalPrecacheEntries` 로 넣는다.

- **주의**: `additionalPrecacheEntries` 를 주면 플러그인은 `public/` 을 훑는 자기 동작을 **건너뛴다**. 둘은 더해지지 않는다. 그래서 아이콘·404·매니페스트도 직접 넣는다.
- 라우트 HTML 은 파일명에 해시가 없어 `revision` 이 필요하다. `src/` 전체와 `package.json`, `pnpm-lock.yaml` 을 해싱한 값을 쓴다. 코드가 바뀌면 전부 갱신되는 보수적 전략이다.

## 런타임 캐시 (`src/app/sw.ts`)

| 대상 | 전략 | 이유 |
|---|---|---|
| `/images/places/*` | CacheFirst + 만료 | 있어도 용량이 커서 프리캐시에 넣지 않는다. 지금은 이미지가 없어 사실상 비활성 |
| `tile.openstreetmap.org`, `basemaps.cartocdn.com` | CacheFirst + 만료 | 지도 타일. 한 번 본 지역은 오프라인에서도 보인다 |
| 그 외 | serwist `defaultCache` | |
| 문서 요청 실패 | `/404.html` 폴백 | 오프라인에서 프리캐시에 없는 주소를 열었을 때 빈 화면 대신 404 |

## 매니페스트와 아이콘

- `src/app/manifest.ts`: `theme_color` 는 잉크 `#2e2327`, `background_color` 는 크림 `#faf8f4`. `layout.tsx` 의 `themeColor` 와 같은 값이어야 한다.
- 아이콘은 `scripts/make-icons.mjs` 가 SVG(잉크 둥근 사각 + brand-300 발자국)를 sharp 로 PNG 4장으로 만든다. 팔레트가 바뀔 때만 `pnpm icons`.
  maskable 은 기기가 바깥을 잘라내므로 발자국을 안쪽으로 모은다.

## 확인 방법

`pnpm build && pnpm preview` 로 `out/` 을 띄우고, DevTools → Application 에서 `sw.js` 등록과 프리캐시 개수(최근 139개)를 본다.
`pnpm dev` 에서는 서비스워커가 없으므로 오프라인 동작은 반드시 빌드본으로 본다.

## 관련 파일

`src/app/sw.ts`, `next.config.mjs`, `src/app/manifest.ts`, `src/app/layout.tsx`, `scripts/make-icons.mjs`, `public/icons/`
