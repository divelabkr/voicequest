// 풀 파이프 e2e — Gemini TTS(일본어 음성) → Deepgram STT → judge(Qwen).
// say가 헤드리스서 무음이라, 원래 계획대로 AI TTS로 음성 생성(키 있는 Gemini).
// ⚠️ 합성음성이라 STT가 잘 먹음 — L2(초보 사람) 정확도는 못 잼(그건 실제 녹음=킬테스트).
// 실행: pnpm --filter @voicequest/spike exec tsx pipe-e2e.ts
import { readFileSync } from "node:fs";
import { judge } from "@voicequest/engine";
import { DeepgramStt } from "@voicequest/stt-deepgram";
import { QwenLlm } from "@voicequest/llm-qwen";
import { SCENE } from "./fixtures";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || !m[1]) continue;
  const v = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\r$/, "");
  if (v) env[m[1]] = v;
}

function pcmToWav(pcm: Buffer, sr: number): ArrayBuffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  const out = Buffer.concat([h, pcm]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

async function geminiTTS(text: string): Promise<ArrayBuffer> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${env.GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
      }),
    },
  );
  if (!r.ok) throw new Error(`gemini_tts_${r.status}: ${(await r.text()).slice(0, 150)}`);
  const d = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
  };
  const b64 = d.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`no_audio: ${JSON.stringify(d).slice(0, 200)}`);
  return pcmToWav(Buffer.from(b64, "base64"), 24000);
}

const stt = new DeepgramStt({ apiKey: env.DEEPGRAM_KEY ?? "" });
const llm = new QwenLlm({ baseURL: "http://localhost:11434/v1", model: "qwen3-coder:30b", apiKey: "ollama" });
const utterances = ["一人です", "二人です", "わかりません"];

async function main(): Promise<void> {
  console.log("🎙  풀 파이프 e2e: Gemini TTS(일본어) → Deepgram STT → judge(Qwen)\n");
  for (const u of utterances) {
    const wav = await geminiTTS(u);
    const tr = await stt.transcribe(wav, "ja");
    const jr = await judge(
      { transcript: tr.text, sttConfidence: tr.confidence, scene: SCENE, modifier: {}, strictness: "normal", affinity: 0 },
      llm,
    );
    console.log(`🗣  "${u}"`);
    console.log(`   STT  → "${tr.text}"  (conf ${tr.confidence.toFixed(2)})`);
    console.log(`   judge→ [${jr.grade}] ${jr.nextSceneId === "recovery" ? "↻ recovery" : "▶ 진행"}  — ${jr.reason}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
