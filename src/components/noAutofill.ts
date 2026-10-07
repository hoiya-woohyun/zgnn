/**
 * 브라우저 자동완성(연락처·주소·이전 입력값)이 뜰 자리가 아닌 입력칸에 펼친다 — `<Input {...NO_AUTOFILL} />`.
 *
 * **`autoComplete="off"` 하나로는 Safari 가 안 멈춘다.** Safari 는 칸의 `name` → 자리표시 글자 → 라벨 순으로 훑어
 * "이름"·"주소"·"전화" 같은 말이 보이면 연락처 카드를 띄우고, 이때 `autocomplete` 값은 무시한다. 둘러보기 검색
 * ("이름·특징·읍면 검색")과 강아지 이름 칸(라벨 "이름")에 내 연락처가 뜬 것이 이것이다. 이 훑기는 `name` 에
 * `search` 가 들어 있으면 거기서 멈추므로 `name` 에 그 낱말을 넣는다. 폼을 서버로 보내지 않는 정적 앱이라
 * `name` 이 겹쳐도 다른 데 쓰이지 않는다. Chrome·Firefox 는 `autoComplete="off"` 를 따른다.
 *
 * 로그인처럼 자동완성이 **도와야** 하는 칸에는 쓰지 않는다(`adminPageLogin` 은 `username`·`current-password`).
 */
export const NO_AUTOFILL = { name: 'search_nofill', autoComplete: 'off' } as const;

/**
 * 검색칸 — 자동완성을 끄고, 자동 고침·첫 글자 대문자·맞춤법 밑줄도 끈다(가게 이름·지명을 사전 낱말로 고쳐 버린다).
 * 키보드의 엔터 자리는 '검색' 으로 보인다.
 */
export const SEARCH_FIELD = {
  ...NO_AUTOFILL,
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: 'false',
  enterKeyHint: 'search',
} as const;
