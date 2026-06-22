// 파일럿 게이트 자동 평가 + 증거 — SSOT(engine/releaseGate)의 기술 항목을 실제 산출물로 검증.
// 2차 하드닝: 하드코드 대신 실제 측정 증거(파일 수·어댑터·테스트)를 첨부한다. 실행: tsx gate-check.ts
import { existsSync, readdirSync } from "node:fs";
import { evaluateGate, PILOT_GATE } from "@voicequest/engine";

function listOf(rel: string): string[] {
  const u = new URL(rel, import.meta.url);
  return existsSync(u) ? readdirSync(u) : [];
}

const cacheFiles = listOf("../content_cache/").length;
const adapters = listOf("../packages/adapters/");
const testFiles = listOf("../packages/engine/src/").filter((f) => f.endsWith(".test.ts")).length;
const hasFirestore = adapters.includes("store-firestore");
const hasPipe = existsSync(new URL("../spike/pipe-e2e.ts", import.meta.url));

// ① 기술 — 실제 측정값으로 판정
const tech: Record<string, boolean> = {
  engine_tests: testFiles > 0,
  voice_cache: cacheFiles > 0,
  persistence: hasFirestore,
  e2e_pipe: hasPipe,
};
// ② 시장 — 알파 측정 전(운영자 입력)
const market: Record<string, boolean> = { want_replay: false, voice_comfort: false, d1_retention: false, alpha_filled: false };

// 증거 문자열 — 게이트가 "왜 그렇게 판정했는지" 추적 가능하게
const evidence: Record<string, string> = {
  engine_tests: `${testFiles}개 테스트 파일`,
  voice_cache: `content_cache ${cacheFiles}개`,
  persistence: hasFirestore ? "store-firestore 어댑터 있음" : `어댑터 ${adapters.length}종, store-firestore 없음`,
  e2e_pipe: hasPipe ? "spike/pipe-e2e.ts 검증 스크립트 존재" : "파이프 검증 없음",
  want_replay: "알파 인터뷰 미측정",
  voice_comfort: "알파 인터뷰 미측정",
  d1_retention: "계측 미수집",
  alpha_filled: "알파 0 / 25",
};

const report = evaluateGate({ tech, market });
console.log("🚦 파일럿 출시 게이트 + 증거 (SSOT: engine/releaseGate)\n");
for (const c of PILOT_GATE) {
  const ok = (c.kind === "tech" ? tech[c.id] : market[c.id]) ?? false;
  console.log(`  ${ok ? "✅" : "⬜"} [${c.kind === "tech" ? "기술" : "시장"}] ${c.label}`);
  console.log(`        ↳ ${evidence[c.id] ?? "-"}`);
}
console.log(`\n  기술 readiness ${Math.round(report.techScore * 100)}% · 시장 ${Math.round(report.marketScore * 100)}%`);
console.log(report.ready ? "\n  ▶ 파일럿 준비 완료" : `\n  ⛔ 미충족 ${report.blocked.length}개 — 파일럿 보류`);
process.exit(report.ready ? 0 : 1); // 미충족 시 exit 1 (CI 게이트 신호)
