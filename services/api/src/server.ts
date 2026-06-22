// HTTP 서버(CLAUDE.md §5) — POST /session/turn(오디오) → runTurn. Node 내장 http, 의존성 0.
// 인메모리 세션 + access 게이트(알파 25명·일일 턴캡). accounts/invites는 파일 영속(data/vq-state.json).
import { createServer, type IncomingMessage } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, readdirSync, writeFile, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initState, parseEpisode, canSpendTurn, recordTurn, STAGE_LIMITS, buildReadModel, timeToFirstWin, dropPoint, churnRisk, signup, canUseVoice, withdraw, issueInvite, redeemInvite, revokeInvite, evaluateGate, validateGeneratedScene, emptyMeter, rollMonth, recordCall, checkBudget, DEFAULT_BUDGET, canStart, spend, recharge, todaysCards, reviewCard, completeToday, makeCard } from "@voicequest/engine";
import type { GameState, UsageState, GameEvent, EventStorePort, Account, ConsentFlags, InviteCode, Scene, Strictness, CostMeter, EnergyState, Episode, Grade, DailyState, DailyCard } from "@voicequest/engine";
import { randomBytes } from "node:crypto";
import { runTurn } from "./session";
import { bootstrap, loadEnv } from "./bootstrap";
import { makeEventStore } from "@voicequest/store-firestore";

// 다중 에피소드 로드 — Select 화면이 고를 수 있게 전부 메모리에. ep=기본(레거시 호환).
const EP_DIR = fileURLToPath(new URL("../../../content/episodes/", import.meta.url));
const EPISODES = new Map<string, Episode>();
for (const f of readdirSync(EP_DIR).filter((n) => n.endsWith(".json"))) {
  try { const e = parseEpisode(JSON.parse(readFileSync(resolve(EP_DIR, f), "utf8"))); EPISODES.set(e.id, e); } catch { /* skip 손상 */ }
}
const DEFAULT_EP = "ep_01_daiki_diner";
const ep = EPISODES.get(DEFAULT_EP) ?? [...EPISODES.values()][0]!;

// 데일리 3마디 풀 — 씬당 대표 표현 + 의미(intent) + 후리가나(한글발음용, daily-yomi).
let DAILY_YOMI: Record<string, string> = {};
try { DAILY_YOMI = JSON.parse(readFileSync(new URL("../../../content/daily-yomi.json", import.meta.url), "utf8")) as Record<string, string>; } catch { /* 없으면 가나 표현만 한글발음 */ }
const DAILY_POOL: DailyCard[] = [];
{
  const seen = new Set<string>();
  for (const epx of EPISODES.values()) for (const sc of epx.scenes) {
    const expr = sc.allowedExpressions[0]; // 씬당 대표 1개 — 의미 다양성
    if (expr && !seen.has(expr)) { seen.add(expr); DAILY_POOL.push(makeCard(expr, sc.intent, `${epx.id}/${sc.id}`, DAILY_YOMI[expr])); }
  }
}
// 데일리 발화 채점 — 단일 표현 매칭(judge 골격과 별개). 정확=S·포함=A·문자겹침=B·그외=C.
function matchGrade(transcript: string, expected: string): Grade {
  const n = (s: string): string => s.replace(/[、。！？!?\s]/g, "");
  const t = n(transcript), e = n(expected);
  if (!t || !e) return "C"; // 빈 발화는 오답(빈 문자열 includes 버그 방지)
  if (t === e) return "S";
  if (t.includes(e) || e.includes(t)) return "A";
  const overlap = [...e].filter((c) => t.includes(c)).length / e.length;
  return overlap >= 0.6 ? "B" : "C";
}
const { deps, firestoreApp } = bootstrap(ep, new URL("../../../.env", import.meta.url));

