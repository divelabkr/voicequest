import { describe, it, expect } from "vitest";
import { deflectionTone, affinityPenalty, isHardBlock, needsDeflection } from "./safety";

describe("safety (안전 NPC — 흡수하되 종료 X)", () => {
  it("엉뚱한 말은 부드럽게, 반복하면 단호(종료 X)", () => {
    expect(deflectionTone("offtopic", 0)).toBe("gentle");
    expect(deflectionTone("offtopic", 2)).toBe("firm");
  });

  it("못된 말은 단호→냉각, 호감도 깎되 관계 유지", () => {
    expect(deflectionTone("inappropriate", 0)).toBe("firm");
    expect(deflectionTone("inappropriate", 2)).toBe("cold");
    expect(affinityPenalty("inappropriate")).toBe(-1);
  });

  it("harmful만 하드 게이트(나머지는 우아한 deflection)", () => {
    expect(isHardBlock("harmful")).toBe(true);
    expect(isHardBlock("inappropriate")).toBe(false);
    expect(affinityPenalty("harmful")).toBe(-2);
    expect(deflectionTone("harmful", 0)).toBe("cold");
  });

  it("normal은 흡수(페널티·deflection 없음)", () => {
    expect(needsDeflection("normal")).toBe(false);
    expect(needsDeflection("offtopic")).toBe(true);
    expect(needsDeflection(undefined)).toBe(false);
    expect(affinityPenalty("normal")).toBe(0);
  });
});
