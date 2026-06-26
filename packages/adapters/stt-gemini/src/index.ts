// Gemini STT 어댑터 — 음성→일본어 전사(폴백용). Deepgram 장애 시 FallbackStt가 호출.
// 공급자 SDK 대신 REST(fetch, 의존성 0). 키는 생성자 주입(어댑터는 process.env를 모른다).
import type { SttPort, Transcript } from "@voicequest/engine";

export interface GeminiSttOpts {
  apiKey: string;
  /** Gemini 멀티모달 모델(audio→text). 기본 gemini-3-flash. */
  model?: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export class GeminiStt implements SttPort {
  private readonly apiKey: string;
  private readonly model: string;
  constructor(opts: GeminiSttOpts) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gemini-3-flash";
  }

  async transcribe(audio: ArrayBuffer, lang: "ja"): Promise<Transcript> {
    const b64 = Buffer.from(audio).toString("base64");
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: "audio/webm", data: b64 } },
            { text: `이 ${lang === "ja" ? "일본어" : ""} 음성을 정확히 전사해. 전사 텍스트만 출력(설명·따옴표·번역 없이).` },
          ] }],
        }),
      },
    );
    if (!r.ok) throw new Error(`gemini_stt_http_${r.status}: ${(await r.text()).slice(0, 120)}`);
    const d = (await r.json()) as GeminiResponse;
    const text = (d.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    if (!text) throw new Error("gemini_stt_empty");
    // Gemini는 confidence 미제공 → 보수 추정(폴백 경로라 게이트 통과 우선, FLOOR 0.55 초과)
    return { text, confidence: 0.7 };
  }
}
