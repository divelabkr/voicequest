// 콘텐츠 피드백 — 전체 유저 이벤트를 씬별로 집계(어느 씬이 어렵나 → 난이도·콘텐츠 개선).
// 데이터 재활용: turn_spoken을 개인 readModel과 별개로 "콘텐츠 품질" 신호로 재사용(장기 해자).
import type { GameEvent, WeaknessTag } from "./types";

export interface SceneStat {
  sceneId: string;
  attempts: number; // 총 시도
  passRate: number; // B 이상 비율(0~1)
  cRate: number; // C(미충족) 비율 — 높을수록 어렵거나 골격이 모호한 씬
  topWeakness?: WeaknessTag; // 최다 약점(발음/길이/자연도/정중함)
}

/**
 * 씬별 오답률 집계 — cRate 내림차순(가장 어려운 씬 먼저). 콘텐츠 개선 우선순위.
 * 해석: cRate 높음 = 난이도 과하거나 allowedExpressions 골격이 좁음 → 작가가 변주/힌트 보강.
 */
export function sceneStats(events: GameEvent[]): SceneStat[] {
  const byScene = new Map<string, { total: number; pass: number; weak: Map<WeaknessTag, number> }>();
  for (const e of events) {
    if (e.type !== "turn_spoken") continue;
    const s = byScene.get(e.sceneId) ?? { total: 0, pass: 0, weak: new Map<WeaknessTag, number>() };
    s.total++;
    if (e.grade === "S" || e.grade === "A" || e.grade === "B") s.pass++;
    for (const w of e.weakness) s.weak.set(w, (s.weak.get(w) ?? 0) + 1);
    byScene.set(e.sceneId, s);
  }
  return [...byScene.entries()]
    .map(([sceneId, s]) => ({
      sceneId,
      attempts: s.total,
      passRate: s.total ? s.pass / s.total : 0,
      cRate: s.total ? (s.total - s.pass) / s.total : 0,
      topWeakness: [...s.weak.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
    }))
    .sort((a, b) => b.cRate - a.cRate);
}
