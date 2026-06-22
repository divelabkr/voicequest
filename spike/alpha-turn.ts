// 알파 1턴 실배선 — bootstrap(실 Deepgram STT + judge Qwen 조립) + runTurn + access 게이트.
// 마이크 대신 Gemini TTS로 발화 오디오 생성. NPC 응답은 자막 모드(음성 캐시는 M3).
// 실행: pnpm --filter @voicequest/spike exec tsx alpha-turn.ts
import { runTurn, bootstrap, loadEnv } from "@voicequest/api";
import {
  initState, parseEpisode, findScene, currentBeat,
  admit, canSpendTurn, recordTurn, STAGE_LIMITS,
} from "@voicequest/engine";
import type { GameState, UsageState } from "@voicequest/engine";
import ep01raw from "../content/episodes/ep_01_daiki_diner.json";

const envPath = new URL("../.env", import.meta.url);
const env = loadEnv(envPath);

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
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
      }),
    },
  );
  const d = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> };
  const b64 = d.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("gemini_tts_no_audio");
  return pcmToWav(Buffer.from(b64, "base64"), 24000);
}

const TODAY = "2026-06-19";
const ep = parseEpisode(ep01raw);
const { deps } = bootstrap(ep, envPath); // 실 Deepgram STT + judge Qwen
const utterances = ["一人です", "ラーメンをください", "おすすめは何ですか"];

async function main(): Promise<void> {
  const adm = admit("alpha", 3, false, 0);
  console.log(`🚪 alpha 입장: ${adm.status} (상한 ${STAGE_LIMITS.alpha.capacity}명 · 일일 ${STAGE_LIMITS.alpha.dailyTurnCap}턴)\n`);
  let usage: UsageState = { turnsToday: 0, dayStamp: TODAY };
  let state: GameState = initState(ep);
  let ts = 0, idx = 0, guard = 0;
  console.log(`🎮 ${ep.title} — bootstrap(실 STT + judge) + access\n`);
  while (!state.done && idx < utterances.length && guard++ < 20) {
    const scene = findScene(ep, state.currentSceneId)!;
    const beat = currentBeat(scene, { sceneId: scene.id, beatIndex: state.beatIndex });
    const isUser = !beat || beat.kind === "user";
    if (isUser && !canSpendTurn(usage, "alpha", TODAY)) { console.log("⛔ 일일 턴 한도 도달"); break; }
    const said = utterances[idx] ?? "";
    const audio = isUser ? await geminiTTS(said) : new ArrayBuffer(0);
    const before = state.currentSceneId;
    const { result, state: next } = await runTurn(deps, state, audio, ts++);
    if (!result.awaitsUser) {
      console.log(`🗣  다이키: ${result.npcLine}  ⟨능동⟩`);
    } else {
      usage = recordTurn(usage, TODAY);
      const moved = result.nextSceneId !== before || result.done;
      console.log(`🎤 (음성)"${said}" → 실STT→judge [${result.grade}] ${moved ? "▶ 진행" : "↻ recovery"} · 호감도 ${result.affinity} · 오늘 ${usage.turnsToday}턴`);
      if (moved) idx++;
    }
    state = next;
  }
  console.log(`\n🏁 ${state.currentSceneId} · 호감도 ${state.affinity} · 사용 ${usage.turnsToday}/${STAGE_LIMITS.alpha.dailyTurnCap}턴`);
}
main().catch((e) => { console.error(e); process.exit(1); });
