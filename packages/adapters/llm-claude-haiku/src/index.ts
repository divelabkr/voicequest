// LlmPort 구현 — Claude 계열(Haiku/Sonnet) + Structured Outputs + Prompt Caching.
// 모델만 파라미터화: ClaudeLlm("claude-haiku-4-5") | ClaudeLlm("claude-sonnet-4-6").
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { JUDGE_RULES, sceneToPrompt } from "@voicequest/engine";
import type { LlmPort } from "@voicequest/engine/ports/Llm";
import type { JudgeInput, JudgeResult } from "@voicequest/engine/types";

const JudgeResultSchema = z.object({
  grade: z.enum(["S", "A", "B", "C"]),
  matched: z.array(z.string()),
  weaknessTags: z.array(
    z.enum(["pronunciation", "length", "naturalness", "politeness"]),
  ),
  affinityDelta: z.number().int(),
  nextSceneId: z.string(),
  reason: z.string(),
  category: z.enum(["normal", "offtopic", "inappropriate", "harmful"]),
});

function turnPrompt(input: JudgeInput): string {
  return [
    `유저 발화(전사): "${input.transcript}"`,
    `엄격도: ${input.strictness}`,
    `현재 호감도: ${input.affinity}`,
    input.modifier.tone ? `NPC 톤: ${input.modifier.tone}` : "",
    `위 골격으로 판정해 JudgeResult를 반환하라.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export class ClaudeLlm implements LlmPort {
  private client: Anthropic;
  private model: string;

  constructor(model: string = "claude-haiku-4-5", apiKey?: string) {
    this.model = model;
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 1024,
        system: [
          { type: "text", text: JUDGE_RULES },
          {
            type: "text",
            text: sceneToPrompt(input.scene),
            cache_control: { type: "ephemeral" }, // 같은 씬 매 턴 재사용 → 0.1x
          },
        ],
        messages: [{ role: "user", content: turnPrompt(input) }],
        output_config: { format: zodOutputFormat(JudgeResultSchema) },
      });
      const parsed = response.parsed_output;
      if (!parsed) throw new Error("structured_output_parse_failed");
      return parsed;
    } catch (_err) {
      return {
        grade: "C",
        matched: [],
        weaknessTags: [],
        affinityDelta: 0,
        nextSceneId: "recovery",
        reason: "llm_error",
        category: "normal",
      };
    }
  }
}
