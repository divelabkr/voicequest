// 캐시 빌드 — NPC 대사 음성(화자별 voice)+후리가나+단어뜻 사전생성.
// 에피소드 인자: tsx cache-build.ts [ep_id]  (기본 ep_01). content_cache/{short}/{manifest.json, audio/}.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { assetHash, buildManifest, EPISODE_BYTE_BUDGET, DAIKI_TOPICS } from "@voicequest/engine";
import { makeCollageMusic } from "./music-collage";
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

const GLOSS: Record<string, string> = { 今: "지금, 현재", 混む: "붐비다", 立ち話: "선 채로 나누는 이야기", 座る: "앉다", 一人: "한 명", 二人: "두 명", 注文: "주문", 完食: "남김없이 다 먹음", 会計: "계산", 感想: "감상, 소감", 切符: "표", 乗り換え: "환승", 渋谷: "시부야", 放課後: "방과후" };

const EP_ID = process.argv[2] ?? "ep_01_daiki_diner";
const SHORT = EP_ID.split("_").slice(0, 2).join("_");
const epData = JSON.parse(readFileSync(new URL(`../content/episodes/${EP_ID}.json`, import.meta.url), "utf8")) as {
  character?: string; npcs?: Array<{ id: string; voiceName?: string }>;
  scenes: Array<{ beats?: Array<{ kind: string; line?: string; speaker?: string }> }>;
};
const NPCS = epData.npcs ?? [];
const MAIN_VOICE = NPCS.find((n) => n.id === epData.character)?.voiceName ?? "Fenrir";
const voiceOf = (speaker?: string): string => (speaker ? NPCS.find((n) => n.id === speaker)?.voiceName : undefined) ?? MAIN_VOICE;
const SCENE_LINES = epData.scenes.flatMap((s) => (s.beats ?? []).filter((b) => (b.kind === "npc" || b.kind === "npc_push") && b.line).map((b) => ({ text: b.line as string, voice: voiceOf(b.speaker) })));
const ACK_LINES = ["おっ、いいね！", "はいよ、了解！", "うん、なるほどね", "また来てね！またいつでもおいで", "もう一度どうぞ", "ゆっくりでいいよ、もう一度"].map((t) => ({ text: t, voice: MAIN_VOICE }));
// 음성 추임새 — 발화 끝 즉시 재생해 LLM 판정 구간을 병렬로 흡수(끊김 없는 대화감). 짧은 생각소리, 응답까지 연쇄.
const AIZUCHI = ["うーん…", "えーと…", "あのー…", "んー…"];
const AIZUCHI_LINES = AIZUCHI.map((t) => ({ text: t, voice: MAIN_VOICE }));
// 프리토크 — 토픽 질문 + 리액션 음성(다이키만). 텍스트는 server /freetalk reaction과 일치(manifest byNorm 매칭).
const FREETALK_LINES = EP_ID === "ep_01_daiki_diner"
  ? [...DAIKI_TOPICS.map((t) => ({ text: t.question, voice: MAIN_VOICE })),
     ...["へえ、いいね！もっと聞かせて。", "なるほどね。", "うーん、そっか。", "ごめん、もう一度言ってくれる？", "うーん、その話はやめておこうか。別のことを話そう。"].map((t) => ({ text: t, voice: MAIN_VOICE }))]
  : [];
const LINES = [...SCENE_LINES, ...ACK_LINES, ...AIZUCHI_LINES, ...FREETALK_LINES];

