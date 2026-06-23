import { describe, it, expect } from "vitest";
import { sceneStats } from "../src/content-stats";
import type { GameEvent } from "../src/types";

const turn = (sceneId: string, grade: "S" | "A" | "B" | "C", weakness: ("pronunciation" | "length" | "naturalness" | "politeness")[] = []): GameEvent =>
  ({ type: "turn_spoken", sceneId, transcript: "x", grade, weakness, ts: 0 });

describe("sceneStats — 콘텐츠 피드백(씬별 오답률 집계)", () => {
  it("씬별 시도·통과율·C율 집계", () => {
    const ev: GameEvent[] = [turn("s1", "S"), turn("s1", "C"), turn("s1", "A"), turn("s2", "B")];
    const stats = sceneStats(ev);
    const s1 = stats.find((s) => s.sceneId === "s1")!;
    expect(s1.attempts).toBe(3);
    expect(s1.passRate).toBeCloseTo(2 / 3); // S·A 통과, C 실패
    expect(s1.cRate).toBeCloseTo(1 / 3);
  });

  it("cRate 내림차순 — 가장 어려운 씬 먼저(콘텐츠 개선 우선순위)", () => {
    const ev: GameEvent[] = [turn("easy", "S"), turn("easy", "A"), turn("hard", "C"), turn("hard", "C"), turn("hard", "A")];
    const stats = sceneStats(ev);
    expect(stats[0]!.sceneId).toBe("hard"); // cRate 2/3 > 0
  });

  it("최다 약점 태그 집계(보강 방향)", () => {
    const ev: GameEvent[] = [turn("s1", "B", ["politeness"]), turn("s1", "B", ["politeness", "length"]), turn("s1", "A", ["pronunciation"])];
    expect(sceneStats(ev).find((s) => s.sceneId === "s1")!.topWeakness).toBe("politeness");
  });

  it("turn_spoken 외 이벤트는 무시", () => {
    const ev: GameEvent[] = [turn("s1", "S"), { type: "energy_spent", amount: 1, ts: 0 }];
    expect(sceneStats(ev)).toHaveLength(1);
  });
});
