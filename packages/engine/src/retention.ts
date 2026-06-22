// 데이터 보존 정책(CLAUDE.md §6·§9) — 음성 원본 즉시 폐기, 복습녹음 TTL 30일.
// 엔진은 "언제 삭제 대상인가"만 판정(순수). 실제 삭제는 어댑터/서버가 수행.

/** 음성 원본 보존 = 0일(즉시 폐기). STT 직후 버린다 — 저장 자체가 금지(§9). */
export const VOICE_RAW_TTL_DAYS = 0;

/** 복습 녹음 보존 기간 — 별도 동의 + 암호화 + 이 TTL(§6). */
export const REVIEW_RECORDING_TTL_DAYS = 30;

/** recordedAt(ms) 기준 now(ms)에 만료됐는지 — 복습녹음 정리 잡이 사용. */
export function isExpired(recordedAtMs: number, nowMs: number, ttlDays = REVIEW_RECORDING_TTL_DAYS): boolean {
  return nowMs - recordedAtMs >= ttlDays * 86_400_000;
}

/** 만료 항목만 골라낸다 — 어댑터가 받은 목록에서 삭제 대상 키 반환. */
export function expiredKeys(
  items: { key: string; recordedAtMs: number }[],
  nowMs: number,
  ttlDays = REVIEW_RECORDING_TTL_DAYS,
): string[] {
  return items.filter((i) => isExpired(i.recordedAtMs, nowMs, ttlDays)).map((i) => i.key);
}

/** 탈퇴 시 즉시 삭제할 데이터 키(§9 잊혀질 권리) — withdraw.purge와 일치하는 단일 출처. */
export const PURGE_ON_WITHDRAW = ["events", "sessions", "review_recordings"] as const;
