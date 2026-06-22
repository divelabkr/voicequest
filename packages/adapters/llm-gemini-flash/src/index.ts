// LlmPort 구현(stub) — Gemini Flash. judge 모델 스파이크의 "다크호스".
// ⚠️ stub: @google/genai SDK·모델명·responseSchema 정확 API는 착수 시 재검증.
import { GoogleGenAI } from "@google/genai";
import { JUDGE_RULES, sceneToPrompt } from "@voicequest/engine";
import type { LlmPort } from "@voicequest/engine/ports/Llm";
import type { JudgeInput, JudgeResult } from "@voicequest/engine/types";

const GEMINI_FLASH_MODEL = "gemini-flash-latest";

const JUDGE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    grade: { type: "string", enum: ["S", "A", "B", "C"] },
    matched: { type: "array", items: { type: "string" } },
    weaknessTags: {
      type: "array",
      items: {
        type: "string",
        enum: ["pronunciation", "length", "naturalness", "politeness"],
      },
    },
    affinityDelta: { type: "integer" },
    nextSceneId: { type: "string" },
    reason: { type: "string" },
  },
  required: ["grade", "matched", "weaknessTags", "affinityDelta", "nextSceneId", "reason"],
} as const;

function buildPrompt(input: JudgeInput): string {
  return [
    JUDGE_RULES,
    sceneToPrompt(input.scene),
    `유저 발화(전사): "${input.transcript}" / 엄격도: ${input.strictness} / 호감도: ${input.affinity}`,
  ].join("\n");
}

export class GeminiFlashLlm implements LlmPort {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    this.ai = new GoogleGenAI(apiKey ? { apiKey } : {});
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    try {
      const response = await this.ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: buildPrompt(input),
        config: {
          responseMimeType: "application/json",
          responseSchema: JUDGE_RESPONSE_SCHEMA,
        },
      });
      const parsed = JSON.parse(response.text ?? "{}") as JudgeResult;
      if (!parsed.grade) throw new Error("gemini_parse_failed");
      return parsed;
    } catch (_err) {
      return {
        grade: "C",
        matched: [],
        weaknessTags: [],
        affinityDelta: 0,
        nextSceneId: "recovery",
        reason: "llm_error",
      };
    }
  }
}