// ── 콘텐츠 공장: 씬 생성기(빌드타임·admin 전용) — judge용 로컬 Qwen과 분리된 Anthropic 호출.
//    "생성은 LLM, 판정은 골격"(§4): intent는 입력값으로 강제 고정하고 sceneGuard로 검수한다.
const GEN_ENV = loadEnv(new URL("../../../.env", import.meta.url));
const ANTHROPIC_KEY = GEN_ENV.ANTHROPIC_KEY ?? GEN_ENV.ANTHROPIC_API_KEY ?? "";
const BAND_HINT: Record<Strictness, string> = {
  strict: "허용표현 1~2개(정답만), beats 짧고 정형(2개). 시험 모드.",
  normal: "허용표현 3~5개, beats 적당히 변주(3~5개).",
  lenient: "허용표현 6개+(구어·반말·동의어), beats 풍부·감정적(5~7개). 단 자유대화 아님.",
};
async function genScene(context: string, intent: string, strictness: Strictness, character: string): Promise<Partial<Scene>> {
  const prompt = `너는 일본어 학습 게임 콘텐츠 디자이너다. 아래로 씬 골격 1개를 JSON으로만 출력.
캐릭터: ${character}
맥락: "${context}"
의도(intent): "${intent}"  ← 이 값을 그대로 복사. 절대 바꾸지 마라.
난이도(strictness): ${strictness} — ${BAND_HINT[strictness]}
규칙: allowedExpressions(일본어)·beats만 생성. beats는 npc 선창으로 시작하고 user 비트를 최소 1개 포함.
JSON: {"intent":"${intent}","allowedExpressions":["..."],"beats":[{"kind":"npc","line":"..."},{"kind":"user"}]}
JSON만, 설명 없이.`;
  // Qwen 극한 — 키 있으면 Anthropic 품질, 없으면 무료 로컬 Qwen(Ollama). 콘텐츠 공장도 비용 0 가능.
  const text = ANTHROPIC_KEY ? await genAnthropic(prompt) : await genQwen(prompt);
  const m = text.match(/\{[\s\S]*\}/); // 앞뒤 설명이 섞여도 JSON 본체만 추출
  return JSON.parse(m ? m[0] : "{}") as Partial<Scene>;
}
async function genAnthropic(prompt: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`anthropic_${r.status}`);
  const j = (await r.json()) as { content?: Array<{ text?: string }> };
  return j.content?.[0]?.text ?? "{}";
}
async function genQwen(prompt: string): Promise<string> {
  const r = await fetch("http://localhost:11434/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "qwen3-coder:30b", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } }),
  });
  if (!r.ok) throw new Error(`qwen_${r.status}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "{}";
}

// 캐시 빌드 산출물(음성+후리가나+단어뜻) — runTurn 결과에 붙여 반환
type CacheLine = { text: string; audio: string; furigana: string; words: { w: string; gloss: string }[] };
// 에피소드별 음성 manifest(없으면 자막) — 캐시 디렉토리 ep_01/ep_02/ep_03
const MANIFESTS = new Map<string, { lines: CacheLine[] }>();
const shortOf = (epId: string): string => epId.split("_").slice(0, 2).join("_");
function loadManifest(epId: string): void {
  try { MANIFESTS.set(epId, JSON.parse(readFileSync(new URL(`../../../content_cache/${shortOf(epId)}/manifest.json`, import.meta.url), "utf8")) as { lines: CacheLine[] }); } catch { /* 음성 없음 = 자막 */ }
}
for (const epId of EPISODES.keys()) loadManifest(epId);

const STAGE = "alpha" as const;
const CAP = STAGE_LIMITS[STAGE].capacity;
const sessions = new Map<string, { state: GameState; usage: UsageState; events: GameEvent[]; energy: EnergyState; episodeId: string }>();
const dailyStates = new Map<string, DailyState>(); // userId별 데일리 3마디 SRS·스트릭(영속)
const accounts = new Map<string, Account>();
const invites = new Map<string, InviteCode>();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

// [M2] CORS allowlist — 전역 *을 금지하고 내부 도구(admin/web) origin만 허용. CORS_ORIGINS로 추가.
const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:8090", "http://localhost:8095", "http://localhost:8096",
  ...(process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
]);

// 경로 상수(절대경로) — [C2] 캐시 traversal 검증, [M1] 게이트 산출물 검증에 사용
const CACHE_ROOT = fileURLToPath(new URL("../../../content_cache", import.meta.url)); // trailing slash 없이(검증의 +"/" 중복 방지)
const ENGINE_SRC = fileURLToPath(new URL("../../../packages/engine/src/", import.meta.url));
const STORE_ADAPTER = fileURLToPath(new URL("../../../packages/adapters/store-firestore", import.meta.url));
const PIPE_E2E = fileURLToPath(new URL("../../../spike/pipe-e2e.ts", import.meta.url));

// [M3] 영속 — accounts/invites 파일 저장(재시작 보존). 비동기 + 디바운스 + 실패 로깅.
const DATA_DIR = fileURLToPath(new URL("../../../data/", import.meta.url));
const STATE_FILE = fileURLToPath(new URL("../../../data/vq-state.json", import.meta.url));
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveState(): void {
  if (saveTimer) return; // 디바운스: 연속 변경을 200ms마다 한 번만 기록(블로킹 방지)
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFile(STATE_FILE, JSON.stringify({ accounts: [...accounts], invites: [...invites], daily: [...dailyStates] }), (err) => {
        if (err) console.error("[persist] saveState 실패:", err.message); // 실패를 더는 삼키지 않음
      });
    } catch (e) { console.error("[persist] saveState 실패:", String(e)); }
  }, 200);
}
try {
  const s = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { accounts: [string, Account][]; invites: [string, InviteCode][]; daily?: [string, DailyState][] };
  for (const [k, v] of s.accounts) accounts.set(k, v);
  for (const [k, v] of s.invites) invites.set(k, v);
  for (const [k, v] of s.daily ?? []) dailyStates.set(k, v);
} catch { /* 첫 실행: 상태 파일 없음 */ }

// [M5] 일일 턴캡 리셋 기준 = KST(UTC+9) 자정 — 유저 체감 "오늘"과 일치
const today = (): string => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
// ── 비용 거버넌스(⑥⑦⑧) — 월 사용량 미터(인메모리). 폭주 차단이 목적이라 재시작 리셋 허용(알파). ──
const monthKST = (): string => today().slice(0, 7); // "YYYY-MM"
let costMeter: CostMeter = emptyMeter(monthKST());
// 잊혀질 권리(§9) — 유저별 이벤트 파일 위치. 탈퇴 시 purge 대상.
const EVENTS_DIR = fileURLToPath(new URL("../../../data/events/", import.meta.url));

/** 운영자 전용 초대 코드 — crypto 랜덤. 형식 VQ-XXXX-XXXX. */
function genInviteCode(): string {
  const raw = randomBytes(4).toString("hex").toUpperCase();
  return `VQ-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}
