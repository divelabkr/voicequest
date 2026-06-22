// 음성 기초 — 다이키(라멘집 청년) 음성 후보를 여러 prebuilt voice로 생성해 청취·비교.
// 선택이 플랫폼 음성 프리셋의 기준 → 트럼펫 커스텀 기반. 실행: tsx voice-sample.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || !m[1]) continue;
  const v = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\r$/, "");
  if (v) env[m[1]] = v;
}

function pcmToWav(pcm: Buffer, sr: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function tts(text: string, voice: string): Promise<Buffer> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${env.GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    },
  );
  if (!r.ok) throw new Error(`tts_${r.status}: ${(await r.text()).slice(0, 150)}`);
  const d = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
  };
  const b64 = d.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`no_audio: ${JSON.stringify(d).slice(0, 150)}`);
  return pcmToWav(Buffer.from(b64, "base64"), 24000);
}

// 다이키 음성 후보 — 남성 prebuilt voice (라멘집 친근한 청년 톤)
const VOICES = [
  { id: "puck", voice: "Puck", desc: "밝고 경쾌" },
  { id: "charon", voice: "Charon", desc: "차분·낮은 톤" },
  { id: "fenrir", voice: "Fenrir", desc: "활기참" },
  { id: "orus", voice: "Orus", desc: "또렷·중간 톤" },
];
const LINE = "いらっしゃいませ!あ、今ちょっと混んでてね…まあまあ、立ち話もなんだし、座って座って";

async function main(): Promise<void> {
  mkdirSync("/tmp/vq-voices", { recursive: true });
  console.log(`🎙  다이키 대사: "${LINE}"\n`);
  for (const v of VOICES) {
    try {
      const wav = await tts(LINE, v.voice);
      const path = `/tmp/vq-voices/daiki-${v.id}.wav`;
      writeFileSync(path, wav);
      console.log(`✓ ${v.voice} (${v.desc}) → ${path}  ${(wav.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.log(`✗ ${v.voice}: ${String(e).slice(0, 80)}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
