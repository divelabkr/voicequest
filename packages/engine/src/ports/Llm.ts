// LlmPort — 엔진은 구현이 아니라 이 계약에만 의존 (CLAUDE.md §3, §7)
// 구현체는 packages/adapters/llm-claude-haiku 등에서 주입.
import type { JudgeInput, JudgeResult } from "../types";

export interface LlmPort {
  /** 전사 vs 허용 표현 골격 판정. 자유 생성 금지 — 골격 기준 등급만 */
  judge(input: JudgeInput): Promise<JudgeResult>;
}
