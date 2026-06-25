// 회복 루프 — 순수. 같은 씬에서 막혔을 때 단계적 도움(힌트→흥얼거림→선창→후창).
// 부끄러움·좌절 흡수(레드팀: 말하기 불안). recovery 진입 시 실패 누적으로 단계 상승.
import type { Scene } from "./types";

export type RecoveryStep = "hint" | "hum" | "lead" | "solo" | "echo";
const STEPS: RecoveryStep[] = ["hint", "hum", "lead", "solo", "echo"]; // 밸런스④ lead(선창)→solo(혼자 시도, 독창 성취)→echo(최후 따라)

/** 연속 실패 횟수(0부터) → 회복 단계. 막힐수록 더 많은 도움. */
export function recoveryStep(failCount: number): RecoveryStep {
  const i = Math.min(Math.max(failCount, 0), STEPS.length - 1);
  return STEPS[i]!;
}

/** 단계별 회복 가이드. lead(선창)·echo(후창)는 모범답안을 들려준다. */
export function recoveryGuide(scene: Scene, step: RecoveryStep): string {
  const answer = scene.modelAnswer ?? scene.allowedExpressions[0] ?? "";
  switch (step) {
    case "hint":
      return `힌트: "${scene.intent}" 상황이에요.`;
    case "solo":
      return `선창을 들었어요. 이제 혼자 말해볼까요? (${scene.intent})`;
    case "hum":
      return "리듬을 먼저 흥얼거려 봐요 🎵";
    case "lead":
      return `선창: 「${answer}」`;
    case "echo":
      return `따라 말해봐요: 「${answer}」`;
  }
}
