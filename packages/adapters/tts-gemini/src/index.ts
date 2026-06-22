// TtsPort 구현 — Gemini TTS. NPC 음성(빌드타임 캐시용). PCM→wav→base64 data URL.
// 공급자 SDK 대신 REST(fetch). 캐릭터별 voice 매핑(트럼펫 모델)은 후속, 지금은 기본 voice.
import type { TtsPort } from "@voicequest/engine";

export interface GeminiTtsOptions {
  apiKey: string;
  model?: string;
  voice?: string;
}

function pcmToWav(pcm: Buffer, sr: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export class GeminiTts implements TtsPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly voice: string;

  constructor(opts: GeminiTtsOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gemini-3.1-flash-tts-preview";
    this.voice = opts.voice ?? "Kore";
  }

  async synth(text: string, _voice: string, _style?: string): Promise<string> {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } } },
        }),
      },
    );
    if (!r.ok) throw new Error(`gemini_tts_${r.status}`);
    const d = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> };
    const b64 = d.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) throw new Error("gemini_tts_no_audio");
    const wav = pcmToWav(Buffer.from(b64, "base64"), 24000);
    return `data:audio/wav;base64,${wav.toString("base64")}`;
  }
}
