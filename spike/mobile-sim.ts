// 모바일 ↔ 백엔드 통합 시뮬 — TalkScreen 흐름을 서버 통해 검증(마이크 = Gemini TTS).
// 입장(NPC 능동 자동진행) → 유저 발화(오디오 POST) → 판정 → 완주. 폰 없이 이 환경서 풀 검증.
// 사전: 서버 기동(pnpm --filter @voicequest/api dev). 실행: tsx mobile-sim.ts
import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || !m[1]) continue;
  const v = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\r$/, "");
  if (v) env[m[1]] = v;
}

const API = "http://localhost:8787";
const SID = "sim1";
interface TurnResult { npcLine: string; grade: string; affinity: number; done: boolean; awaitsUser: boolean }

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
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } } }) },
  );
  const d = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> };
  const b64 = d.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("gemini_tts_no_audio");
  return pcmToWav(Buffer.from(b64, "base64"), 24000);
}
async function postTurn(audio: ArrayBuffer | null): Promise<TurnResult> {
  const body = audio ?? new Uint8Array(0);
  const r = await fetch(`${API}/session/turn?sid=${SID}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
  if (!r.ok) throw new Error(`turn_http_${r.status}`);
  return (await r.json()) as TurnResult;
}

// NPC 능동 beat 자동진행(빈 POST) → 유저 차례 도달까지
async function advanceToUser(): Promise<TurnResult> {
  let res: TurnResult;
  do {
    res = await postTurn(null);
    if (!res.awaitsUser) console.log(`🗣  다이키: ${res.npcLine}`);
  } while (!res.awaitsUser && !res.done);
  return res;
}
async function speak(text: string): Promise<TurnResult> {
  const res = await postTurn(await geminiTTS(text));
  console.log(`🎤 (음성)"${text}" → [${res.grade}] · 호감도 ${res.affinity}`);
  return res;
}

async function main(): Promise<void> {
  console.log("📱 모바일 ↔ 백엔드 시뮬 (마이크 = Gemini TTS · 폰 없이 풀 검증)\n");
  const health = await (await fetch(`${API}/health`)).json();
  console.log("서버:", JSON.stringify(health), "\n🚪 입장");
  await advanceToUser();
  for (const u of ["一人です", "ラーメンをください", "おすすめは何ですか", "おいしいです"]) {
    const res = await speak(u);
    if (res.done) { console.log(`\n🏁 완주 · 호감도 ${res.affinity}`); return; }
    await advanceToUser();
  }
  console.log("\n✅ 4턴 흐름 정상 (입장→발화트리→판정→다음씬)");
}
main().catch((e) => { console.error(e); process.exit(1); });
