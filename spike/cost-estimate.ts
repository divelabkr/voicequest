// 생성 비용 추정 — 빌드타임 캐시(음성/이미지/음악). 2026-06 실단가(WebSearch), 착수 시 재검증.
// 출처: Nano Banana 2 $0.045/장(Batch 50%), MiniMax Speech 2.5 Turbo $0.04/1K자, Stable Audio $0.20/생성.
// 실행: pnpm --filter @voicequest/spike exec tsx cost-estimate.ts
import ep01raw from "../content/episodes/ep_01_daiki_diner.json";

// 단가 (USD)
const P = {
  imageStd: 0.045, // Nano Banana 2(Gemini 3.1 Flash Image) 표준 ≤1K /장. Batch 50%, 무료티어 500/일
  ttsPer1k: 0.04, // MiniMax Speech 2.5 Turbo /1,000자
  musicGen: 0.2, // Stable Audio 2.5 /생성(≤190초 루프)
};

interface Vol {
  tts: number;
  images: number;
  music: number;
}

// ep_01 현재 골격 실측(NPC 능동대사 + 모범답안 선창)
const ep = ep01raw as { scenes: Array<{ beats?: Array<{ line?: string }>; modelAnswer?: string }> };
let ttsChars = 0;
for (const s of ep.scenes) {
  if (s.beats) for (const b of s.beats) if (b.line) ttsChars += [...b.line].length;
  if (s.modelAnswer) ttsChars += [...s.modelAnswer].length;
}
const skeleton: Vol = { tts: ttsChars, images: 2, music: 1 };

// 제품 에피소드 추정: NPC 고정대사+변주풀20~30+회복음성 ≈1,500자 / 배경3+표정8=11장 / BGM2+앰비1=3
const product: Vol = { tts: 1500, images: 11, music: 3 };

function cost(v: Vol, batch = false): { img: number; tts: number; mus: number; total: number } {
  const img = v.images * (batch ? P.imageStd / 2 : P.imageStd);
  const tts = (v.tts / 1000) * P.ttsPer1k;
  const mus = v.music * P.musicGen;
  return { img, tts, mus, total: img + tts + mus };
}
const fmt = (c: ReturnType<typeof cost>): string =>
  `이미지 $${c.img.toFixed(3)} + 음성 $${c.tts.toFixed(3)} + 음악 $${c.mus.toFixed(2)} = $${c.total.toFixed(2)}`;

console.log("💰 생성 비용 — 빌드타임 1회, 2026-06 단가 (착수 시 재검증)\n");

console.log("① 현재 골격(ep_01 실측)");
console.log(`   물량: 음성 ${skeleton.tts}자 / 이미지 ${skeleton.images}장 / 음악 ${skeleton.music}개`);
console.log(`   비용: ${fmt(cost(skeleton))}\n`);

console.log("② 제품 에피소드(추정: 변주풀·표정·앰비 포함)");
console.log(`   물량: 음성 ${product.tts}자 / 이미지 ${product.images}장 / 음악 ${product.music}개`);
console.log(`   비용: ${fmt(cost(product))}`);
console.log(`   Batch 50%: ${fmt(cost(product, true))}\n`);

console.log("③ 규모 시나리오(제품 에피소드 × N, Batch 기준, 일회성)");
for (const n of [3, 30, 300]) {
  console.log(`   ep${String(n).padStart(3)}: $${(cost(product, true).total * n).toFixed(2)}`);
}

console.log("\n④ 토큰 관점(사용자 질문)");
console.log("   - 음성/음악은 토큰 과금 아님(문자/초·생성당)");
console.log("   - 이미지만 토큰 환산: Gemini ≈ 1,290토큰/장 → 제품 11장 ≈ 14.2K 출력토큰");
console.log("   - 진짜 토큰 과금 = judge(LLM)뿐. 런타임 비용은 STT+judge만, 생성은 전부 빌드타임 $0 런타임");
