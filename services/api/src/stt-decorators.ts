// SttPort 데코레이터 — STT 외부 의존(Deepgram) 단일점 제거(장애 대처). LlmPort FallbackLlm과 동일 패턴.
// bootstrap에서 조립: FallbackStt(DeepgramStt, GeminiStt). session·turn은 그대로(포트 뒤).
import type { SttPort, Transcript } from "@voicequest/engine";

/**
 * STT 폴백 — 1순위(Deepgram) 실패·빈 전사 시 2순위(Gemini)로 재시도.
 * 음성 입력은 핵심 게이트라 단일 의존이 곧 서비스 마비 → 공급자 폴백으로 가용성 확보.
 */
export class FallbackStt implements SttPort {
  constructor(private readonly primary: SttPort, private readonly fallback: SttPort) {}

  async transcribe(audio: ArrayBuffer, lang: "ja"): Promise<Transcript> {
    try {
      const r = await this.primary.transcribe(audio, lang);
      if (r.text.trim()) return r; // 빈 전사가 아니면 1순위 사용
      return await this.fallback.transcribe(audio, lang); // 빈 전사 → 폴백 재시도
    } catch {
      return await this.fallback.transcribe(audio, lang); // 1순위 장애 → 폴백
    }
  }
}
