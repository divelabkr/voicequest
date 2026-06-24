// judge 멀티모델 벤치마크 — Claude Haiku vs Gemini Flash vs GPT.
// 목적: judge(전사 vs scene.allowedExpressions 골격 매칭, S/A/B/C)에 "빠르고 고품질"인 모델 결정(비용 부차).
// 동일 프롬프트(JUDGE_RULES + sceneToPrompt + transcript)를 세 모델에 보내 등급 파싱 → 정확도·레이턴시·토큰 비교.
// 실행: pnpm -C services/api exec tsx src/bench-judge.ts
//
// 프롬프트·파싱은 llm-qwen 차용(모델만 교체). 키는 loadEnv(.env)에서만 읽음(어댑터는 env를 모름·규칙7).
// 키/토큰 문자열은 로그·출력에 절대 노출하지 않는다.
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { parseEpisode, JUDGE_RULES, sceneToPrompt } from "@voicequest/engine";
import type { Grade, Scene } from "@voicequest/engine";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { loadEnv } from "./bootstrap";

// ── 키 로드(노출 금지) ─────────────────────────────────────────────
const env = loadEnv(new URL("../../../.env", import.meta.url));
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_KEY ?? "";
const GEMINI_KEY = env.GEMINI_KEY ?? "";
const OPENAI_KEY = env.OPENAI_KEY ?? env.OPENAI_API_KEY ?? "";

// 모델 ID — 공식 문서/SDK 목록으로 확인한 최신 "빠른 고품질" 계열(2026-06 기준).
const CLAUDE_MODEL = "claude-haiku-4-5"; // Anthropic 가장 빠른 저지연 티어(claude-api 스킬 확인)
const GEMINI_MODEL = "gemini-3.5-flash"; // 최신 stable Flash(ai.google.dev/models·키 ListModels 확인)
const GPT_MODEL = "gpt-5-mini"; // 빠른 고품질 계열(키 있을 때만; 없으면 제외)

// ── 발화 케이스 세트 — ep_01 씬에서 (정답/부분/무관/변형) 생성 ─────────
type Expected = { grade: Grade; accept: Grade[] }; // accept: 동등 허용(부분·변형은 흡수 폭 있음)
interface Case {
  id: string;
  sceneId: string;
  scene: Scene;
  kind: "정답" | "부분" | "무관오답" | "유사변형";
  transcript: string;
  expected: Expected;
}

const ep = parseEpisode(
  JSON.parse(readFileSync(new URL("../../../content/episodes/ep_01_daiki_diner.json", import.meta.url), "utf8")),
);
// 골격 매칭 씬만(OPIc 자유발화 s7은 rubric 평가라 제외 — allowedExpressions 비어있음).
const scenes = ep.scenes.filter((s) => !s.challenge && s.allowedExpressions.length > 0);

// 씬별 (부분=반말/짧은형) (무관오답) (유사변형=정중 동등) — 손으로 정의(라벨 신뢰성↑).
// expected: JUDGE_RULES 기준 — 정답(です/ます)=S, 부분(반말)=A, 무관=C, 변형(정중동등)=S(흡수, A도 허용).
const perScene: Record<string, { partial: string; off: string; variant: string }> = {
  s1_order_entry: { partial: "ひとり", off: "今日はいい天気ですね", variant: "一人で大丈夫です" },
  s2_order: { partial: "ラーメン", off: "トイレはどこですか", variant: "ラーメンにします" },
  s3_recommend: { partial: "おすすめ", off: "全然わかりません", variant: "おすすめを教えてください" },
  s4_chat: { partial: "うまい", off: "もう帰ります", variant: "すごくおいしいです" },
  s5_check: { partial: "いくら", off: "ありがとう、また明日", variant: "お会計をお願いします" },
  s6_farewell: { partial: "また", off: "メニューもう一回見せて", variant: "ごちそうさまでした、また来ます" },
};

