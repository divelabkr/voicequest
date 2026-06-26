// 캐릭터·배경 이미지 생성 — Gemini 이미지(nano-banana). content_cache 저장.
// 실행: GEMINI_KEY=... node scripts/gen-images.mjs   (모델 미지정 시 후보 순차 시도)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KEY = process.env.GEMINI_KEY;
if (!KEY) { console.error("GEMINI_KEY 필요"); process.exit(2); }
// 2026 Gemini 이미지 모델 후보 — 첫 성공 모델 사용(불확실해 순차 시도)
const MODELS = process.env.IMG_MODEL ? [process.env.IMG_MODEL]
  : ["gemini-3-flash-image", "gemini-2.5-flash-image", "gemini-2.5-flash-image-preview", "gemini-2.0-flash-exp-image-generation"];
const OUT = fileURLToPath(new URL("../content_cache/ep_01/images/", import.meta.url));

async function tryGen(model, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
  });
  if (!r.ok) throw new Error(`http_${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  const part = (d.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part) throw new Error("no_image: " + JSON.stringify(d).slice(0, 200));
  return Buffer.from(part.inlineData.data, "base64");
}

const targets = [
  { key: "char_daiki", prompt: "A warm, friendly Japanese ramen shop owner — a cheerful energetic middle-aged man wearing a headband and apron, big welcoming smile, anime illustration style, soft warm lighting, simple cream-colored background, upper-body character portrait, high quality" },
  { key: "bg_ramen", prompt: "Cozy traditional Japanese neighborhood ramen shop interior at evening, wooden counter seats, warm paper-lantern lighting, gentle steam rising from bowls, anime background art style, inviting nostalgic atmosphere, no people, wide establishing shot" },
];

mkdirSync(OUT, { recursive: true });
let model = null;
for (const t of targets) {
  let buf = null, lastErr = "";
  // 첫 타겟에서 작동 모델 탐색, 이후 같은 모델 재사용
  for (const m of (model ? [model] : MODELS)) {
    try { buf = await tryGen(m, t.prompt); model = m; break; }
    catch (e) { lastErr = `${m}: ${String(e).slice(0, 120)}`; }
  }
  if (!buf) { console.error(`❌ ${t.key} 실패 — ${lastErr}`); continue; }
  const path = OUT + t.key + ".png";
  writeFileSync(path, buf);
  console.log(`✅ ${t.key}: ${(buf.length / 1024).toFixed(0)}KB (model=${model}) → content_cache/ep_01/images/${t.key}.png`);
}
console.log(model ? `\n작동 모델: ${model}` : "\n⚠️ 모든 모델 실패 — IMG_MODEL로 지정 필요");
