// 판정 모델 A/B 러너 — 같은 골격·발화로 여러 모델을 나란히 비교.
// 로컬 Ollama 여러 모델: OLLAMA_MODELS="qwen3-coder:30b,qwen3:8b" (쉼표 구분, 키 0).
// 클라우드: ANTHROPIC_API_KEY / GEMINI_API_KEY / QWEN_API_KEY.
// 발화별 디버그: DEBUG=1 → 틀린 발화의 기대 vs 실제 출력.
// Qwen = 파일럿 측정용(측정 ≠ 채택).
import { judge } from "@voicequest/engine";
import type { JudgeInput } from "@voicequest/engine";
import type { LlmPort } from "@voicequest/engine/ports/Llm";
import { ClaudeLlm } from "@voicequest/llm-claude-haiku";
import { GeminiFlashLlm } from "@voicequest/llm-gemini-flash";
import { QwenLlm } from "@voicequest/llm-qwen";
import { SCENE, UTTERANCES } from "./fixtures";

const hasClaude = !!process.env.ANTHROPIC_API_KEY;
const hasGemini = !!process.env.GEMINI_API_KEY;
const debug = !!process.env.DEBUG;

const candidates: Record<string, LlmPort | null> = {
  haiku: hasClaude ? new ClaudeLlm("claude-haiku-4-5") : null,
  sonnet: hasClaude ? new ClaudeLlm("claude-sonnet-4-6") : null,
  gemini: hasGemini ? new GeminiFlashLlm() : null,
};

if (process.env.QWEN_API_KEY) {
  candidates["qwen(cloud)"] = new QwenLlm({ apiKey: process.env.QWEN_API_KEY });
}
// 로컬 Ollama Qwen 모델들 (키 0·비용 0·데이터 로컬)
const ollamaModels = (process.env.OLLAMA_MODELS ?? "qwen3-coder:30b")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const m of ollamaModels) {
  candidates[`qwen:${m}`] = new QwenLlm({
    baseURL: "http://localhost:11434/v1",
    model: m,
    apiKey: "ollama",
  });
}

const base: Omit<JudgeInput, "transcript" | "sttConfidence" | "scene"> = {
  modifier: {},
  strictness: "normal",
  affinity: 0,
};

async function run(): Promise<void> {
  console.log(`발화 ${UTTERANCES.length}개 × 모델 비교 (scene=${SCENE.id})\n`);
  for (const [name, llm] of Object.entries(candidates)) {
    if (!llm) {
      console.log(`${name.padEnd(18)} | skip (API 키 없음)`);
      continue;
    }
    let correct = 0;
    let totalMs = 0;
    const misses: string[] = [];
    for (const u of UTTERANCES) {
      const t0 = performance.now();
      const r = await judge(
        { ...base, scene: SCENE, transcript: u.transcript, sttConfidence: u.confidence },
        llm,
      );
      totalMs += performance.now() - t0;
      const actual = u.expect === "recovery" ? r.nextSceneId : r.grade;
      const ok = u.expect === "recovery" ? r.nextSceneId === "recovery" : r.grade === u.expect;
      if (ok) correct++;
      else misses.push(`    ✗ "${u.transcript}" 기대=${u.expect} 실제=${actual} (${u.note})`);
    }
    const acc = Math.round((correct / UTTERANCES.length) * 100);
    const avgMs = Math.round(totalMs / UTTERANCES.length);
    console.log(
      `${name.padEnd(18)} | 정확도 ${acc}% (${correct}/${UTTERANCES.length}) | 평균 ${avgMs}ms`,
    );
    if (debug && misses.length) console.log(misses.join("\n"));
  }
  console.log(
    "\n※ Qwen=파일럿 측정용(채택 별도). expect는 잠정 — 원어민 감수로 확정. 비용은 usage 노출 후.",
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
