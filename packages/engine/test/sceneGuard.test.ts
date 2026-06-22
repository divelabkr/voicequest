import { describe, it, expect } from "vitest";
import { validateGeneratedScene } from "../src/sceneGuard";

const base = { expectedIntent: "매운맛 추가 부탁", strictness: "normal" as const };

describe("validateGeneratedScene — 콘텐츠 공장 검수 게이트", () => {
  it("정상 씬은 ok(fail 없음)", () => {
    const r = validateGeneratedScene(
      { intent: "매운맛 추가 부탁", allowedExpressions: ["辛くして", "辛さ追加で", "もっと辛く"], beats: [{ kind: "npc", line: "いらっしゃい" }, { kind: "user" }] },
      base,
    );
    expect(r.ok).toBe(true);
    expect(r.flags.filter((f) => f.level === "fail")).toHaveLength(0);
  });

  it("intent가 흔들리면 fail(골격 이탈)", () => {
    const r = validateGeneratedScene({ intent: "라멘 주문", allowedExpressions: ["辛くして"], beats: [{ kind: "user" }] }, base);
    expect(r.ok).toBe(false);
    expect(r.flags.some((f) => f.code === "intent_drift")).toBe(true);
  });

  it("allowedExpressions가 비면 fail(판정 불가)", () => {
    const r = validateGeneratedScene({ intent: "매운맛 추가 부탁", allowedExpressions: [], beats: [{ kind: "user" }] }, base);
    expect(r.ok).toBe(false);
    expect(r.flags.some((f) => f.code === "expr_empty")).toBe(true);
  });

  it("일본어가 아닌 표현이면 fail", () => {
    const r = validateGeneratedScene({ intent: "매운맛 추가 부탁", allowedExpressions: ["make it spicy", "맵게 해줘"], beats: [{ kind: "user" }] }, base);
    expect(r.ok).toBe(false);
    expect(r.flags.some((f) => f.code === "expr_not_ja")).toBe(true);
  });

  it("user 비트가 없으면 음성 게이트 실패(fail)", () => {
    const r = validateGeneratedScene(
      { intent: "매운맛 추가 부탁", allowedExpressions: ["辛くして", "辛さ追加で", "もっと辛く"], beats: [{ kind: "npc", line: "x" }] },
      base,
    );
    expect(r.ok).toBe(false);
    expect(r.flags.some((f) => f.code === "no_user_beat")).toBe(true);
  });

  it("strict 밴드 초과는 warn으로만(ok 유지)", () => {
    const r = validateGeneratedScene(
      { intent: "x", allowedExpressions: ["辛くして", "辛さ追加で", "もっと辛く", "激辛で"], beats: [{ kind: "npc", line: "y" }, { kind: "user" }] },
      { expectedIntent: "x", strictness: "strict" },
    );
    expect(r.ok).toBe(true);
    expect(r.flags.some((f) => f.code === "expr_many" && f.level === "warn")).toBe(true);
  });
});
