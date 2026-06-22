import { describe, it, expect } from "vitest";
import { recoveryStep, recoveryGuide } from "./recovery";
import { adjustStrictness, recommendLevel } from "./opic";
import type { Scene, SceneLevel, Grade } from "./types";

/** 테스트용 이력 빌더(타입 안전) */
const hist = (...pairs: [SceneLevel, Grade][]) =>
  pairs.map(([level, grade]) => ({ level, grade }));

describe("recovery", () => {
  it("실패 누적으로 단계 상승(상한 echo)", () => {
    expect(recoveryStep(0)).toBe("hint");
    expect(recoveryStep(2)).toBe("lead");
    expect(recoveryStep(9)).toBe("echo");
  });

  it("선창은 모범답안을 들려준다", () => {
    const scene: Scene = {
      id: "s",
      intent: "i",
      requiredSlots: [],
      allowedExpressions: ["X"],
      modelAnswer: "正解です",
    };
    expect(recoveryGuide(scene, "lead")).toContain("正解です");
  });
});

describe("opic", () => {
  it("잘하면 strict, 막히면 lenient, 중간은 normal", () => {
    expect(adjustStrictness(["S", "S", "A"])).toBe("strict");
    expect(adjustStrictness(["C", "C", "C"])).toBe("lenient");
    expect(adjustStrictness(["A", "B"])).toBe("normal");
    expect(adjustStrictness([])).toBe("normal");
  });

  it("같은 성적이라도 쉬운 레벨은 더 깐깐(strict), 어려운 레벨은 흡수(lenient)", () => {
    expect(adjustStrictness(["A", "A"])).toBe("normal"); // avg 2.0, 기준
    expect(adjustStrictness(["A", "A"], "N5")).toBe("strict"); // 2.0+0.4
    expect(adjustStrictness(["B", "B"], "OPIc")).toBe("lenient"); // 1.0-0.6
  });
});

describe("난이도 사다리(recommendLevel)", () => {
  it("이력 없으면 기초 N5", () => {
    expect(recommendLevel([])).toBe("N5");
  });

  it("N5 통과율이 높으면 다음 단계 N4 권장", () => {
    expect(recommendLevel(hist(["N5", "S"], ["N5", "A"], ["N5", "B"]))).toBe("N4");
  });

  it("OPIc 챌린지를 S/A로 통과하면 회화 정점 권장", () => {
    expect(recommendLevel(hist(["OPIc", "S"]))).toBe("OPIc");
  });

  it("통과율 미달이면 아직 못 굳혀 기초부터 재도전", () => {
    expect(recommendLevel(hist(["N5", "C"], ["N5", "C"]))).toBe("N5");
  });

  it("N1까지 굳히면 회화 정점(OPIc)으로", () => {
    expect(recommendLevel(hist(["N1", "S"], ["N1", "A"]))).toBe("OPIc");
  });
});
