// 음악 빌드 — MusicPort(콜라주 어댑터)로 에피소드 엔딩 테마 생성. cache-build 음악 잡의 코어.
// 실행: tsx music-build.ts [ep_id]. 산출: content_cache/{ep}/bgm/ending.m4a + manifest 갱신은 다음 단계.
import { makeCollageMusic } from "./music-collage";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const EP_ID = process.argv[2] ?? "ep_01_daiki_diner";
const SHORT = EP_ID.split("_").slice(0, 2).join("_");
const audioDir = fileURLToPath(new URL("../content_cache/_shared/audio", import.meta.url));
const outDir = fileURLToPath(new URL(`../content_cache/${SHORT}/bgm`, import.meta.url));

// 콜라주 소스를 manifest 텍스트로 골라 hash 해석(하드코딩 hash 대신 의미로 선택).
const mani = JSON.parse(readFileSync(new URL(`../content_cache/${SHORT}/manifest.json`, import.meta.url), "utf8")) as { lines: { text: string; hash: string }[] };
const hashOf = (frag: string): string | undefined => mani.lines.find((l) => l.text.includes(frag))?.hash;

const pad = hashOf("また来てね");
const accent = hashOf("いいね");
const rhythms = ["うーん", "えーと", "あのー", "んー"].map(hashOf).filter((h): h is string => !!h);

const sources = [
  ...(pad ? [{ hash: pad, role: "pad" as const }] : []),
  ...rhythms.map((h) => ({ hash: h, role: "rhythm" as const })),
  ...(accent ? [{ hash: accent, role: "accent" as const }] : []),
];

const music = makeCollageMusic({ audioDir, outDir, tmpDir: `/tmp/vq-music-${process.pid}` }); // 레드팀 L-3: PID 격리(동시 빌드 충돌 방지)
const asset = await music.gen({ prompt: "따뜻한 작별 엔딩 테마", durationSec: 12, loop: false, kind: "ending", sources });
console.log(`✅ ${SHORT} 엔딩 테마: ${asset.url}`);
console.log(`   ${Math.round(asset.bytes / 1024)}KB · ${asset.format} · synthId ${asset.synthId} · 소스 ${sources.length}개(pad ${pad ? 1 : 0}·rhythm ${rhythms.length}·accent ${accent ? 1 : 0})`);
