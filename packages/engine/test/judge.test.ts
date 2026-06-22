import { describe, it, expect, vi } from "vitest";
import { judge } from "../src/judge";
import type { LlmPort } from "../src/ports/Llm";
import type { JudgeInput, JudgeResult, Scene } from "../src/types";

const scene: Scene = { id: "s1", intent: "인원 말하기", requiredSlots: [], allowedExpressions: ["一人です", "二人です"] };

const input = (transcript: string, sc: Scene = scene, sttConfidence = 0.9): JudgeInput => ({
  transcript, sttConfidence, scene: sc, modifier: {}, strictness: "normal", affinity: 0,
});

/** LLM 폴백 mock — 호출되면 카운트(fast-path가 LLM을 건너뛰는지 검증). */
function mockLlm(): LlmPort {
  const fn = vi.fn(
    async (): Promise<JudgeResult> => ({ grade: "B", matched: ["llm"], weaknessTags: [], affinityDelta: 0, nextSceneId: "next", reason: "llm_fallback", category: "normal" }),
  );
  return { judge: fn };
}

describe("judge — fast-path 실시간 최적화(정답 발화는 LLM 스킵)", () => {
  it("정중체 정확 매칭은 LLM 없이 즉시 S", async () => {
    const llm = mockLlm();
    const r = await judge(input("一人です"), llm);
    expect(llm.judge).not.toHaveBeenCalled(); // ★ LLM 스킵 = 실시간(STT 시간만)
    expect(r.grade).toBe("S");
    expect(r.reason).toBe("fast_exact_match");
    expect(r.matched).toEqual(["一人です"]);
    expect(r.affinityDelta).toBe(2);
  });

  it("반말 정확 매칭은 LLM 없이 A + politeness 약점", async () => {
    const casual: Scene = { ...scene, allowedExpressions: ["一人"] };
    const llm = mockLlm();
    const r = await judge(input("一人", casual), llm);
    expect(llm.judge).not.toHaveBeenCalled();
    expect(r.grade).toBe("A");
    expect(r.weaknessTags).toContain("politeness");
  });

  it("구두점·공백은 무시하고 매칭(즉시 S)", async () => {
    const llm = mockLlm();
    const r = await judge(input("一人 です。"), llm);
    expect(llm.judge).not.toHaveBeenCalled();
    expect(r.grade).toBe("S");
  });

  it("변형 발화(표면 다름)는 LLM 폴백으로 의미 판단", async () => {
    const llm = mockLlm();
    const r = await judge(input("ひとりですけど"), llm);
    expect(llm.judge).toHaveBeenCalledOnce(); // 정확 매칭 아님 → LLM이 의미 충족 판단
    expect(r.reason).toBe("llm_fallback");
  });

  it("OPIc challenge는 정확 매칭이어도 fast 스킵 → LLM rubric", async () => {
    const ch: Scene = { ...scene, challenge: { type: "opic", rubric: "긴 발화", minSentences: 3 } };
    const llm = mockLlm();
    await judge(input("一人です", ch), llm);
    expect(llm.judge).toHaveBeenCalledOnce(); // 자유 발화는 rubric 평가라 LLM 필수
  });

  it("낮은 STT 신뢰도는 fast 전에 recovery로 흡수", async () => {
    const llm = mockLlm();
    const r = await judge(input("一人です", scene, 0.3), llm);
    expect(llm.judge).not.toHaveBeenCalled();
    expect(r.nextSceneId).toBe("recovery");
  });
});
