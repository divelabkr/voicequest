// 빌드타임 캐시 데모 — ep_01의 이미지/음악을 mock 생성 → 매니페스트 + §11 압축 효과.
// 실제론 Nano Banana(이미지)/음악 API가 어댑터에서 채운다. 여기선 포트만 mock.
// 실행: pnpm --filter @voicequest/spike cachebuild
import { buildEpisodeCache } from "@voicequest/api";
import { parseEpisode } from "@voicequest/engine";
import type { ImagePort, MusicPort } from "@voicequest/engine";
import ep01raw from "../content/episodes/ep_01_daiki_diner.json";

const episode = parseEpisode(ep01raw);

// mock 어댑터 — §11 압축 포맷으로 반환(AVIF/Opus)
const image: ImagePort = {
  async gen(spec) {
    const bytes = (spec.kind === "background" ? 300 : 200) * 1024; // AVIF
    return { url: `cache://img/${spec.kind}.avif`, bytes, format: "avif", synthId: true };
  },
};
const music: MusicPort = {
  async gen(spec) {
    const bytes = Math.round(spec.durationSec * 8 * 1024); // Opus ~64kbps = 8KB/s
    return { url: `cache://bgm/${spec.kind}.opus`, bytes, format: "opus", synthId: true };
  },
};

// 무압축 추정(비교용): AVIF~10×, Opus~15×
const FACTOR: Record<string, number> = { avif: 10, opus: 15 };

async function main(): Promise<void> {
  console.log(`🎨 ${episode.title} — 빌드타임 캐시 생성 (이미지+음악)\n`);
  const manifest = await buildEpisodeCache({ image, music }, episode);

  for (const e of manifest.entries) {
    const kb = (e.bytes / 1024).toFixed(0);
    const icon = e.kind === "music" ? "🎵" : "🖼 ";
    console.log(`  ${icon} ${e.key.padEnd(14)} ${e.format.padEnd(5)} ${kb.padStart(5)}KB  #${e.hash}`);
  }

  const totalMB = (manifest.totalBytes / 1024 / 1024).toFixed(2);
  console.log(
    `\n  합계 ${totalMB}MB / 예산 8MB  →  ${manifest.withinBudget ? "✅ 예산 내" : "❌ 초과(빌드 실패)"}`,
  );

  // §11 압축 효과(무압축 대비 추정)
  const uncompressed = manifest.entries.reduce(
    (sum, e) => sum + e.bytes * (FACTOR[e.format] ?? 1),
    0,
  );
  const ucMB = (uncompressed / 1024 / 1024).toFixed(1);
  console.log(`  압축 효과: 무압축 ~${ucMB}MB → 압축 ${totalMB}MB (§11 ~${(uncompressed / manifest.totalBytes).toFixed(0)}×↓)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
