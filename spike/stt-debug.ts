// Gemini TTS 모델명 조회 — finishReason OTHER 원인(모델명/접근) 격리.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || !m[1]) continue;
  const v = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\r$/, "");
  if (v) env[m[1]] = v;
}

const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_KEY}`);
const d = (await r.json()) as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
const all = d.models ?? [];
console.log("전체 모델 수:", all.length);
console.log("\n=== TTS / audio 관련 ===");
for (const m of all) {
  if (/tts|audio|speech/i.test(m.name + (m.displayName ?? ""))) {
    console.log(" ", m.name, "|", (m.supportedGenerationMethods ?? []).join(","));
  }
}
