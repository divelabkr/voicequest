// LlmPort 구현 — Qwen. **파일럿 측정용 + 코딩용**(프로덕션 런타임 채택은 별도 결정).
// OpenAI 호환 엔드포인트: 로컬 Ollama(키 0·데이터 로컬) / 클라우드 DashScope·OpenRouter.
import OpenAI from "openai";
import { JUDGE_RULES, sceneToPrompt } from "@voicequest/engine";
import type { LlmPort } from "@voicequest/engine/ports/Llm";
import type { JudgeInput, JudgeResult } from "@voicequest/engine/types";

const DEFAULT_MODEL = "qwen-plus";
const DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export interface QwenOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class QwenLlm implements LlmPort {
  private client: OpenAI;
  private model: string;

  constructor(opts: QwenOptions = {}) {
    this.model = opts.model ?? DEFAULT_MODEL;
    this.client = new OpenAI({
      baseURL: opts.baseURL ?? DEFAULT_BASE_URL,
      apiKey: opts.apiKey ?? "",
    });
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: JUDGE_RULES },
          {
            role: "user",
            content: `${sceneToPrompt(input.scene)}\n유저 발화: "${input.transcript}" / 엄격도:${input.strictness} / 호감도:${input.affinity}`,
          },
        ],
        response_format: { type: "json_object" },
      });
      const text = res.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(text) as JudgeResult;
      if (!parsed.grade) throw new Error("qwen_parse_failed");
      return parsed;
    } catch {
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
