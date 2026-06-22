// OPIc 동적 난이도 + 난이도 사다리 — 순수.
// strictness: 최근 등급으로 판정 엄격도 조정(잘하면 올려 도전, 막히면 내려 좌절 방지).
// 사다리: 레벨별 통과 이력으로 "다음 도전 권장 레벨"을 산출(추천 레이어 — 골격 전이는 안 흔듦).
import type { Strictness, Grade, SceneLevel, JlptLevel } from "./types";

function gradeValue(g: Grade): number {
  return g === "S" ? 3 : g === "A" ? 2 : g === "B" ? 1 : 0;
}

/** JLPT 난이도 사다리(오름차순). OPIc은 회화 정점이라 사다리 밖 별도. */
export const JLPT_LADDER: readonly JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

/** B 이상 = 통과 */
const isPass = (g: Grade): boolean => gradeValue(g) >= 1;
const PASS_RATE = 0.6;

/** 씬 레벨이 기준(N3)보다 쉬우면 +(더 깐깐히 도전), 어려우면 -(흡수). */
function levelBias(level?: SceneLevel): number {
  switch (level) {
    case "N5": return +0.4;
    case "N4": return +0.2;
    case "N2": return -0.2;
    case "N1": return -0.4;
    case "OPIc": return -0.6;
    default: return 0; // N3 또는 미지정 = 기준
  }
}

/** 최근 등급 평균(+ 씬 레벨 가중)으로 엄격도 결정. level 미지정이면 기존 동작과 동일. */
export function adjustStrictness(recent: Grade[], level?: SceneLevel): Strictness {
  if (recent.length === 0) return "normal";
  const avg = recent.reduce((a, g) => a + gradeValue(g), 0) / recent.length + levelBias(level);
  if (avg >= 2.3) return "strict";
  if (avg <= 0.8) return "lenient";
  return "normal";
}

/**
 * 레벨별 통과 이력으로 다음 도전 권장 레벨을 산출.
 * - OPIc 챌린지를 S/A로 통과 → 회화 정점("OPIc") 권장
 * - 아니면 통과율 임계를 넘긴 가장 높은 JLPT 레벨의 "다음" 단계(이미 N1이면 OPIc)
 * - 아무것도 못 굳혔으면 기초("N5")부터
 */
export function recommendLevel(history: { level: SceneLevel; grade: Grade }[]): SceneLevel {
  if (history.length === 0) return "N5";

  const opicRuns = history.filter((h) => h.level === "OPIc");
  if (opicRuns.some((h) => h.grade === "S" || h.grade === "A")) return "OPIc";

  let secured = -1;
  JLPT_LADDER.forEach((lv, i) => {
    const runs = history.filter((h) => h.level === lv);
    if (runs.length === 0) return;
    const rate = runs.filter((h) => isPass(h.grade)).length / runs.length;
    if (rate >= PASS_RATE) secured = Math.max(secured, i);
  });

  if (secured < 0) return "N5";
  if (secured >= JLPT_LADDER.length - 1) return "OPIc";
  return JLPT_LADDER[secured + 1]!;
}
