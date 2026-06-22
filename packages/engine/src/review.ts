// 적응형 분기 복습 — 순수. 골격 고정 + 변주로 회차마다 다른 질문(다중세계).
// 드릴화 이탈 + 콘텐츠 트레드밀을 동시 완화. 무한 난이도↑는 좌절이라 캡(strictness 밴드).
import type { Grade, SceneLevel } from "./types";
import { JLPT_LADDER } from "./opic";

/** 등급 → 별점(복습 만족도 표기). S=3 A=2 B=1 C=0 */
export function scoreToStars(grade: Grade): number {
  return grade === "S" ? 3 : grade === "A" ? 2 : grade === "B" ? 1 : 0;
}

/** 복습 분기 — 잘하면(S/A) 다음 회차 난이도↑, 막히면 같은 밴드 재도전(좌절 방지). 정점은 OPIc 캡. */
export function branchUp(grade: Grade, current: SceneLevel): SceneLevel {
  if (current === "OPIc") return "OPIc";
  const i = JLPT_LADDER.indexOf(current);
  if (i < 0 || (grade !== "S" && grade !== "A")) return current;
  if (i >= JLPT_LADDER.length - 1) return "OPIc";
  return JLPT_LADDER[i + 1]!;
}

/** 세계선 식별 — 회차별 등급 경로(어느 분기로 갈렸는지). "외운 답이 안 통한다"의 가시화. */
export function worldlineId(grades: Grade[]): string {
  return grades.length ? grades.join("") : "start";
}