const cases: Case[] = [];
for (const scene of scenes) {
  const ps = perScene[scene.id];
  if (!ps) continue;
  const correct = scene.allowedExpressions[0]!; // 정답 = allowedExpressions[0] (대개 です/ます)
  cases.push({ id: `${scene.id}/정답`, sceneId: scene.id, scene, kind: "정답", transcript: correct, expected: { grade: "S", accept: ["S", "A"] } });
  cases.push({ id: `${scene.id}/부분`, sceneId: scene.id, scene, kind: "부분", transcript: ps.partial, expected: { grade: "A", accept: ["A", "B"] } });
  cases.push({ id: `${scene.id}/무관`, sceneId: scene.id, scene, kind: "무관오답", transcript: ps.off, expected: { grade: "C", accept: ["C"] } });
  cases.push({ id: `${scene.id}/변형`, sceneId: scene.id, scene, kind: "유사변형", transcript: ps.variant, expected: { grade: "S", accept: ["S", "A"] } });
}

// ── 동일 프롬프트 빌더(llm-qwen 차용) — 세 모델에 같은 system/user ─────
const buildUser = (scene: Scene, transcript: string): string =>
  `${sceneToPrompt(scene)}\n유저 발화: "${transcript}" / 엄격도:normal / 호감도:0`;

// JSON 텍스트에서 grade 파싱(llm-qwen 로직 차용 + 코드펜스/잡텍스트 방어).
function parseGrade(text: string): Grade | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) t = fence[1].trim();
  try {
    const obj = JSON.parse(t) as { grade?: string };
    if (obj.grade && ["S", "A", "B", "C"].includes(obj.grade)) return obj.grade as Grade;
  } catch { /* JSON 실패(잘림 등) → 정규식 폴백으로 grade만 구제 */ }
  const m = t.match(/"?grade"?\s*[:=]\s*"?([SABC])"?/);
  if (m && m[1]) return m[1] as Grade;
  return null;
}

// ── 모델 어댑터(동일 프롬프트, 모델만 교체) — {grade, inTok, outTok} ───
interface JudgeOut { grade: Grade | null; inTok: number; outTok: number }

const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
async function judgeClaude(scene: Scene, transcript: string): Promise<JudgeOut> {
  const res = await anthropic!.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: `${JUDGE_RULES}\n\n${sceneToPrompt(scene)}`,
    messages: [{ role: "user", content: buildUser(scene, transcript) }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { grade: parseGrade(text), inTok: res.usage.input_tokens ?? 0, outTok: res.usage.output_tokens ?? 0 };
}

const genai = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;
async function judgeGemini(scene: Scene, transcript: string): Promise<JudgeOut> {
  const res = await genai!.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildUser(scene, transcript),
    config: {
      systemInstruction: `${JUDGE_RULES}\n\n${sceneToPrompt(scene)}`,
      responseMimeType: "application/json",
      // gemini-3.5-flash는 thinking 모델 — 내부 사고(thoughtsTokenCount 250~550)가 출력 예산을 먹는다.
      // 512면 JSON이 MAX_TOKENS로 잘려 등급 파싱 실패 → 사고+완결 JSON 여유로 2048.
      maxOutputTokens: 2048,
    },
  });
  const u = res.usageMetadata;
  // candidatesTokenCount는 가시 출력만 — judge 비교 형평을 위해 사고 토큰(thoughtsTokenCount)도 출력 측에 합산.
  const outTok = (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
  return { grade: parseGrade(res.text ?? ""), inTok: u?.promptTokenCount ?? 0, outTok };
}

const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
async function judgeGpt(scene: Scene, transcript: string): Promise<JudgeOut> {
  const res = await openai!.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      { role: "system", content: `${JUDGE_RULES}\n\n${sceneToPrompt(scene)}` },
      { role: "user", content: buildUser(scene, transcript) },
    ],
    response_format: { type: "json_object" },
  });
  const text = res.choices[0]?.message?.content ?? "";
  return { grade: parseGrade(text), inTok: res.usage?.prompt_tokens ?? 0, outTok: res.usage?.completion_tokens ?? 0 };
}

