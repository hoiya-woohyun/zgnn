/**
 * `wawoff2`(Google woff2 의 wasm 빌드)는 타입을 싣지 않는다. 미리보기 이미지 라우트(`app/og/[file]/route.ts`)가
 * 빌드 때 글꼴을 풀 때만 쓰므로 그 한 함수만 적는다.
 */
declare module 'wawoff2' {
  export function decompress(woff2: Uint8Array): Promise<Uint8Array>;
}
