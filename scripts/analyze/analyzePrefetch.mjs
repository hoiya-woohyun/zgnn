/**
 * 글 루프의 **앞당겨 읽기 창** — 글마다 오래 걸리는 앞 절반(본문 받기 · `claude -p` 추출 · 교차점검)을 최대 `concurrency` 건 동시에 띄우고,
 * 뒤 절반(네이버 보강 · 대조 · 중복 판정 · insert)은 호출자가 **원래 순서대로 하나씩** `take(i)` 로 받아 처리한다.
 *
 * 왜 앞 절반만인가 — 앞 절반은 그 글 하나만 읽는다. 뒤 절반은 `newNamesSeen`·`newPlacesSeen`(이번 실행에서 먼저 난 신규 후보)을
 * 글 순서대로 쌓아 `dupOf` 를 정하므로, 순서가 바뀌면 같은 입력에서 다른 묶음이 나온다. 창은 그 순서를 지키면서 기다림만 겹친다.
 *
 * - **순서는 받는 쪽만 지킨다** — 띄우는 쪽은 "떠 있는(끝나지 않은) 글이 `concurrency` 건 미만이면 다음 글" 이다. 처음엔 "지금 받는 글 + N" 까지만
 *   띄웠는데, 장소 많은 글 하나가 2분을 끄는 동안 나머지 칸이 이미 끝나 놀아 동시 6 이 사실상 1 이 됐다(2026-10-11 실측 — 글 사이 간격 0~4초 사이에
 *   130·149초). 먼저 끝난 결과는 쌓아 두고 `take` 가 순서대로 꺼낸다.
 * - 앞서 가는 거리는 `lookaheadFor(concurrency)` 건까지다(지금 받는 글 포함, 띄웠지만 아직 처리 안 한 글 수). 쌓아 둔 결과는 뒤 절반이 fatal 로 끊기면
 *   버려지므로(다음 실행이 다시 읽는다) 무한히 앞서 가지 않는다. 1 은 예전 직렬 그대로다.
 * - 띄울 때마다 `canStart(ahead)` 를 본다(서버 홉의 시간 예산). `ahead` 는 이 글 앞에서 뒤 절반을 기다리는 글 수(띄웠지만 아직 처리 안 한 글) —
 *   이 글의 끝은 "띄운 시각 + 한 글 추정" 이 아니라 앞 글들의 뒤 절반이 다 끝난 뒤다. 거짓이면 그 뒤로는 띄우지 않고 `deadlineHit` 이 선다.
 * - `stop()` 은 새로 띄우기만 멈춘다(한도 · fatal) — 이미 떠 있는 것은 `settle()` 로 기다려야 자식 프로세스가 실행 기록 뒤에 남지 않는다.
 * - 결과는 띄우는 순간 `{ ok, value | error }` 로 감싼다. 루프가 아직 `await` 하지 않은 글이 먼저 reject 되면 미처리 rejection 으로
 *   프로세스가 죽는다(로컬 워커·서버 함수는 같은 프로세스에서 `main()` 을 부른다).
 */

/** 동시 `width` 건일 때 지금 받는 글로부터 몇 건 앞까지 띄우나 — 느린 글 하나를 기다리는 동안 나머지 칸이 더 읽어 둘 여유. 1 은 직렬. */
export function lookaheadFor(width) {
  return width === 1 ? 1 : width * 3;
}

export function createAnalyzePrefetch(items, prepare, { concurrency = 1, canStart = () => true } = {}) {
  const width = Math.max(1, Math.floor(concurrency));
  const lookahead = Math.max(width, lookaheadFor(width));
  const slots = [];
  let running = 0; // 앞 절반이 아직 안 끝난 글
  let stopped = false;
  let deadlineHit = false;
  let current = 0; // 지금 뒤 절반을 하는(또는 기다리는) 글

  function fill() {
    while (!stopped && slots.length < items.length && running < width && slots.length < current + lookahead) {
      if (!canStart(slots.length - current)) {
        stopped = true;
        deadlineHit = true;
        break;
      }
      const index = slots.length;
      running += 1;
      const slot = Promise.resolve()
        .then(() => prepare(items[index], index))
        .then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error }),
        );
      // 끝나는 즉시 빈 칸을 채운다 — 받는 쪽이 앞 글을 기다리는 중이어도.
      slot.then(() => {
        running -= 1;
        fill();
      });
      slots.push(slot);
    }
  }

  return {
    /** `index` 번째 글의 앞 절반 결과. 띄우지 못한 글(시간 예산 · stop 뒤)이면 null. 받는 김에 빈 칸을 채운다. */
    async take(index) {
      current = index;
      fill();
      return index < slots.length ? slots[index] : null;
    },
    stop() {
      stopped = true;
    },
    /** 떠 있는 것을 전부 기다린다 — 루프를 끊은 뒤 부른다. */
    async settle() {
      await Promise.all(slots);
    },
    /** 띄운 글 수 — 손대지 않은 글은 `items.length - launched` 다(`onDeadline` 이 저수지에 되돌리는 수). */
    get launched() {
      return slots.length;
    },
    get deadlineHit() {
      return deadlineHit;
    },
  };
}