// ── 모델 등록(키 없는 모델은 사유 표시 후 제외) ──────────────────────
interface ModelDef { name: string; model: string; run: (s: Scene, t: string) => Promise<JudgeOut>; skip?: string }
const models: ModelDef[] = [
  anthropic
    ? { name: "Claude Haiku", model: CLAUDE_MODEL, run: judgeClaude }
    : { name: "Claude Haiku", model: CLAUDE_MODEL, run: async () => ({ grade: null, inTok: 0, outTok: 0 }), skip: "ANTHROPIC_API_KEY 없음 — 제외" },
  genai
    ? { name: "Gemini Flash", model: GEMINI_MODEL, run: judgeGemini }
    : { name: "Gemini Flash", model: GEMINI_MODEL, run: async () => ({ grade: null, inTok: 0, outTok: 0 }), skip: "GEMINI_KEY 없음 — 제외" },
  openai
    ? { name: "GPT", model: GPT_MODEL, run: judgeGpt }
    : { name: "GPT", model: GPT_MODEL, run: async () => ({ grade: null, inTok: 0, outTok: 0 }), skip: "OPENAI_KEY 없음 — 제외" },
];

// ── 측정 ─────────────────────────────────────────────────────────
interface Result { caseId: string; kind: Case["kind"]; expected: Grade; got: Grade | null; ok: boolean; ms: number; inTok: number; outTok: number; err?: string }
function pctile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i]!;
}

async function runModel(def: ModelDef): Promise<{ def: ModelDef; results: Result[] }> {
  const results: Result[] = [];
  if (def.skip) return { def, results };
  for (const c of cases) {
    const t0 = performance.now();
    try {
      const out = await def.run(c.scene, c.transcript);
      const ms = performance.now() - t0;
      const ok = out.grade !== null && c.expected.accept.includes(out.grade);
      results.push({ caseId: c.id, kind: c.kind, expected: c.expected.grade, got: out.grade, ok, ms, inTok: out.inTok, outTok: out.outTok });
    } catch (e) {
      // 실패 케이스는 N/A(평균·정확도에서 제외) — 키/토큰 노출 금지 위해 메시지 일부만.
      results.push({ caseId: c.id, kind: c.kind, expected: c.expected.grade, got: null, ok: false, ms: 0, inTok: 0, outTok: 0, err: String(e instanceof Error ? e.message : e).slice(0, 80) });
    }
  }
  return { def, results };
}

const pad = (s: string, n: number): string => {
  // 한글 폭 보정(대략 2칸).
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
  return s + " ".repeat(Math.max(0, n - w));
};

