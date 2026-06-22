import { describe, it, expect } from "vitest";
import { canStart, spend, recharge } from "./energy";

describe("energy", () => {
  it("소비/충전은 [0, max]로 클램프", () => {
    const e = { current: 3, max: 5 };
    expect(spend(e, 1).current).toBe(2);
    expect(spend(e, 10).current).toBe(0);
    expect(recharge(e, 10).current).toBe(5);
  });

  it("0이면 시작 불가", () => {
    expect(canStart({ current: 0, max: 5 })).toBe(false);
    expect(canStart({ current: 1, max: 5 })).toBe(true);
  });
});
