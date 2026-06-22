import { describe, it, expect } from "vitest";
import { evaluateGate, PILOT_GATE } from "./releaseGate";

function fill(value: boolean): { tech: Record<string, boolean>; market: Record<string, boolean> } {
  const tech: Record<string, boolean> = {};
  const market: Record<string, boolean> = {};
  for (const c of PILOT_GATE) (c.kind === "tech" ? tech : market)[c.id] = value;
  return { tech, market };
}

describe("releaseGate (SSOT)", () => {
  it("모든 항목 충족 시 ready", () => {
    const r = evaluateGate(fill(true));
    expect(r.ready).toBe(true);
    expect(r.blocked).toHaveLength(0);
    expect(r.techScore).toBe(1);
    expect(r.marketScore).toBe(1);
  });

  it("아무것도 충족 안 하면 blocked 전체 + score 0", () => {
    const r = evaluateGate({ tech: {}, market: {} });
    expect(r.ready).toBe(false);
    expect(r.blocked.length).toBe(PILOT_GATE.filter((c) => c.required).length);
    expect(r.techScore).toBe(0);
    expect(r.marketScore).toBe(0);
  });

  it("기술만 충족·시장 미충족이면 still blocked, techScore=1", () => {
    const input = fill(false);
    for (const c of PILOT_GATE) if (c.kind === "tech") input.tech[c.id] = true;
    const r = evaluateGate(input);
    expect(r.ready).toBe(false);
    expect(r.techScore).toBe(1);
    expect(r.marketScore).toBe(0);
    expect(r.blocked.every((c) => c.kind === "market")).toBe(true);
  });

  it("게이트 항목은 tech 4 + market 4", () => {
    expect(PILOT_GATE.filter((c) => c.kind === "tech")).toHaveLength(4);
    expect(PILOT_GATE.filter((c) => c.kind === "market")).toHaveLength(4);
  });

  it("SSOT 항목 id 고정 — drift 가드(항목 추가/제거/개명 시 의식적으로)", () => {
    expect(PILOT_GATE.map((c) => c.id).sort()).toEqual([
      "alpha_filled", "d1_retention", "e2e_pipe", "engine_tests",
      "persistence", "voice_cache", "voice_comfort", "want_replay",
    ]);
  });

  it("모든 항목은 required(파일럿 게이트는 전원 통과 필요)", () => {
    expect(PILOT_GATE.every((c) => c.required)).toBe(true);
  });
});
