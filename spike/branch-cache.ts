// 분기 공간 + 캐시 가능성 — judge가 무한 입력(발화 길이·내용)을 유한 등급으로 양자화.
// 분기(출력)가 유한이면 NPC 응답을 전부 빌드타임 사전생성 가능(§3 NPC는 캐시).
// 실행: pnpm --filter @voicequest/spike exec tsx branch-cache.ts
import { parseEpisode } from "@voicequest/engine";
import ep01 from "../content/episodes/ep_01_daiki_diner.json";
import ep02 from "../content/episodes/ep_02_midori_transit.json";
import ep03 from "../content/episodes/ep_03_sora_school.json";

const GRADES = 4; // S/A/B/C — judge 양자화 출력
const RECOVERY_STEPS = 4; // hint/hum/lead/echo
const AFFINITY_BANDS = 3; // 호감도대 변주(낮/중/높) — §11 dedup으로 공유

console.log("🌳 분기 공간 + 캐시 가능성\n");
console.log("judge = 양자화기: 무한 발화(길이·내용) → 유한 등급(S/A/B/C) + recovery\n");

let grand = 0;
for (const raw of [ep01, ep02, ep03]) {
  const ep = parseEpisode(raw);
  const n = ep.scenes.length;
  const npc = n * GRADES * AFFINITY_BANDS; // 씬×등급×호감도대
  const rec = n * RECOVERY_STEPS; // 씬×회복단계
  const total = npc + rec;
  grand += total;
  console.log(
    `${ep.id.padEnd(22)} ${n}씬 → NPC ${npc}(씬×4등급×호감도${AFFINITY_BANDS}) + recovery ${rec} = ${total} 캐시단위`,
  );
}

console.log(`\n총 ${grand} 캐시단위 — 전부 빌드타임 사전생성 가능(콘텐츠 공장 + §11 dedup).`);
console.log("발화는 무한이지만 분기는 유한 → 런타임은 judge 등급으로 '캐시 조회만'(규칙3).");
console.log("\n⚠️ 한계: 유저 발화 '내용'을 그대로 반영한 맞춤 반응(예: '한국서 왔다'→'한국 어디?')은");
console.log("   등급 캐시로 못 함 → 규칙4(골격 고정·완전 자유대화 금지)로 등급별 변주 응답을 캐시.");
