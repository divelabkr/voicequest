// read model 집계 — 순수. 이벤트 소싱 로그 → 화면용 read model (CLAUDE.md §6).
import type {
  GameEvent,
  ReadModel,
  Stats6,
  WeaknessTag,
  Grade,
  JlptLevel,
  OpicRating,
  ExamReadiness,
} from "./types";
import { JLPT_LADDER } from "./opic";

function gv(g: Grade): number {
  return g === "S" ? 3 : g === "A" ? 2 : g === "B" ? 1 : 0;
}
const clamp = (x: number): number => Math.max(0, Math.min(100, Math.round(x)));

/** OPIc 챌린지 최고 등급 → 회화 레이팅 추정. 미도전이면 Novice Mid. */
function opicFromGrade(best: Grade | null): OpicRating {
  if (best === null) return "NM";
  if (best === "S") return "IH";
  if (best === "A") return "IM";
  if (best === "B") return "IL";
  return "NH"; // C
}

export function buildReadModel(events: GameEvent[], character = "daiki"): ReadModel {
  let turns = 0;
  let gradeScore = 0;
  let affinity = 0;
  const weak: Record<WeaknessTag, number> = { pronunciation: 0, length: 0, naturalness: 0, politeness: 0 };
  const unlocked: string[] = [];

  // 시험 역량 — 레벨별 통과/총, OPIc 챌린지 최고 등급
  const byLevel: Partial<Record<JlptLevel, { pass: number; total: number }>> = {};
  let opicBest: Grade | null = null;

  for (const e of events) {
    if (e.type === "turn_spoken") {
      turns++;
      gradeScore += gv(e.grade);
      for (const w of e.weakness) weak[w]++;

      if (e.level === "OPIc") {
        if (opicBest === null || gv(e.grade) > gv(opicBest)) opicBest = e.grade;
      } else if (e.level) {
        const slot = byLevel[e.level] ?? { pass: 0, total: 0 };
        slot.total++;
        if (gv(e.grade) >= 1) slot.pass++; // B 이상 = 통과
        byLevel[e.level] = slot;
      }
    } else if (e.type === "episode_clear") {
      affinity = e.affinity;
      if (!unlocked.includes(e.episodeId)) unlocked.push(e.episodeId);
    }
  }

  const base = turns ? (gradeScore / turns / 3) * 100 : 0;
  const pen = (c: number): number => (turns ? (c / turns) * 40 : 0);

  // 약점 태그 → stats6 매핑(잠정 — 학습 설계 후 정밀화)
  const stats6: Stats6 = {
    pronunciation: clamp(base - pen(weak.pronunciation)),
    naturalness: clamp(base - pen(weak.naturalness)),
    grammar: clamp(base - pen(weak.politeness)),
    speed: clamp(base - pen(weak.length)),
    vocabulary: clamp(base),
    challenge: clamp(base),
  };

  // JLPT 추정 = 통과율 임계(0.6)를 넘긴 가장 높은 레벨(사다리 오름차순 순회)
  let jlptEstimated: JlptLevel | "-" = "-";
  for (const lv of JLPT_LADDER) {
    const s = byLevel[lv];
    if (s && s.total > 0 && s.pass / s.total >= 0.6) jlptEstimated = lv;
  }

  const examReadiness: ExamReadiness = {
    jlpt: { estimated: jlptEstimated, byLevel },
    opic: { estimated: opicFromGrade(opicBest), best: opicBest ?? "-" },
  };

  return {
    stats6,
    affinity: { [character]: affinity },
    progress: { unlocked, streak: 0 },
    examReadiness,
  };
}
