import { describe, it, expect } from "vitest";
import { initState, advance } from "./stateMachine";
import { parseEpisode } from "./episode";
import { recoveryStep } from "./recovery";
import type { JudgeResult } from "./types";

const ep = parseEpisode({
  id: "test",
  title: "t",
  character: "daiki",
  scenes: [
    { id: "s1", intent: "i1", requiredSlots: [], allowedExpressions: ["a"], nextSceneId: "s2" },
    { id: "s2", intent: "i2", requiredSlots: [], allowedExpressions: ["b"] },
  ],
  endings: [
    { id: "good", minAffinity: 5, title: "g" },
    { id: "ok", minAffinity: 0, title: "o" },
  ],
});

function res(over: Partial<JudgeResult> = {}): JudgeResult {
  return {
    grade: "A",
    matched: ["a"],
    weaknessTags: [],
    affinityDelta: 1,
    nextSceneId: "next",
    reason: "",
    ...over,
  };
}

describe("stateMachine", () => {
  it("초기 상태는 첫 씬", () => {
    const s = initState(ep);
    expect(s.currentSceneId).toBe("s1");
    expect(s.affinity).toBe(0);
    expect(s.done).toBe(false);
  });

  it("충족 시 다음 씬 진행 + 호감도 누적", () => {
    const { state, events } = advance(initState(ep), res({ affinityDelta: 2 }), ep, 0);
    expect(state.currentSceneId).toBe("s2");
    expect(state.affinity).toBe(2);
    expect(events.some((e) => e.type === "scene_advance")).toBe(true);
  });

  it("recovery 시 제자리 유지(흡수)", () => {
    const { state } = advance(initState(ep), res({ nextSceneId: "recovery" }), ep, 0);
    expect(state.currentSceneId).toBe("s1");
    expect(state.recoveryFail).toBe(1); // W6 — 첫 실패 누적
  });

  it("recovery 연속 시 recoveryFail 누적 → recoveryStep 단계 상승(W6: 막힐수록 도움)", () => {
    let s = initState(ep);
    s = advance(s, res({ nextSceneId: "recovery" }), ep, 0).state;
    s = advance(s, res({ nextSceneId: "recovery" }), ep, 1).state;
    expect(s.recoveryFail).toBe(2);
    expect(recoveryStep(s.recoveryFail - 1)).toBe("hum"); // 0→hint,1→hum,2→lead
  });

  it("recovery 후 충족 시 recoveryFail 리셋(통과하면 0)", () => {
    let s = advance(initState(ep), res({ nextSceneId: "recovery" }), ep, 0).state;
    expect(s.recoveryFail).toBe(1);
    s = advance(s, res({ affinityDelta: 1 }), ep, 1).state; // 충족 s1→s2
    expect(s.recoveryFail).toBe(0);
    expect(s.currentSceneId).toBe("s2");
  });

  it("마지막 씬 충족 시 클리어 + 호감도 엔딩 분기", () => {
    let s = advance(initState(ep), res({ affinityDelta: 3 }), ep, 0).state; // s1→s2
    const { state, events } = advance(s, res({ affinityDelta: 3, grade: "S" }), ep, 1); // s2→clear
    expect(state.done).toBe(true);
    expect(state.ending).toBe("good"); // affinity 6 ≥ 5
    expect(events.some((e) => e.type === "episode_clear")).toBe(true);
  });
});
