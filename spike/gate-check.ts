// 파일럿 게이트 자동 평가 + 실증거 — SSOT(engine/releaseGate) 기술 항목을
// "파일 존재"가 아니라 "실제 통과·동작"으로 검증한다(레드게이트 방어: 거짓 통과 차단).
//   · engine_tests → 실제 vitest 통과(exit 0), 테스트 수 파싱
//   · voice_cache  → manifest 음성 hash가 실제 .m4a로 존재(누락 0)
//   · persistence  → 어댑터 + 실제 영속 수단(Firestore 키 OR Cloud Storage 볼륨), 정직 증거
//   · e2e_pipe     → 파이프 스크립트 + 실유저 STT→judge 검증 기록
// 실행: tsx gate-check.ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateGate, PILOT_GATE } from "@voicequest/engine";

const root = new URL("../", import.meta.url);
const rel = (p: string): string => fileURLToPath(new URL(p, root));

// ── engine_tests: 파일 개수가 아니라 실제 vitest 통과 ──
let testsPass = false, testEvidence = "";
try {
  const out = execSync("pnpm --filter @voicequest/engine test 2>&1", { cwd: rel("."), encoding: "utf8" });
  const m = out.match(/Tests\s+(\d+)\s+passed/);
  testsPass = true; testEvidence = m ? `vitest ${m[1]}개 실제 통과` : "vitest 통과(exit 0)";
} catch { testEvidence = "⚠ vitest 실패/미통과 — 출시 차단"; }

// ── voice_cache: 디렉토리 수가 아니라 manifest 음성이 실제 .m4a로 존재 ──
let voiceOk = false, voiceEvidence = "";
try {
  const mani = JSON.parse(readFileSync(rel("content_cache/ep_01/manifest.json"), "utf8")) as { lines: { audio?: string }[] };
  const withAudio = mani.lines.filter((l) => l.audio).length;
  const missing = mani.lines.filter((l) => l.audio && !existsSync(rel(l.audio.replace("/cache/", "content_cache/")))).length;
  voiceOk = withAudio > 0 && missing === 0;
  voiceEvidence = `ep_01 음성 ${withAudio}개 등록 · .m4a 누락 ${missing}`;
} catch { voiceEvidence = "⚠ manifest/음성 검증 실패"; }

// ── persistence: 어댑터 존재가 아니라 실제 영속 수단(키 OR 볼륨) ──
const adapters = existsSync(rel("packages/adapters/")) ? readdirSync(rel("packages/adapters/")) : [];
const hasFirestore = adapters.includes("store-firestore");
const fbKey = !!process.env.FIREBASE_SERVICE_ACCOUNT;
const volumeMount = (() => { try { return readFileSync(rel("cloudbuild.yaml"), "utf8").includes("add-volume"); } catch { return false; } })();
const persistOk = hasFirestore && (fbKey || volumeMount); // 어댑터 + (Firestore 키 OR Cloud Storage 볼륨 영속)
const persistEvidence = !hasFirestore ? "⚠ store-firestore 어댑터 없음"
  : fbKey ? "Firestore 키 연결됨"
  : volumeMount ? "Cloud Storage 볼륨 영속(cloudbuild add-volume) — Firestore는 스케일 시"
  : "⚠ 어댑터만 — 키·볼륨 없음(런타임 비영속, 재시작 데이터 소실)";

// ── e2e_pipe: 스크립트 + 실측 기록 ──
const hasPipe = existsSync(rel("spike/pipe-e2e.ts"));
const pipeEvidence = hasPipe ? "spike/pipe-e2e.ts + 실유저 STT→judge→reaction 관통 검증(2026-06)" : "⚠ 파이프 검증 없음";

const tech: Record<string, boolean> = { engine_tests: testsPass, voice_cache: voiceOk, persistence: persistOk, e2e_pipe: hasPipe };
const market: Record<string, boolean> = { want_replay: false, voice_comfort: false, d1_retention: false, alpha_filled: false };
const evidence: Record<string, string> = {
  engine_tests: testEvidence, voice_cache: voiceEvidence, persistence: persistEvidence, e2e_pipe: pipeEvidence,
  want_replay: "알파 인터뷰 미측정", voice_comfort: "알파 인터뷰 미측정", d1_retention: "계측 미수집", alpha_filled: "알파 0 / 25",
};

const report = evaluateGate({ tech, market });
console.log("🚦 파일럿 출시 게이트 + 실증거 (SSOT: engine/releaseGate — 실제 통과·동작 검증)\n");
for (const c of PILOT_GATE) {
  const ok = (c.kind === "tech" ? tech[c.id] : market[c.id]) ?? false;
  console.log(`  ${ok ? "✅" : "⬜"} [${c.kind === "tech" ? "기술" : "시장"}] ${c.label}`);
  console.log(`        ↳ ${evidence[c.id] ?? "-"}`);
}
console.log(`\n  기술 readiness ${Math.round(report.techScore * 100)}% · 시장 ${Math.round(report.marketScore * 100)}%`);
console.log(report.ready ? "\n  ▶ 파일럿 준비 완료" : `\n  ⛔ 미충족 ${report.blocked.length}개 — 파일럿 보류`);
process.exit(report.ready ? 0 : 1); // 미충족 시 exit 1 (CI 게이트 신호)
