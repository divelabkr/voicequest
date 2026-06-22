// Deepgram STT 어댑터 — 음성→일본어 전사. 공급자 SDK 대신 REST(fetch, 의존성 0).
// 키는 생성자 주입(어댑터는 process.env를 모른다 — runner가 .env에서 읽어 전달).
import type { SttPort, Transcript } from "@voicequest/engine";

export interface DeepgramOpts {
  apiKey: string;
  /** Deepgram 모델(기본 nova-2, 일본어 지원) */
  model?: string;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }>;
  };
}

export class DeepgramStt implements SttPort {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: DeepgramOpts) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "nova-2";
  }

  async transcribe(audio: ArrayBuffer, lang: "ja"): Promise<Transcript> {
    const url =
      `https://api.deepgram.com/v1/listen?model=${this.model}&language=${lang}` +
      `&punctuate=true&smart_format=true`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${this.apiKey}` },
      body: audio,
    });
    if (!r.ok) throw new Error(`deepgram_http_${r.status}: ${(await r.text()).slice(0, 120)}`);
    const data = (await r.json()) as DeepgramResponse;
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    return { text: alt?.transcript ?? "", confidence: alt?.confidence ?? 0 };
  }
}