function isAdmin(req: IncomingMessage): boolean {
  return ADMIN_TOKEN !== "" && req.headers["x-admin-token"] === ADMIN_TOKEN;
}
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
// [m2] JSON 파싱 실패를 500이 아니라 호출자가 400으로 처리하도록 null 반환
function parseBody<T>(raw: string): T | null {
  try { return JSON.parse(raw || "{}") as T; } catch { return null; }
}

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  // [M2] CORS — allowlist에 있는 origin만 반영(전역 * 제거)
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  try {
    if (req.url === "/health") {
      res.end(JSON.stringify({ ok: true, stage: STAGE, capacity: CAP, sessions: sessions.size }));
      return;
    }
    // 공개: 에피소드 목록(Select 화면) — 음성 캐시 여부 포함
    if (req.method === "GET" && req.url === "/episodes") {
      res.end(JSON.stringify({ episodes: [...EPISODES.values()].map((e) => ({ id: e.id, title: e.title, character: e.character, npcs: e.npcs ?? [], sceneCount: e.scenes.length, cached: MANIFESTS.has(e.id) })) }));
      return;
    }
    // 데일리 3마디 — 오늘의 표현(복습 due 우선 + 신규 채움) + 스트릭
    if (req.method === "GET" && req.url?.startsWith("/daily?")) {
      const sid = new URL(req.url, "http://x").searchParams.get("sid") ?? "";
      let ds = dailyStates.get(sid);
      if (!ds) { ds = { cards: [], streak: 0, lastDoneDay: 0 }; dailyStates.set(sid, ds); }
      let cards = todaysCards(ds, Date.now(), 3);
      if (cards.length < 3) {
        const have = new Set(ds.cards.map((c) => c.expression));
        const fresh = DAILY_POOL.filter((c) => !have.has(c.expression)).slice(0, 3 - cards.length);
        ds.cards.push(...fresh);
        cards = [...cards, ...fresh];
        saveState();
      }
      res.end(JSON.stringify({ cards, streak: ds.streak }));
      return;
    }
    // 데일리 발화 — audio → STT → 표현 매칭(matchGrade) → SRS 갱신 + 스트릭
    if (req.method === "POST" && req.url?.startsWith("/daily/turn")) {
      const u = new URL(req.url, "http://x");
      const sid = u.searchParams.get("sid") ?? "", exp = u.searchParams.get("exp") ?? "";
      if (!canUseVoice(accounts.get(sid))) { res.statusCode = 403; res.end(JSON.stringify({ error: "consent_required" })); return; }
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
      const audio = Buffer.concat(chunks);
      let transcript = "";
      try { const ab = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength); transcript = (await deps.stt.transcribe(ab, "ja")).text; } catch { /* STT 실패 → C */ }
      const grade = matchGrade(transcript, exp);
      let ds = dailyStates.get(sid) ?? { cards: [], streak: 0, lastDoneDay: 0 };
      const idx = ds.cards.findIndex((c) => c.expression === exp);
      if (idx >= 0) ds.cards[idx] = reviewCard(ds.cards[idx]!, grade, Date.now());
      ds = completeToday(ds, Date.now());
      dailyStates.set(sid, ds);
      saveState();
      res.end(JSON.stringify({ grade, transcript, expected: exp, streak: ds.streak }));
      return;
    }
    // ── [C2] 캐시 음성 정적 서빙 — content_cache 밖 접근 차단(traversal 방지) ──
    if (req.method === "GET" && req.url?.startsWith("/cache/")) {
      try {
        const rel = decodeURIComponent((req.url.slice("/cache/".length).split("?")[0] ?? "")).replace(/^\/+/, "");
        const full = resolve(CACHE_ROOT, rel);
        if (full !== CACHE_ROOT && !full.startsWith(CACHE_ROOT + "/")) { res.statusCode = 403; res.end("{}"); return; }
        const buf = readFileSync(full);
        res.setHeader("Content-Type", full.endsWith(".wav") ? "audio/wav" : full.endsWith(".m4a") ? "audio/mp4" : "application/octet-stream");
        res.end(buf);
      } catch { res.statusCode = 404; res.end("{}"); }
      return;
    }
    // ── 운영 현황 집계(인메모리 실값) — 대시보드 KPI ──
    if (req.url?.startsWith("/admin/stats")) {
      let turnsToday = 0;
      for (const s of sessions.values()) turnsToday += s.usage.turnsToday;
      let invited = 0, redeemed = 0;
      for (const inv of invites.values()) { invited++; if (inv.status === "redeemed") redeemed++; }
      res.end(JSON.stringify({ active: accounts.size, capacity: CAP, sessions: sessions.size, turnsToday, invited, redeemed }));
      return;
    }
    // ── 비용 거버넌스(⑥⑦⑧): 월 사용량·예산 cap·알림 레벨 ──
    if (req.url?.startsWith("/admin/budget")) {
      costMeter = rollMonth(costMeter, monthKST());
      res.end(JSON.stringify({ meter: costMeter, status: checkBudget(costMeter), budget: DEFAULT_BUDGET }));
      return;
    }
    // ── 계측: D1/D7 코호트 — accounts(가입일) + events 파일(활동일)로 리텐션 집계 ──
    if (req.method === "GET" && req.url?.startsWith("/admin/cohort")) {
      if (!isAdmin(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "admin_only" })); return; }
      const dayOf = (ts: number): number => Math.floor((ts + 9 * 3_600_000) / 86_400_000);
      const nowDay = dayOf(Date.now());
      const evFile = (uid: string): string => resolve(EVENTS_DIR, uid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) + ".jsonl");
      let signups = 0, d1e = 0, d1r = 0, d7e = 0, d7r = 0;
      for (const acc of accounts.values()) {
        signups++;
        const sDay = dayOf(acc.createdTs);
        const days = new Set<number>();
        try {
          for (const l of readFileSync(evFile(acc.userId), "utf8").split("\n")) {
            if (!l) continue; const e = JSON.parse(l) as { ts?: number }; if (e.ts) days.add(dayOf(e.ts));
          }
        } catch { /* 활동 없음 */ }
        if (nowDay > sDay) { d1e++; if (days.has(sDay + 1)) d1r++; }
        if (nowDay >= sDay + 7) { d7e++; if ([...days].some((d) => d > sDay && d <= sDay + 7)) d7r++; }
      }
      res.end(JSON.stringify({ signups, d1: { eligible: d1e, retained: d1r }, d7: { eligible: d7e, retained: d7r } }));
      return;
    }
    // ── 콘텐츠: 캐시 빌드 실행(멱등 재사용) — spike/cache-build를 잡으로 ──
    if (req.method === "POST" && req.url?.startsWith("/admin/cache-build")) {
      if (!isAdmin(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "admin_only" })); return; }
      const cwd = fileURLToPath(new URL("../../../spike/", import.meta.url));
      const epId = new URL(req.url, "http://x").searchParams.get("ep") ?? DEFAULT_EP;
      const built = await new Promise<{ ok: boolean; tail: string }>((done) => {
        const child = spawn("pnpm", ["exec", "tsx", "cache-build.ts", epId], { cwd });
        let out = "";
        child.stdout.on("data", (d) => { out += String(d); });
        child.stderr.on("data", (d) => { out += String(d); });
        child.on("close", (code) => done({ ok: code === 0, tail: out.slice(-160) }));
        child.on("error", (e) => done({ ok: false, tail: String(e) }));
      });
      loadManifest(epId);
      res.end(JSON.stringify({ ok: built.ok, ep: epId, lines: MANIFESTS.get(epId)?.lines.length ?? 0, tail: built.tail }));
      return;
    }
    // ── [M1] 파일럿 게이트 평가(SSOT: engine/releaseGate) — 기술 항목을 실제 산출물로 검증 ──
    if (req.url?.startsWith("/admin/gate")) {
      const testFiles = existsSync(ENGINE_SRC) ? readdirSync(ENGINE_SRC).filter((f) => f.endsWith(".test.ts")).length : 0;
      const cacheN = existsSync(CACHE_ROOT) ? readdirSync(CACHE_ROOT).length : 0;
      const tech = {
        engine_tests: testFiles > 0,
        voice_cache: cacheN > 0,
        persistence: existsSync(STORE_ADAPTER),
        e2e_pipe: existsSync(PIPE_E2E),
      };
      const market = { want_replay: false, voice_comfort: false, d1_retention: false, alpha_filled: false };
      res.end(JSON.stringify(evaluateGate({ tech, market })));
      return;
    }
    // ── 콘텐츠: 에피소드 목록 + 스토리보드(씬·발화트리) + 캐시 상태 ──
    if (req.url?.startsWith("/admin/episodes")) {
      const dir = fileURLToPath(new URL("../../../content/episodes/", import.meta.url));
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
      const episodes = files.map((f) => {
        try {
          const e = JSON.parse(readFileSync(resolve(dir, f), "utf8")) as {
            id: string; title?: string; character?: string;
            npcs?: Array<{ id: string; name: string; role?: string; voiceName?: string }>;
            scenes?: Array<{ id: string; intent?: string; level?: string; allowedExpressions?: string[]; beats?: Array<{ kind: string; line?: string; speaker?: string }> }>;
          };
          const scenes = e.scenes ?? [];
          const shortId = e.id.split("_").slice(0, 2).join("_"); // ep_01_daiki_diner → ep_01(캐시 디렉토리)
          const cached = existsSync(fileURLToPath(new URL(`../../../content_cache/${shortId}/manifest.json`, import.meta.url)));
          return {
            id: e.id, title: e.title ?? f, character: e.character ?? "", npcs: e.npcs ?? [],
            sceneCount: scenes.length,
            beatCount: scenes.reduce((n, s) => n + (s.beats?.length ?? 0), 0),
            cached,
            scenes: scenes.map((s) => ({ id: s.id, intent: s.intent ?? "", level: s.level ?? "", expr: s.allowedExpressions ?? [], beats: s.beats ?? [] })),
          };
        } catch { return { id: f, title: f, character: "", sceneCount: 0, beatCount: 0, cached: false, scenes: [] }; }
      });
      res.end(JSON.stringify({ episodes }));
      return;
    }
    // ── 콘텐츠 공장: 씬 생성 + 검수(§4). intent는 코드가 고정, judge가 쓸 골격을 sceneGuard가 보증 ──
    if (req.method === "POST" && req.url?.startsWith("/admin/scene-gen")) {
      if (!isAdmin(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "admin_only" })); return; }
      // 키 없어도 무료 Qwen(Ollama)으로 생성 — 503 차단 제거(Qwen 극한). 둘 다 없으면 gen_failed로 떨어짐.
      const body = parseBody<{ context: string; intent: string; strictness: Strictness; character?: string }>(await readBody(req));
      if (!body?.context || !body.intent || !body.strictness) { res.statusCode = 400; res.end(JSON.stringify({ error: "bad_request", hint: "context·intent·strictness 필요" })); return; }
      costMeter = rollMonth(costMeter, monthKST());
      const bgScene = checkBudget(costMeter);
      if (!bgScene.withinCap) { res.statusCode = 429; res.end(JSON.stringify({ error: "budget_exceeded", estUsd: Math.round(bgScene.estUsd * 100) / 100, cap: bgScene.cap })); return; }
      try {
        const raw = await genScene(body.context, body.intent, body.strictness, body.character ?? "daiki");
        costMeter = recordCall(costMeter, "gen"); // 유료 opus 호출 1건 기록
        const llmGuard = validateGeneratedScene(raw, { expectedIntent: body.intent, strictness: body.strictness });
        // intent 골격 고정 — LLM이 흔들어도 입력값으로 강제 덮어씀(고정은 프롬프트가 아니라 코드가 보증)
        const scene: Partial<Scene> = { ...raw, intent: body.intent };
        const guard = validateGeneratedScene(scene, { expectedIntent: body.intent, strictness: body.strictness });
        const llmDrift = llmGuard.flags.some((f) => f.code === "intent_drift");
        res.end(JSON.stringify({ scene, guard, llmDrift, rawIntent: (raw.intent ?? "").trim() }));
      } catch (e) {
        res.statusCode = 502; res.end(JSON.stringify({ error: "gen_failed", detail: String(e).slice(0, 150) }));
      }
      return;
    }
    // ── 에피소드 완주 결과 — readModel(6스탯·호감도·시험역량) 노출(③ Result 화면) ──
    if (req.url?.startsWith("/session/result")) {
      const sid = new URL(req.url, "http://x").searchParams.get("sid") ?? "";
      const sess = sessions.get(sid);
      if (!sess) { res.statusCode = 404; res.end(JSON.stringify({ error: "no_session" })); return; }
      res.end(JSON.stringify(buildReadModel(sess.events)));
      return;
    }
    if (req.url?.startsWith("/session/signals")) {
      const sid = new URL(req.url, "http://x").searchParams.get("sid") ?? "anon";
      const ev = sessions.get(sid)?.events ?? [];
      res.end(JSON.stringify({ timeToFirstWin: timeToFirstWin(ev), dropPoint: dropPoint(ev), churnRisk: churnRisk(ev) }));
      return;
    }
    // ── 운영자: 초대 코드 생성 ──
    if (req.method === "POST" && req.url?.startsWith("/admin/invite")) {
      if (!isAdmin(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "admin_only" })); return; }
      const body = parseBody<{ note?: string }>(await readBody(req)) ?? {};
      const code = genInviteCode();
      invites.set(code, issueInvite(code, Date.now(), body.note));
      saveState();
      res.end(JSON.stringify({ code }));
      return;
    }
    // ── 운영자: 발급 목록(콘솔 회원 카테고리) ──
    if (req.method === "GET" && req.url?.startsWith("/admin/invites")) {
      if (!isAdmin(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "admin_only" })); return; }
      res.end(JSON.stringify({ invites: [...invites.values()] }));
      return;
    }
    // ── 운영자: 가입 계정 목록(회원 관리) ──
    if (req.method === "GET" && req.url?.startsWith("/admin/accounts")) {
      if (!isAdmin(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "admin_only" })); return; }
      const list = [...accounts.values()].map((a) => ({ userId: a.userId, status: a.status, createdTs: a.createdTs }));
      res.end(JSON.stringify({ accounts: list, active: accounts.size, capacity: CAP }));
      return;
    }
    // ── 운영자: 계정 삭제(테스트 정리 + 잊혀질 권리 §9 — events purge·세션·코드 회수) ──
    if (req.method === "POST" && req.url?.startsWith("/admin/account/delete")) {
      if (!isAdmin(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: "admin_only" })); return; }
      const body = parseBody<{ userId: string }>(await readBody(req));
      if (!body?.userId) { res.statusCode = 400; res.end(JSON.stringify({ error: "bad_request" })); return; }
      if (!accounts.has(body.userId)) { res.statusCode = 404; res.end(JSON.stringify({ error: "no_account" })); return; }
      for (const [code, inv] of invites) { if (inv.boundUserId === body.userId) invites.set(code, revokeInvite(inv)); }
      sessions.delete(body.userId);
      accounts.delete(body.userId);
      try { await makeEventStore({ firestoreApp, eventsDir: EVENTS_DIR, userId: body.userId }).purge?.(body.userId); } catch (e) { console.error("[purge]", String(e)); }
      saveState();
      res.end(JSON.stringify({ deleted: body.userId }));
      return;
    }
    // ── [C1] 사용자: 초대 코드 사용 → 가입. alpha의 *유일한* 가입 경로. ──
    //    (초대코드 없는 /auth/signup은 비공개 게이트를 우회하므로 제거했다.)
    if (req.method === "POST" && req.url?.startsWith("/auth/redeem")) {
      const body = parseBody<{ code: string; userId: string; consent: ConsentFlags }>(await readBody(req));
      if (!body?.code || !body.userId || !body.consent) { res.statusCode = 400; res.end(JSON.stringify({ error: "bad_request" })); return; }
      const rd = redeemInvite(invites.get(body.code), body.userId, Date.now());
      if (!rd.ok) { res.statusCode = 403; res.end(JSON.stringify({ error: `invite_${rd.reason}` })); return; }
      // [C3] 아래는 await 없이 동기 실행 — 정원 검사·예약이 원자적(동시 요청 정원 초과 방지).
      //      여기에 await를 새로 끼우면 race가 생기니 주의.
      const existing = accounts.get(body.userId);
      if (existing) { invites.set(body.code, rd.invite); saveState(); res.end(JSON.stringify(existing)); return; }
      if (accounts.size >= CAP) { res.statusCode = 429; res.end(JSON.stringify({ status: "waitlisted" })); return; }
      const acc = signup(body.userId, body.consent, Date.now());
      accounts.set(body.userId, acc); // 자리 즉시 예약(size 증가)
      invites.set(body.code, rd.invite); // 코드 바인딩 확정
      saveState();
      res.end(JSON.stringify(acc));
      return;
    }
    // ── 탈퇴(잊혀질 권리 — 계정·세션·이벤트 삭제 + 코드 폐기) ──
    if (req.method === "POST" && req.url?.startsWith("/account/withdraw")) {
      const sid = new URL(req.url, "http://x").searchParams.get("sid") ?? "";
      const acc = accounts.get(sid);
      if (!acc) { res.statusCode = 404; res.end(JSON.stringify({ error: "no_account" })); return; }
      const w = withdraw(acc);
      for (const [code, inv] of invites) {
        if (inv.boundUserId === sid) invites.set(code, revokeInvite(inv));
      }
      sessions.delete(sid);
      accounts.delete(sid);
      // 잊혀질 권리(§9) — 영속 events 파일도 삭제(미연결이면 noop, 연결 시 자동 적용)
      try { await makeEventStore({ firestoreApp, eventsDir: EVENTS_DIR, userId: sid }).purge?.(sid); } catch (e) { console.error("[purge] events:", String(e)); }
      saveState();
      res.end(JSON.stringify({ status: w.account.status, purged: w.purge }));
      return;
    }
    // ── 턴 루프 ──
    if (req.method === "POST" && req.url?.startsWith("/session/turn")) {
      const sid = new URL(req.url, "http://x").searchParams.get("sid") ?? "anon";
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const audio = Buffer.concat(chunks);
      // 계정·동의 게이트(§9): 가입 + 국외이전 동의 없으면 음성 사용 불가
      if (!canUseVoice(accounts.get(sid))) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: "consent_required", hint: "POST /auth/redeem" }));
        return;
      }
      let sess = sessions.get(sid);
      if (!sess) {
        const epId = new URL(req.url, "http://x").searchParams.get("ep") ?? DEFAULT_EP;
        sess = { state: initState(EPISODES.get(epId) ?? ep), usage: { turnsToday: 0, dayStamp: today() }, events: [], energy: { current: 20, max: 20 }, episodeId: epId };
        sessions.set(sid, sess);
      }
      if (!canSpendTurn(sess.usage, STAGE, today())) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: "daily_turn_cap", cap: STAGE_LIMITS[STAGE].dailyTurnCap }));
        return;
      }
      // 에너지 일일 회복(자정 max) + 게이트(⑤) — 페이싱 장치(과금 게이트 아님)
      if (sess.usage.dayStamp !== today()) sess.energy = recharge(sess.energy, sess.energy.max);
      if (audio.byteLength > 0 && !canStart(sess.energy)) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: "no_energy", current: sess.energy.current, max: sess.energy.max }));
        return;
      }
      const ab = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
      // events 영속(⑥) — 인메모리(signals용) + 유저별 파일(재시작·readModel 누적) 병행
      const userStore = makeEventStore({ firestoreApp, eventsDir: EVENTS_DIR, userId: sid });
      const sessStore: EventStorePort = {
        async append(e) { sess!.events.push(e); await userStore.append(e); },
        async readModel() { return buildReadModel(sess!.events); },
      };
      // OPIc 적응형 난이도(④) — 최근 등급으로 strictness 동적 조정
      const recentGrades = sess.events.filter((e): e is Extract<GameEvent, { type: "turn_spoken" }> => e.type === "turn_spoken").map((e) => e.grade).slice(-5);
      const _t0 = Date.now();
      const { result, state } = await runTurn({ ...deps, store: sessStore, episode: EPISODES.get(sess.episodeId) ?? ep }, sess.state, ab, Date.now(), recentGrades);
      const turnMs = Date.now() - _t0;
      if (result.grade !== "-") console.log(`[turn] ${turnMs}ms ${result.reason === "fast_exact_match" ? "⚡fast" : "🤖llm"} grade=${result.grade}`);
      sess.state = state;
      if (result.awaitsUser && result.grade !== "-") {
        sess.usage = recordTurn(sess.usage, today());
        sess.energy = spend(sess.energy); // 실발화 1회 에너지 소비(⑤)
        costMeter = rollMonth(costMeter, monthKST());
        costMeter = recordCall(recordCall(costMeter, "stt"), "judge"); // 유료 STT 1 + judge(로컬 0원) 카운트
      }
      const norm = (s: string): string => s.replace(/！/g, "!").replace(/？/g, "?").trim();
      const manifest = MANIFESTS.get(sess.episodeId);
      const cl = manifest?.lines.find((l) => norm(l.text) === norm(result.npcLine));
      const enriched = cl ? { ...result, furigana: cl.furigana, words: cl.words, audioUrl: `/cache/${shortOf(sess.episodeId)}/${cl.audio}` } : result;
      const sessEp2 = EPISODES.get(sess.episodeId) ?? ep;
      const sceneNo = sessEp2.scenes.findIndex((s) => s.id === state.currentSceneId) + 1;
      res.end(JSON.stringify({ ...enriched, progress: { scene: sceneNo || 1, total: sessEp2.scenes.length }, timing: { ms: turnMs, fast: result.reason === "fast_exact_match" } }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e).slice(0, 200) }));
  }
});

const PORT = Number(process.env.PORT ?? 8787);
server.listen(PORT, () => console.log(`VoiceQuest API :${PORT} (stage=${STAGE})`));