async function main(): Promise<void> {
  const outDir = new URL(`../content_cache/${SHORT}/`, import.meta.url);
  const sharedDir = new URL("../content_cache/_shared/audio/", import.meta.url); // ep 간 전역 공유(§11 전역 dedup — 추임새·공통대사 1벌)
  mkdirSync(sharedDir, { recursive: true });
  const kuroshiro = new Kuroshiro();
  await kuroshiro.init(new KuromojiAnalyzer());
  const tokenizer: { tokenize(s: string): Array<{ surface_form: string; basic_form: string }> } = await new Promise((res, rej) =>
    kuromoji.builder({ dicPath }).build((e: unknown, t: unknown) => (e ? rej(e) : res(t as never))));

  const lines: { text: string; audio: string; furigana: string; words: { w: string; gloss: string }[]; bytes: number; hash: string }[] = [];
  for (let i = 0; i < LINES.length; i++) {
    const { text, voice } = LINES[i]!;
    // content-hash 파일명 — 같은 (발화·화자)는 1벌만 저장(§11 dedup). 프리토크 토픽·리액션 곱셈을 흡수.
    const hash = assetHash(text + "" + voice);
    const m4aUrl = new URL(`${hash}.m4a`, sharedDir);
    const epLocalUrl = new URL(`audio/${hash}.m4a`, outDir);
    const legacyUrl = new URL(`audio/line_${i}.m4a`, outDir); // 인덱스 파일명 → hash 무손실 이전
    const audio = `/cache/_shared/audio/${hash}.m4a`;
    let bytes = 0;
    if (existsSync(m4aUrl)) {
      bytes = readFileSync(m4aUrl).length; // dedup·멱등: 같은 hash 재사용(중복 발화 추가 0바이트)
    } else if (existsSync(epLocalUrl)) {
      renameSync(fileURLToPath(epLocalUrl), fileURLToPath(m4aUrl)); bytes = readFileSync(m4aUrl).length;
    } else if (existsSync(legacyUrl)) {
      renameSync(fileURLToPath(legacyUrl), fileURLToPath(m4aUrl)); bytes = readFileSync(m4aUrl).length;
    } else {
      let wav: Buffer;
      try { wav = await tts(text, voice); }
      catch (e) { console.log(`  ⚠ [${i}] TTS 실패 → 자막으로 진행: ${String(e).slice(0, 40)}`); continue; }
      const wavUrl = new URL(`${hash}.wav`, sharedDir);
      writeFileSync(wavUrl, wav);
      bytes = wav.length;
      try { execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "32000", fileURLToPath(wavUrl), fileURLToPath(m4aUrl)]); bytes = readFileSync(m4aUrl).length; rmSync(fileURLToPath(wavUrl)); }
      catch { continue; }
    }
    const furigana = await kuroshiro.convert(text, { mode: "okurigana", to: "hiragana" });
    const words = tokenizer.tokenize(text)
      .map((t) => { const base = t.basic_form !== "*" ? t.basic_form : t.surface_form; return GLOSS[base] ? { w: t.surface_form, gloss: GLOSS[base] } : null; })
      .filter((x): x is { w: string; gloss: string } => x !== null);
    lines.push({ text, audio, furigana, words, bytes, hash });
    console.log(`  ✓ [${i}] ${text.slice(0, 16)}… (${voice}) → ${(bytes / 1024).toFixed(0)}KB · hash ${hash}`);
  }
  // aizuchi — 추임새 audio만 따로 노출(웹이 발화 끝 즉시 연쇄 재생 → LLM 구간 흡수)
  const aizuchi = lines.filter((l) => AIZUCHI.includes(l.text)).map((l) => l.audio);
  // 엔딩 테마 — 캐시 음성 콜라주(MusicPort, 신규 TTS 0·§11 BGM 자리). 음성 빌드 후 자동 생성.
  let bgm: { ending: string; bytes: number } | undefined;
  const hashOf = (frag: string): string | undefined => lines.find((l) => l.text.includes(frag))?.hash;
  const padH = hashOf("また来てね"), accentH = hashOf("いいね");
  const rhythmH = ["うーん", "えーと", "あのー", "んー"].map(hashOf).filter((h): h is string => !!h);
  if (padH && rhythmH.length >= 2) {
    const a = await makeCollageMusic({ audioDir: fileURLToPath(sharedDir), outDir: fileURLToPath(new URL("bgm/", outDir)), tmpDir: "/tmp/vq-music" })
      .gen({ prompt: `${EP_ID} 엔딩 테마`, durationSec: 12, loop: false, kind: "ending",
        sources: [{ hash: padH, role: "pad" }, ...rhythmH.map((h) => ({ hash: h, role: "rhythm" as const })), ...(accentH ? [{ hash: accentH, role: "accent" as const }] : [])] });
    bgm = { ending: `/cache/${SHORT}/bgm/ending.m4a`, bytes: a.bytes };
    console.log(`  🎵 엔딩 테마(콜라주): ${(a.bytes / 1024).toFixed(0)}KB · 소스 ${1 + rhythmH.length + (accentH ? 1 : 0)}개`);
  }
  writeFileSync(new URL("manifest.json", outDir), JSON.stringify({ episode: SHORT, lines, aizuchi, bgm }, null, 2));
  // §11 dedup·예산 강제 — engine buildManifest로 고유 자산만 카운트, 8MB 초과 시 빌드 실패
  const entries = lines.map((l) => ({ key: l.text, hash: l.hash, url: l.audio, bytes: l.bytes, format: l.audio.endsWith(".m4a") ? "m4a" : "wav", kind: "voice" as const }));
  const mani = buildManifest(SHORT, entries);
  const dupSaved = lines.length - mani.entries.length;
  console.log(`\n✅ ${EP_ID}: ${lines.length}줄 → 고유 ${mani.entries.length}개(중복 ${dupSaved} dedup), ${(mani.totalBytes / 1024).toFixed(0)}KB ${mani.withinBudget ? "✓ 예산 내" : "⚠ 예산 초과 " + (EPISODE_BYTE_BUDGET / 1024 / 1024) + "MB"}`);
  if (!mani.withinBudget) { console.error("⚠ 에피소드 예산(8MB) 초과 — dedup·압축 강화 필요"); process.exit(1); }
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
