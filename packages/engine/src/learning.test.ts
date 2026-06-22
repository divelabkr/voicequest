import { describe, it, expect } from "vitest";
import { timeToFirstWin, dropPoint, churnRisk } from "./learning";
import type { GameEvent } from "./types";

const spoken = (sceneId: string, grade: "S" | "A" | "B" | "C", ts: number): GameEvent => ({
  type: "turn_spoken",
  sceneId,
  transcript: "",
  grade,
  weakness: [],
  ts,
});

describe("learning (D1 첫 세션 신호)", () => {
  it("첫 S/A까지 턴 수(time-to-first-win)", () => {
    expect(timeToFirstWin([spoken("s1", "C", 0), spoken("s1", "S", 1)])).toBe(2);
    expect(timeToFirstWin([spoken("s1", "C", 0)])).toBe(null);
    expect(timeToFirstWin([])).toBe(null);
  });

  it("이탈 지점(마지막 머문 씬)", () => {
    const ev: GameEvent[] = [spoken("s1", "S", 0), { type: "scene_advance", from: "s1", to: "s2", ts: 1 }];
    expect(dropPoint(ev)).toBe("s2");
    expect(dropPoint([])).toBe(null);
  });

  it("이탈위험 — 최근 다 C면 high, 데이터 적으면 low", () => {
    expect(churnRisk([spoken("s", "C", 0), spoken("s", "C", 1), spoken("s", "C", 2), spoken("s", "C", 3)])).toBe("high");
    expect(churnRisk([spoken("s", "S", 0), spoken("s", "S", 1), spoken("s", "A", 2)])).toBe("low");
    expect(churnRisk([])).toBe("low");
  });
});
