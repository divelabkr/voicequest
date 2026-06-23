// LlmPort 데코레이터 — 횡단 관심사(캐시·품질 폴백)를 judge() 밖, 포트 뒤로 응집(흩어짐 방지).
// bootstrap에서 체인으로 조립: CachedLlm(FallbackLlm(Qwen, Haiku)). engine·session·turn은 그대로.
import type { LlmPort, JudgeInput, JudgeResult } from "@voicequest/engine";

/**
 * judge 결과 캐시 — (scene·strictness·affinity·transcript) 동일하면 LLM 재호출 0.
 * 효과: 반복 변형 발화의 레이턴시(2.7s)·비용을 0으로(실시간+캐시+비용 3축 동시).
 * fast-path(정확매칭)는 이미 코드라 여기 안 옴 → 캐시 대상은 LLM 폴백뿐.
 */
export class CachedLlm implements LlmPort {
  private readonly cache = new Map<string, JudgeResult>();
  constructor(private readonly inner: LlmPort, private readonly max = 1000) {}

  async judge(input: JudgeInput): Promise<JudgeResult> {
    const key = `${input.scene.id}|${input.strictness}|${input.affinity}|${input.transcript.replace(/\s+/g, "")}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r = await this.inner.judge(input);
    // LRU 근사 — 가장 오래된(첫) 키 제거
    if (this.cache.size >= this.max) { const first = this.cache.keys().next().value; if (first !== undefined) this.cache.delete(first); }
    this.cache.set(key, r);
    return r;
  }
}

/**
 * 품질 폴백 — 1순위(무료 Qwen) 실패·저신뢰 시 2순위(Haiku 품질)로 재판정.
 * 비용은 무료 우선으로 지키되, coder 모델이 흔들리는 케이스만 품질 모델이 받친다(최저가+최고품질).
 */
export class FallbackLlm implements LlmPort {
  constructor(private readonly primary: LlmPort, private readonly fallback: LlmPort) {}

  async judge(input: JudgeInput): Promise<JudgeResult> {
    try {
      const r = await this.primary.judge(input);
      // 저신뢰 휴리스틱 — 파싱 실패 흔적이면 품질 모델로 재판정(무관 발화는 정상 흐름이라 제외)
      if (r.reason === "parse" || r.reason === "parse_fail" || r.reason === "llm_error") {
        return await this.fallback.judge(input);
      }
      return r;
    } catch {
      return await this.fallback.judge(input);
    }
  }
}
