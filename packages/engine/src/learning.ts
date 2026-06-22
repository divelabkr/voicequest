// 학습/리텐션 신호 — 순수. 이벤트에서 D1 첫 세션 신호 추출(redteam: "D1 방어가 생사").
// 새 이벤트 없이 기존 turn_spoken/scene_advance에서 가벼운 휴리스틱(콜드스타트 → 규칙 기반).
import type { GameEvent, Grade } from "./types";

function gv(g: Grade): number {
  return g === "S" ? 3 : g === "A" ? 2 : g === "B" ? 1 : 0;
}

/** 첫 '통했다'(S/A)까지 턴 수. 없으면 null(아직 첫 성공 X). D1 리텐션 최강 예측 신호. */
export function timeToFirstWin(events: GameEvent[]): number | null {
  let turn = 0;
  for (const e of events) {
    if (e.type === "turn_spoken") {
      turn++;
      if (gv(e.grade) >= 2) return turn; // S 또는 A
    }
  }
  return null;
}

/** 마지막으로 머문 씬(이탈 지점) — 어느 씬에서 멈추는지 집계용. */
export function dropPoint(events: GameEvent[]): string | null {
  let last: string | null = null;
  for (const e of events) {
    if (e.type === "scene_advance") last = e.to;
    else if (e.type === "turn_spoken") last = e.sceneId;
  }
  return last;
}

/** 이탈위험 — 최근 등급 정체(다 C)면 high. 가벼운 휴리스틱(데이터 쌓이면 정밀화). */
export function churnRisk(events: GameEvent[]): "low" | "high" {
  const turns = events.filter((e): e is Extract<GameEvent, { type: "turn_spoken" }> => e.type === "turn_spoken");
  if (turns.length < 3) return "low";
  const recent = turns.slice(-4);
  const avg = recent.reduce((a, t) => a + gv(t.grade), 0) / recent.length;
  return avg <= 0.5 ? "high" : "low";
}
