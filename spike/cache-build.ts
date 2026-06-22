// 캐시 빌드 — NPC 대사를 음성(Fenrir)+후리가나(kuroshiro)+단어뜻(kuromoji)으로 사전생성.
// "NPC는 캐시" 핵심 실현 + 오픈소스 4종 end-to-end. content_cache/ep_01/{manifest.json, audio/}.
// 실행: tsx cache-build.ts
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || !m[1]) continue;
  const v = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\r$/, "");
  if (v) env[m[1]] = v;
}

const KuroshiroPkg = require("kuroshiro");
const Kuroshiro = KuroshiroPkg.default ?? KuroshiroPkg;
const AnalyzerPkg = require("kuroshiro-analyzer-kuromoji");
const KuromojiAnalyzer = AnalyzerPkg.default ?? AnalyzerPkg;
const kuromoji = require("kuromoji");
const dicPath = join(dirname(require.resolve("kuromoji/package.json")), "dict");

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
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }) },
  );
  if (!r.ok) throw new Error(`tts_${r.status}: ${(await r.text()).slice(0, 120)}`);
  const d = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> };
  const b64 = d.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("no_audio");
  return pcmToWav(Buffer.from(b64, "base64"), 24000);
}

const GLOSS: Record<string, string> = { 今: "지금, 현재", 混む: "붐비다", 立ち話: "선 채로 나누는 이야기", 座る: "앉다", 一人: "한 명", 二人: "두 명", 注文: "주문", 完食: "남김없이 다 먹음", 会計: "계산", 感想: "감상, 소감" };
// ep_01 JSON에서 NPC 선창(npc/npc_push) 자동 수집 + ack/회복 대사 → 캐시 음성(하드코드 LINES 제거).
const epData = JSON.parse(readFileSync(new URL("../content/episodes/ep_01_daiki_diner.json", import.meta.url), "utf8")) as { scenes: Array<{ beats?: Array<{ kind: string; line?: string }> }> };
const SCENE_LINES = epData.scenes.flatMap((s) => (s.beats ?? []).filter((b) => (b.kind === "npc" || b.kind === "npc_push") && b.line).map((b) => b.line as string));
const ACK_LINES = ["おっ、いいね！", "はいよ、了解！", "うん、なるほどね", "また来てね！またいつでもおいで", "もう一度どうぞ"];
const LINES = [...SCENE_LINES, ...ACK_LINES];
const VOICE = "Fenrir"; // 다이키 = 활기참(식당 주인)

async function main(): Promise<void> {
  const outDir = new URL("../content_cache/ep_01/", import.meta.url);
  mkdirSync(new URL("audio/", outDir), { recursive: true });
  const kuroshiro = new Kuroshiro();
  await kuroshiro.init(new KuromojiAnalyzer());
  const tokenizer: { tokenize(s: string): Array<{ surface_form: string; basic_form: string }> } = await new Promise((res, rej) =>
    kuromoji.builder({ dicPath }).build((e: unknown, t: unknown) => (e ? rej(e) : res(t as never))));

  const lines = [];
  let total = 0;
  for (let i = 0; i < LINES.length; i++) {
    const line = LINES[i]!;
    const m4aRel = `audio/line_${i}.m4a`;
    const m4aUrl = new URL(m4aRel, outDir);
    let audio = m4aRel;
    let bytes = 0;
    if (existsSync(m4aUrl)) {
      bytes = readFileSync(m4aUrl).length; // 기존 압축본 재사용 — TTS quota 절약(재실행 멱등)
    } else {
      let wav: Buffer;
      try { wav = await tts(line, VOICE); }
      catch (e) { console.log(`  ⚠ [${i}] TTS 실패 → 음성 없이 자막으로 진행: ${String(e).slice(0, 40)}`); continue; }
      const wavUrl = new URL(`audio/line_${i}.wav`, outDir);
      writeFileSync(wavUrl, wav);
      // ① 음성 압축(§11) — afconvert WAV→AAC(.m4a 32kbps mono). 원본 폐기. 실패 시 WAV.
      bytes = wav.length;
      try {
        execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "32000", fileURLToPath(wavUrl), fileURLToPath(m4aUrl)]);
        bytes = readFileSync(m4aUrl).length;
        rmSync(fileURLToPath(wavUrl));
      } catch { audio = `audio/line_${i}.wav`; }
    }
    total += bytes;
    const furigana = await kuroshiro.convert(line, { mode: "okurigana", to: "hiragana" });
    const words = tokenizer.tokenize(line)
      .map((t) => { const base = t.basic_form !== "*" ? t.basic_form : t.surface_form; return GLOSS[base] ? { w: t.surface_form, gloss: GLOSS[base] } : null; })
      .filter((x): x is { w: string; gloss: string } => x !== null);
    lines.push({ text: line, audio, furigana, words, bytes });
    console.log(`  ✓ [${i}] ${line.slice(0, 18)}… → 음성 ${(bytes / 1024).toFixed(0)}KB${audio.endsWith(".m4a") ? "(AAC)" : ""} · 후리가나 · 단어뜻 ${words.length}`);
  }
  writeFileSync(new URL("manifest.json", outDir), JSON.stringify({ episode: "ep_01", voice: VOICE, lines }, null, 2));
  console.log(`\n✅ 캐시 빌드 완료: ${LINES.length}개 대사 = 음성(${VOICE})+후리가나+단어뜻 → content_cache/ep_01/ (총 ${(total / 1024).toFixed(0)}KB)`);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