async function main(): Promise<void> {
  console.log("🧪 judge 멀티모델 벤치마크 — 빠르고 고품질(비용 부차)");
  console.log(`   케이스 ${cases.length}개(씬 ${scenes.length} × 정답/부분/무관/변형) · 동일 프롬프트(JUDGE_RULES + sceneToPrompt)\n`);
  const active = models.filter((m) => !m.skip);
  const skipped = models.filter((m) => m.skip);
  console.log(`   대상: ${active.map((m) => `${m.name}(${m.model})`).join(" · ") || "(없음)"}`);
  for (const s of skipped) console.log(`   ⊘ ${s.name}: ${s.skip}`);
  console.log("");

  // 모델별 순차 실행(레이턴시 격리 — 병렬은 서로 간섭).
  const runs: Array<{ def: ModelDef; results: Result[] }> = [];
  for (const def of models) {
    if (!def.skip) process.stdout.write(`   ▶ ${def.name} 호출 중…`);
    const r = await runModel(def);
    if (!def.skip) {
      const done = r.results.filter((x) => !x.err).length;
      console.log(` ${done}/${cases.length} 완료(N/A ${r.results.length - done})`);
    }
    runs.push(r);
  }
  console.log("");

  // ── 비교 표 ──
  console.log("━━━ 모델 비교(정확도·레이턴시·토큰) ━━━");
  console.log(`${pad("모델", 16)}${pad("정확도", 14)}${pad("p50(ms)", 10)}${pad("p95(ms)", 10)}${pad("평균in", 8)}${pad("평균out", 8)}N/A`);
  const summary: Array<{ name: string; acc: number; p50: number; p95: number; n: number }> = [];
  for (const { def, results } of runs) {
    if (def.skip) {
      console.log(`${pad(def.name, 16)}${pad("— 제외 —", 14)}${pad("-", 10)}${pad("-", 10)}${pad("-", 8)}${pad("-", 8)}-`);
      continue;
    }
    const valid = results.filter((r) => !r.err && r.got !== null);
    const na = results.length - valid.length;
    const correct = valid.filter((r) => r.ok).length;
    const acc = valid.length ? (correct / valid.length) * 100 : 0;
    const lats = valid.map((r) => r.ms);
    const p50 = pctile(lats, 50);
    const p95 = pctile(lats, 95);
    const avgIn = valid.length ? Math.round(valid.reduce((a, r) => a + r.inTok, 0) / valid.length) : 0;
    const avgOut = valid.length ? Math.round(valid.reduce((a, r) => a + r.outTok, 0) / valid.length) : 0;
    console.log(
      `${pad(def.name, 16)}${pad(`${acc.toFixed(1)}% (${correct}/${valid.length})`, 14)}${pad(String(Math.round(p50)), 10)}${pad(String(Math.round(p95)), 10)}${pad(String(avgIn), 8)}${pad(String(avgOut), 8)}${na}`,
    );
    summary.push({ name: `${def.name}(${def.model})`, acc, p50, p95, n: valid.length });
  }
  console.log("");

  // ── 불일치 케이스 샘플(어느 모델이 어떤 발화를 틀렸나) ──
  console.log("━━━ 불일치 케이스 샘플 ━━━");
  const mismatches: string[] = [];
  for (const { def, results } of runs) {
    if (def.skip) continue;
    for (const r of results) {
      if (r.err) { mismatches.push(`  [${def.name}] ${pad(r.caseId, 22)} 기대 ${r.expected} → N/A(err: ${r.err})`); continue; }
      if (!r.ok) {
        const c = cases.find((x) => x.id === r.caseId)!;
        mismatches.push(`  [${def.name}] ${pad(r.caseId, 22)} 기대 ${r.expected} → 받음 ${r.got ?? "파싱실패"}   발화="${c.transcript}"`);
      }
    }
  }
  if (mismatches.length === 0) console.log("  (없음 — 모든 모델이 기대 등급과 일치)");
  else mismatches.slice(0, 8).forEach((m) => console.log(m));
  if (mismatches.length > 8) console.log(`  … 외 ${mismatches.length - 8}건`);
  console.log("");

  // ── 결론(빠르고 고품질 1순위) ──
  console.log("━━━ 결론 ━━━");
  if (summary.length === 0) {
    console.log("  활성 모델 없음 — 키 확인 필요.");
  } else {
    // 정확도 우선, 동률이면 p50 빠른 순(속도·정확 강조).
    const ranked = [...summary].sort((a, b) => (b.acc - a.acc) || (a.p50 - b.p50));
    ranked.forEach((m, i) =>
      console.log(`  ${i + 1}위 ${pad(m.name, 28)} 정확도 ${m.acc.toFixed(1)}% · p50 ${Math.round(m.p50)}ms · p95 ${Math.round(m.p95)}ms (n=${m.n})`),
    );
    const top = ranked[0]!;
    console.log(`\n  ➤ 추천: ${top.name} — 정확도 ${top.acc.toFixed(1)}%, p50 ${Math.round(top.p50)}ms로 "빠르고 고품질" 1순위.`);
    console.log(`    (judge는 짧은 등급 출력이라 비용은 부차 — 속도·정확 우선 판단.)`);
  }
}

main().catch((e) => { console.error("[bench-judge] 실패:", String(e instanceof Error ? e.message : e).slice(0, 300)); process.exit(1); });
