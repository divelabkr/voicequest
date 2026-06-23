// qualityMeter e2e 시뮬 — 실제 STT(Deepgram)+judge(ollama, fast-path 포함)에 다양 발화를 흘려
// 파이프라인 단계계측 + qualityMeter 누적·집계 검증. 실행: cd services/api && pnpm exec tsx src/sim-quality.ts
// 발화트리(npc 선창)는 우회하고 STT→judge 파이프라인을 직접 호출(품질 메트릭 자체 검증).
import { performance } from "node:perf_hooks";
import { readFileSync, readdirSync } from "node:fs";
import { parseEpisode, judge, emptyQuality, recordQuality, summarizeQuality, JUDGE_RULES } from "@voicequest/engine";
import { DeepgramStt } from "@voicequest/stt-deepgram";
import type { SttPort, LlmPort, JudgeInput, JudgeResult } from "@voicequest/engine";

const raw = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && m[1]) env[m[1]] = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2"); }

const ep = parseEpisode(JSON.parse(readFileSync(new URL("../../../content/episodes/ep_01_daiki_diner.json", import.meta.url), "utf8")));
const scene = ep.scenes[0]!; // s1 一人です

const ollama: LlmPort = { judge: async (input: JudgeInput): Promise<JudgeResult> => {
  const prompt = `${JUDGE_RULES}\n\nscene.intent: ${input.scene.intent}\nallowedExpressions: ${JSON.stringify(input.scene.allowedExpressions)}\ntranscript: "${input.transcript}"`;
  const r = await fetch("http://localhost:11434/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "qwen3-coder:30b", messages: [{ role: "user", content: prompt }], format: "json", stream: false }) });
  const d = (await r.json()) as { message?: { content?: string } };
  try { return JSON.parse(d.message?.content ?? "{}") as JudgeResult; } catch { return { grade: "C", matched: [], weaknessTags: [], affinityDelta: 0, nextSceneId: "recovery", reason: "parse", category: "normal" }; }
} };

const mockStt = (text: string, confidence = 0.9): SttPort => ({ async transcribe() { return { text, confidence }; } });
const failStt: SttPort = { async transcribe() { throw new Error("stt_down"); } };
const realStt = new DeepgramStt({ apiKey: env.DEEPGRAM_KEY ?? "", host: env.DEEPGRAM_HOST });

const m4aDir = new URL("../../../content_cache/ep_01/audio/", import.meta.url);
const someM4a = readdirSync(m4aDir).find((n) => n.endsWith(".m4a"));
const m4aBuf = someM4a ? readFileSync(new URL(someM4a, m4aDir)) : null;
const m4aAb: ArrayBuffer = m4aBuf ? m4aBuf.buffer.slice(m4aBuf.byteOffset, m4aBuf.byteOffset + m4aBuf.byteLength) : new ArrayBuffer(8);

const scenarios: Array<{ name: string; stt: SttPort; audio: ArrayBuffer }> = [
  { name: "정답(fast-path)", stt: mockStt("一人です"), audio: new ArrayBuffer(8) },
  { name: "정답2(fast-path)", stt: mockStt("一人です"), audio: new ArrayBuffer(8) },
  { name: "정답3(fast-path)", stt: mockStt("一人です"), audio: new ArrayBuffer(8) },
  { name: "변형(llm 폴백)", stt: mockStt("ひとりだよ"), audio: new ArrayBuffer(8) },
  { name: "실제STT+llm", stt: realStt, audio: m4aAb },
  { name: "STT에러", stt: failStt, audio: new ArrayBuffer(8) },
  { name: "저신뢰도(게이트)", stt: mockStt("ぼそぼそ", 0.3), audio: new ArrayBuffer(8) },
];

async function main(): Promise<void> {
  console.log("🧪 qualityMeter e2e 시뮬 (실제 STT·judge, 파이프라인 STT→judge 직접)\n");
  let qm = emptyQuality();
  for (const sc of scenarios) {
    let sttMs = 0, judgeMs = 0, confidence = 0, error = false, fast = false, grade = "-";
    const t0 = performance.now();
    try {
      const _s = performance.now();
      const tr = await sc.stt.transcribe(sc.audio, "ja");
      sttMs = Math.round(performance.now() - _s);
      confidence = tr.confidence;
      const _j = performance.now();
      const jr = await judge({ transcript: tr.text, sttConfidence: tr.confidence, scene, modifier: {}, strictness: "normal", affinity: 0 }, ollama);
      judgeMs = Math.round(performance.now() - _j);
      fast = jr.reason === "fast_exact_match";
      grade = jr.grade;
    } catch { error = true; }
    const turnMs = performance.now() - t0;
    qm = recordQuality(qm, { ms: turnMs, fast, error, confidence });
    console.log(`  ${sc.name.padEnd(18)} → ${turnMs.toFixed(0).padStart(5)}ms  stt=${String(sttMs).padStart(4)} judge=${String(judgeMs).padStart(4)}  ${fast ? "⚡fast" : error ? "❌err " : "🤖llm "} grade=${grade} conf=${confidence}`);
  }
  const s = summarizeQuality(qm);
  console.log(`\n━━━ /admin/quality 집계 ━━━`);
  console.log(`  턴 ${s.turns} · fast율 ${Math.round(s.fastRate * 100)}% · 에러율 ${Math.round(s.errorRate * 100)}% · p50 ${Math.round(s.p50)}ms · p95 ${Math.round(s.p95)}ms · 평균신뢰도 ${Math.round(s.avgConfidence * 100)}%`);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
