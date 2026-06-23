// 실시간 턴 레이턴시 실측 — fast-path(코드) vs LLM judge(ollama qwen) vs STT(Deepgram 실호출).
// 실행: cd services/api && pnpm exec tsx src/latency-bench.ts
import { performance } from "node:perf_hooks";
import { readFileSync, readdirSync } from "node:fs";
import { judge, JUDGE_RULES } from "@voicequest/engine";
import { DeepgramStt } from "@voicequest/stt-deepgram";
import type { JudgeInput, JudgeResult, Scene } from "@voicequest/engine";

const raw = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && m[1]) env[m[1]] = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2"); }

const scene: Scene = { id: "s1", intent: "인원 말하기", requiredSlots: [], allowedExpressions: ["一人です", "二人です"] };
const inp = (t: string): JudgeInput => ({ transcript: t, sttConfidence: 0.9, scene, modifier: {}, strictness: "normal", affinity: 0 });
const mockLlm = { judge: async (): Promise<JudgeResult> => ({ grade: "B", matched: [], weaknessTags: [], affinityDelta: 0, nextSceneId: "next", reason: "mock", category: "normal" }) };

// ① fast-path — 정답 발화 채점(LLM 0). 3000회 평균.
async function fastPath(): Promise<number> {
  const N = 3000; const x = inp("一人です");
  await judge(x, mockLlm); // warmup
  const t0 = performance.now();
  for (let i = 0; i < N; i++) await judge(x, mockLlm);
  return (performance.now() - t0) / N * 1000; // μs
}

// ② LLM judge — ollama qwen3-coder:30b (변형 발화 → fast 스킵 → LLM 폴백)
const ollama = { judge: async (input: JudgeInput): Promise<JudgeResult> => {
  const prompt = `${JUDGE_RULES}\n\nscene.intent: ${input.scene.intent}\nscene.allowedExpressions: ${JSON.stringify(input.scene.allowedExpressions)}\ntranscript: "${input.transcript}"`;
  const r = await fetch("http://localhost:11434/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "qwen3-coder:30b", messages: [{ role: "user", content: prompt }], format: "json", stream: false }) });
  const d = (await r.json()) as { message?: { content?: string } };
  try { return JSON.parse(d.message?.content ?? "{}") as JudgeResult; } catch { return { grade: "C", matched: [], weaknessTags: [], affinityDelta: 0, nextSceneId: "recovery", reason: "parse", category: "normal" }; }
} };
async function llmJudge(): Promise<{ ms: number; grade: string }> {
  const x = inp("ひとりですけど"); // 변형 → LLM 폴백
  const t0 = performance.now();
  const r = await judge(x, ollama);
  return { ms: performance.now() - t0, grade: r.grade };
}

// ③ STT — Deepgram 일괄(캐시 m4a 샘플 실전사)
async function sttBench(): Promise<{ ms: number; text: string } | null> {
  if (!env.DEEPGRAM_KEY) return null;
  const dir = new URL("../../../content_cache/ep_01/audio/", import.meta.url);
  const files = readdirSync(dir).filter((n) => n.endsWith(".m4a")).map((n) => ({ n, sz: readFileSync(new URL(n, dir)).length })).sort((a, b) => a.sz - b.sz);
  const f = files[0]?.n; // 가장 짧은 발화 = 유저 한 마디 근사(긴 NPC 대사 말고)
  if (!f) return null;
  const a = readFileSync(new URL(f, dir));
  const stt = new DeepgramStt({ apiKey: env.DEEPGRAM_KEY });
  const t0 = performance.now();
  const tr = await stt.transcribe(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength), "ja");
  return { ms: performance.now() - t0, text: `${tr.text.slice(0, 24)}" (${(files[0]!.sz / 1024).toFixed(0)}KB)` };
}

async function main(): Promise<void> {
  console.log("⏱  실시간 턴 레이턴시 실측 (실제 ollama·Deepgram 호출)\n");
  const fast = await fastPath();
  console.log(`① fast-path(정답 채점) : ${fast.toFixed(1)}μs = ${(fast / 1000).toFixed(3)}ms   ← LLM 호출 0`);
  const stt = await sttBench();
  if (stt) console.log(`② STT(Deepgram 일괄)   : ${stt.ms.toFixed(0)}ms   전사="${stt.text}…"`);
  else console.log(`② STT: 건너뜀(키/샘플 없음)`);
  let llm: { ms: number; grade: string };
  try { llm = await llmJudge(); console.log(`③ LLM judge(qwen 30B)  : ${llm.ms.toFixed(0)}ms   grade=${llm.grade}`); }
  catch (e) { llm = { ms: 0, grade: "err" }; console.log(`③ LLM judge: 실패 ${String(e).slice(0, 40)}`); }
  const s = stt?.ms ?? 0;
  console.log(`\n━━━━━ 턴 총 레이턴시 ━━━━━`);
  console.log(`정답 발화(~8할): STT ${s.toFixed(0)} + fast ${(fast / 1000).toFixed(2)} + TTS캐시 0  = ${(s + fast / 1000).toFixed(0)}ms  ${(s + fast / 1000) < 1500 ? "⚡ 실시간" : "🐢"}`);
  if (llm.ms) console.log(`변형 발화(~2할): STT ${s.toFixed(0)} + LLM ${llm.ms.toFixed(0)}            = ${(s + llm.ms).toFixed(0)}ms  ${(s + llm.ms) < 1500 ? "⚡" : "🤖 추임새로 체감 흡수"}`);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
