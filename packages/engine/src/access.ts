// 배포 제어 — 순수. 단계적 출시(alpha 25 → pilot 300 → ga)의 인원 게이트·사용량 캡·회원 상태.
// 어드민이 조작하는 "정책"이자 런타임이 강제하는 "게이트". 시간·카운트는 주입(순수·테스트 가능).

export type ReleaseStage = "alpha" | "pilot" | "ga";
export type MemberStatus = "active" | "waitlisted" | "blocked";

export interface StageLimits {
  /** 동시 활성 인원 상한 */
  capacity: number;
  /** 유저당 일일 턴 상한 — API 폭주 방어(인원 제한만으론 1명 폭주를 못 막음) */
  dailyTurnCap: number;
  /** 유료 전환 단계 여부 */
  paid: boolean;
}

export const STAGE_LIMITS: Record<ReleaseStage, StageLimits> = {
  alpha: { capacity: 25, dailyTurnCap: 30, paid: false },
  pilot: { capacity: 300, dailyTurnCap: 60, paid: true },
  ga: { capacity: Number.POSITIVE_INFINITY, dailyTurnCap: 200, paid: true },
};

export interface AdmissionResult {
  status: MemberStatus;
  reason: string;
  /** 웨이팅리스트일 때 대기 순번 */
  waitlistPosition?: number;
}

/** 입장 판정 — 상한 도달 시 차단이 아니라 웨이팅리스트(거절을 자산으로). */
export function admit(
  stage: ReleaseStage,
  activeCount: number,
  isMember: boolean,
  waitlistLength: number,
): AdmissionResult {
  if (isMember) return { status: "active", reason: "existing_member" };
  const cap = STAGE_LIMITS[stage].capacity;
  if (activeCount < cap) return { status: "active", reason: "admitted" };
  return { status: "waitlisted", reason: "capacity_full", waitlistPosition: waitlistLength + 1 };
}

export interface UsageState {
  turnsToday: number;
  dayStamp: string; // "YYYY-MM-DD"
}

/** 일일 턴 캡 — API 폭주 방어. 날짜가 바뀌면 사용량은 리셋된 것으로 본다. */
export function canSpendTurn(usage: UsageState, stage: ReleaseStage, today: string): boolean {
  const cap = STAGE_LIMITS[stage].dailyTurnCap;
  const turns = usage.dayStamp === today ? usage.turnsToday : 0;
  return turns < cap;
}

/** 턴 사용 기록(날짜 경계에서 리셋). */
export function recordTurn(usage: UsageState, today: string): UsageState {
  if (usage.dayStamp !== today) return { turnsToday: 1, dayStamp: today };
  return { turnsToday: usage.turnsToday + 1, dayStamp: today };
}

/** 빈 자리 수 — 웨이팅리스트에서 승급 가능한 인원. */
export function openSlots(stage: ReleaseStage, activeCount: number): number {
  const cap = STAGE_LIMITS[stage].capacity;
  if (cap === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  return Math.max(0, cap - activeCount);
}
