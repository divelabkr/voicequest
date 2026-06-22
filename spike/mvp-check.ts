// MVP 3종 골격 점검 — 식당·대중교통·학원물이 로드되고 골격이 섰는지.
// 실행: pnpm --filter @voicequest/spike exec tsx mvp-check.ts
import { parseEpisode } from "@voicequest/engine";
import ep1 from "../content/episodes/ep_01_daiki_diner.json";
import ep2 from "../content/episodes/ep_02_midori_transit.json";
import ep3 from "../content/episodes/ep_03_sora_school.json";

console.log("🎬 MVP 3종 골격\n");
for (const raw of [ep1, ep2, ep3]) {
  const ep = parseEpisode(raw);
  const levels = ep.scenes.map((s) => s.level ?? "-").join("→");
  const reg = ep.scenes.find((s) => s.register)?.register ?? "-";
  const opic = ep.scenes.filter((s) => s.challenge).length;
  console.log(`✅ ${ep.id}  (${ep.character})`);
  console.log(`   ${ep.title} · ${ep.scenes.length}씬 · 난이도 ${levels}`);
  console.log(`   register:${reg} · OPIc챌린지:${opic} · guide:${ep.guide ? "✓" : "✗(레거시)"}`);
  if (ep.guide) console.log(`   가이드 톤: ${ep.guide.tone}`);
  console.log();
}
