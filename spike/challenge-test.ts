// OPIc 챌린지(s7) 변별력 — 같은 고난이도 씬에 긴 발화 vs 짧은 답.
import { judge, parseEpisode, findScene } from "@voicequest/engine";
import { QwenLlm } from "@voicequest/llm-qwen";
import ep01raw from "../content/episodes/ep_01_daiki_diner.json";

const ep = parseEpisode(ep01raw);
const s7 = findScene(ep, "s7_deep_talk");
if (!s7) throw new Error("s7_deep_talk 없음");

const llm = new QwenLlm({
  baseURL: "http://localhost:11434/v1",
  model: "qwen3-coder:30b",
  apiKey: "ollama",
});

const cases = [
  { label: "긴 발화(3문장)", text: "私は韓国から来ました。日本のラーメンが大好きです。また来ます。" },
  { label: "짧은 답(1마디)", text: "はい" },
];

async function run(): Promise<void> {
  console.log("OPIc 챌린지(s7) 변별력 — 긴 발화 vs 짧은 답\n");
  for (const c of cases) {
    const r = await judge(
      { transcript: c.text, sttConfidence: 0.9, scene: s7!, modifier: {}, strictness: "normal", affinity: 0 },
      llm,
    );
    const verdict = r.nextSceneId === "recovery" ? "↻ 막힘(recovery)" : "▶ 통과";
    console.log(`${c.label.padEnd(16)} → [${r.grade}] ${verdict}  (${r.reason})`);
  }
}

run().catch(console.error);
