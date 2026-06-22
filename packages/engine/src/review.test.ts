import { describe, it, expect } from "vitest";
import { scoreToStars, branchUp, worldlineId } from "./review";

describe("review (적응형 분기 복습)", () => {
  it("등급 → 별점", () => {
    expect(scoreToStars("S")).toBe(3);
    expect(scoreToStars("B")).toBe(1);
    expect(scoreToStars("C")).toBe(0);
  });

  it("잘하면 난이도↑, 막히면 제자리(좌절 방지)", () => {
    expect(branchUp("S", "N5")).toBe("N4");
    expect(branchUp("A", "N4")).toBe("N3");
    expect(branchUp("C", "N5")).toBe("N5"); // 막히면 제자리
    expect(branchUp("S", "N1")).toBe("OPIc"); // 정점으로
    expect(branchUp("A", "OPIc")).toBe("OPIc"); // 캡
  });

  it("세계선 — 등급 경로 가시화", () => {
    expect(worldlineId(["S", "A", "S"])).toBe("SAS");
    expect(worldlineId([])).toBe("start");
  });
});
