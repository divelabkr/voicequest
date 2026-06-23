import { describe, it, expect, vi } from "vitest";
import { CachedLlm, FallbackLlm } from "./llm-decorators";
import type { JudgeInput, JudgeResult } from "@voicequest/engine";

const input = (t: string): JudgeInput => ({ transcript: t, sttConfidence: 0.9, scene: { id: "s1", intent: "x", requiredSlots: [], allowedExpressions: [] }, modifier: {}, strictness: "normal", affinity: 0 });
const result = (reason = "ok"): JudgeResult => ({ grade: "A", matched: [], weaknessTags: [], affinityDelta: 1, nextSceneId: "next", reason, category: "normal" });

describe("CachedLlm — judge 결과 캐시(반복 발화 0초·0원)", () => {
  it("같은 입력은 inner LLM 1회만(2번째는 캐시)", async () => {
    const inner = { judge: vi.fn(async () => result()) };
    const c = new CachedLlm(inner);
    await c.judge(input("一人"));
    await c.judge(input("一人"));
    expect(inner.judge).toHaveBeenCalledOnce();
  });
  it("다른 입력은 각각 호출", async () => {
    const inner = { judge: vi.fn(async () => result()) };
    const c = new CachedLlm(inner);
    await c.judge(input("一人"));
    await c.judge(input("二人"));
    expect(inner.judge).toHaveBeenCalledTimes(2);
  });
  it("공백 무시하고 같은 발화로 캐시", async () => {
    const inner = { judge: vi.fn(async () => result()) };
    const c = new CachedLlm(inner);
    await c.judge(input("一人 です"));
    await c.judge(input("一人です"));
    expect(inner.judge).toHaveBeenCalledOnce();
  });
});

describe("FallbackLlm — 품질 폴백(무료 우선, 저신뢰만 Haiku)", () => {
  it("primary 성공이면 fallback 미호출(무료 유지)", async () => {
    const primary = { judge: vi.fn(async () => result("ok")) };
    const fallback = { judge: vi.fn(async () => result("haiku")) };
    const r = await new FallbackLlm(primary, fallback).judge(input("x"));
    expect(r.reason).toBe("ok");
    expect(fallback.judge).not.toHaveBeenCalled();
  });
  it("primary parse 실패 → fallback 품질 재판정", async () => {
    const primary = { judge: vi.fn(async () => result("parse")) };
    const fallback = { judge: vi.fn(async () => result("haiku")) };
    const r = await new FallbackLlm(primary, fallback).judge(input("x"));
    expect(r.reason).toBe("haiku");
    expect(fallback.judge).toHaveBeenCalledOnce();
  });
  it("primary throw → fallback", async () => {
    const primary = { judge: vi.fn(async () => { throw new Error("ollama_down"); }) };
    const fallback = { judge: vi.fn(async () => result("haiku")) };
    const r = await new FallbackLlm(primary, fallback).judge(input("x"));
    expect(r.reason).toBe("haiku");
  });
});
