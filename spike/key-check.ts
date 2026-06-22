// 키 검증 — .env의 각 키가 실제 유효한지 가벼운 API 호출로 확인. 값은 출력 안 함.
// 실행: pnpm --filter @voicequest/spike exec tsx key-check.ts
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || !m[1]) continue;
  const v = (m[2] ?? "")
    .replace(/\s+#.*$/, "") // 인라인 주석(공백+#) 제거
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, "$2") // 양끝 따옴표 제거
    .replace(/\r$/, ""); // CR 제거
  if (v) env[m[1]] = v;
}

const results: [string, string][] = [];
async function test(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    results.push([name, await fn()]);
  } catch (e) {
    results.push([name, `❌ ${String(e).slice(0, 90)}`]);
  }
}

await test("Deepgram STT", async () => {
  const r = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${env.DEEPGRAM_KEY}` },
  });
  return r.ok ? "✅ 인증 OK" : `❌ HTTP ${r.status}`;
});

await test("Anthropic judge", async () => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 5, messages: [{ role: "user", content: "ping" }] }),
  });
  return r.ok ? "✅ 인증 OK" : `❌ HTTP ${r.status} ${(await r.text()).slice(0, 80)}`;
});

await test("Gemini 이미지", async () => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_KEY}`);
  return r.ok ? "✅ 인증 OK" : `❌ HTTP ${r.status}`;
});

await test("MiniMax TTS", async () => {
  const r = await fetch("https://api.minimax.io/v1/text/chatcompletion_v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MINIMAX_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "MiniMax-Text-01", messages: [{ role: "user", content: "hi" }] }),
  });
  const t = await r.text();
  if (r.ok && !t.includes('"status_code":1')) return "✅ 인증 OK";
  return `⚠️ HTTP ${r.status} ${t.slice(0, 90)}`;
});

await test("Firebase", async () => {
  const pk = env.FIREBASE_PRIVATE_KEY ?? "";
  return pk.includes("PRIVATE KEY") ? "✅ 키 형식 OK (실인증은 어댑터에서)" : "⚠️ PEM 형식 확인 필요";
});

console.log("🔑 키 검증 결과\n");
for (const [n, r] of results) console.log(`  ${n.padEnd(16)} ${r}`);
