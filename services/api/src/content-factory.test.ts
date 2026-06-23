import { describe, it, expect } from "vitest";
import { buildBatchBody } from "./content-factory";

describe("content-factory — Anthropic Batch(콘텐츠 공장 비용 50%↓)", () => {
  it("변주 프롬프트를 batch 요청 형식으로 빌드", () => {
    const body = buildBatchBody([{ customId: "s1_v1", prompt: "변주1" }, { customId: "s1_v2", prompt: "변주2" }]);
    expect(body.requests).toHaveLength(2);
    const first = body.requests[0] as { custom_id: string; params: { model: string; messages: { content: string }[] } };
    expect(first.custom_id).toBe("s1_v1");
    expect(first.params.messages[0]!.content).toBe("변주1");
    expect(first.params.model).toBe("claude-haiku-4-5");
  });

  it("모델 오버라이드", () => {
    const body = buildBatchBody([{ customId: "x", prompt: "p" }], "claude-opus-4-8");
    expect((body.requests[0] as { params: { model: string } }).params.model).toBe("claude-opus-4-8");
  });
});
