// 안전 NPC — 순수. 엉뚱·못된 말을 종료 X, 호감도/엔딩으로 흡수(규칙5).
// market-data: "안 비웃는 안전 NPC"가 최강 셀링. 차단이 아니라 우아한 받아넘김 + 관계 냉각.
import type { UtteranceCategory } from "./types";

/** deflection 톤 — 에스컬레이션(1회 부드럽게 → 반복 단호 → 지속 냉각). 종료는 없음. */
export type DeflectionTone = "gentle" | "firm" | "cold";

export function deflectionTone(category: UtteranceCategory, failCount: number): DeflectionTone {
  if (category === "harmful") return "cold";
  if (category === "inappropriate") return failCount >= 2 ? "cold" : "firm";
  // normal / offtopic
  return failCount >= 2 ? "firm" : "gentle";
}

/** 호감도 페널티 — 못된 말은 관계가 차가워지되 종료 X(엔딩 분기로 흡수). */
export function affinityPenalty(category: UtteranceCategory): number {
  switch (category) {
    case "harmful":
      return -2;
    case "inappropriate":
      return -1;
    default:
      return 0; // normal/offtopic은 흡수(페널티 없음)
  }
}

/** harmful만 하드 게이트(단호한 경계 + 안전 안내). 나머지는 우아한 deflection. */
export function isHardBlock(category: UtteranceCategory): boolean {
  return category === "harmful";
}

/** 안전 분기가 필요한가(normal이 아니면). category 없으면 normal 취급. */
export function needsDeflection(category: UtteranceCategory | undefined): boolean {
  return category !== undefined && category !== "normal";
}
