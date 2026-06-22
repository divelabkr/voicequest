import { describe, it, expect } from "vitest";
import { buildReadModel } from "./readModel";
import type { GameEvent } from "./types";

describe("readModel", () => {
  it("이벤트 집계 → stats6·호감도·진행", () => {
    const events: GameEvent[] = [
      { type: "turn_spoken", sceneId: "s1", transcript: "", grade: "S", weakness: [], ts: 0 },
      { type: "turn_spoken", sceneId: "s2", transcript: "", grade: "A", weakness: ["pronunciation"], ts: 1 },
      { type: "episode_clear", episodeId: "ep_01", stars: 3, ending: "good", affinity: 5, ts: 2 },
    ];
    const rm = buildReadModel(events);
    expect(rm.affinity.daiki).toBe(5);
    expect(rm.progress.unlocked).toContain("ep_01");
    // 발음 약점이 반영돼 pronunciation < vocabulary
    expect(rm.stats6.pronunciation).toBeLessThan(rm.stats6.vocabulary);
  });

  it("빈 로그는 0점", () => {
    const rm = buildReadModel([]);
    expect(rm.stats6.vocabulary).toBe(0);
    expect(rm.progress.unlocked).toHaveLength(0);
  });

  it("레벨별 통과 집계 → 시험 역량 추정(JLPT 간접 + OPIc 직접)", () => {
    const events: GameEvent[] = [
      { type: "turn_spoken", sceneId: "s1", transcript: "", grade: "S", weakness: [], level: "N5", ts: 0 },
      { type: "turn_spoken", sceneId: "s2", transcript: "", grade: "A", weakness: [], level: "N5", ts: 1 },
      { type: "turn_spoken", sceneId: "s7", transcript: "", grade: "S", weakness: [], level: "OPIc", ts: 2 },
    ];
    const rm = buildReadModel(events);
    expect(rm.examReadiness.jlpt.estimated).toBe("N5");
    expect(rm.examReadiness.jlpt.byLevel.N5).toEqual({ pass: 2, total: 2 });
    expect(rm.examReadiness.opic.best).toBe("S");
    expect(rm.examReadiness.opic.estimated).toBe("IH"); // S → Intermediate High
  });

  it("OPIc 미도전이면 Novice, 통과 레벨 없으면 estimated '-'", () => {
    const rm = buildReadModel([]);
    expect(rm.examReadiness.opic.estimated).toBe("NM");
    expect(rm.examReadiness.opic.best).toBe("-");
    expect(rm.examReadiness.jlpt.estimated).toBe("-");
  });

  it("통과율이 임계 미만이면 그 레벨은 미확보", () => {
    const events: GameEvent[] = [
      { type: "turn_spoken", sceneId: "s1", transcript: "", grade: "C", weakness: [], level: "N4", ts: 0 },
      { type: "turn_spoken", sceneId: "s2", transcript: "", grade: "C", weakness: [], level: "N4", ts: 1 },
      { type: "turn_spoken", sceneId: "s3", transcript: "", grade: "B", weakness: [], level: "N4", ts: 2 },
    ];
    const rm = buildReadModel(events);
    expect(rm.examReadiness.jlpt.estimated).toBe("-"); // 1/3 통과 < 0.6
    expect(rm.examReadiness.jlpt.byLevel.N4).toEqual({ pass: 1, total: 3 });
  });
});
