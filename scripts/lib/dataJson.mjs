// src/data/*.json 을 파일로 쓰는 유일한 경로. Notion export(normalize.mjs)와 Supabase(pull-db.mjs) 두 입구가 같은 함수를 쓴다.
// 두 입구가 같은 바이트를 내야 `pnpm data pull` 뒤 `git diff src/data` 가 비는 것이 "DB 와 스냅샷이 같다" 의 증명이 된다(docs/todo/01).
// 그래서 들여쓰기·줄 끝(개행 없음)을 한 곳에서 정한다(키 순서는 placeFields.mjs 의 toPlace 가 정한다).
// placeFields.mjs 에서 떼어 낸 이유: 저 모듈은 브라우저(src/lib/admin*)도 import 하는 순수 모듈이라 node:fs 가 있으면 번들이 안 된다(ADR-018).
import { writeFile } from 'node:fs/promises';

/** src/data/*.json 의 유일한 쓰기 경로. 들여쓰기 1, 끝 개행 없음 — 기존 파일과 바이트가 같아야 한다. */
export async function writeDataJson(url, value) {
  await writeFile(url, JSON.stringify(value, null, 1));
}
