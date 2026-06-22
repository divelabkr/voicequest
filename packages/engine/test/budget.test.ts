import { describe, it, expect } from "vitest";
import { emptyMeter, recordCall, checkBudget, rollMonth, DEFAULT_BUDGET } from "../src/budget";

describe("budget — 비용 거버넌스(⑥⑦⑧)", () => {
  it("recordCall이 카운트·추정비용을 누적", () => {
    let m = emptyMeter("2026-06");
    m = recordCall(m, "gen");
    m = recordCall(m, "gen");
    expect(m.calls.gen).toBe(2);
    expect(m.estUsd).toBeGreaterThan(0);
  });

  it("judge(로컬 Qwen)는 비용 0", () => {
    const m = recordCall(emptyMeter("2026-06"), "judge", 5);
    expect(m.calls.judge).toBe(5);
    expect(m.estUsd).toBe(0);
  });

  it("월이 바뀌면 카운터 리셋", () => {
    const m = recordCall(emptyMeter("2026-06"), "gen", 10);
    const r = rollMonth(m, "2026-07");
    expect(r.month).toBe("2026-07");
    expect(r.calls.gen).toBe(0);
    expect(r.estUsd).toBe(0);
  });

  it("같은 달이면 누적 유지", () => {
    const m = recordCall(emptyMeter("2026-06"), "gen", 3);
    expect(rollMonth(m, "2026-06").calls.gen).toBe(3);
  });

  it("예산 초과면 withinCap=false·alertLevel 3(차단)", () => {
    const m = { ...emptyMeter("2026-06"), estUsd: DEFAULT_BUDGET.monthlyUsdCap + 1 };
    const s = checkBudget(m);
    expect(s.withinCap).toBe(false);
    expect(s.alertLevel).toBe(3);
  });

  it("50% 도달 시 alertLevel 1, 80%서 2", () => {
    expect(checkBudget({ ...emptyMeter("2026-06"), estUsd: DEFAULT_BUDGET.monthlyUsdCap * 0.6 }).alertLevel).toBe(1);
    expect(checkBudget({ ...emptyMeter("2026-06"), estUsd: DEFAULT_BUDGET.monthlyUsdCap * 0.85 }).alertLevel).toBe(2);
  });
});
