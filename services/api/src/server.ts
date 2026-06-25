// HTTP 서버(CLAUDE.md §5) — POST /session/turn(오디오) → runTurn. Node 내장 http, 의존성 0.
// 인메모리 세션 + access 게이트(알파 25명·일일 턴캡). accounts/invites는 파일 영속(data/vq-state.json).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, readdirSync, writeFile, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initState, parseEpisode, canSpendTurn, recordTurn, STAGE_LIMITS, buildReadModel, timeToFirstWin, dropPoint, churnRisk, signup, canUseVoice, withdraw, issueInvite, redeemInvite, revokeInvite, evaluateGate, validateGeneratedScene, emptyMeter, rollMonth, recordCall, checkBudget, DEFAULT_BUDGET, canStart, spend, recharge, todaysCards, reviewCard, completeToday, makeCard, sceneStats, emptyQuality, recordQuality, summarizeQuality, sanitizeId, emptyErrors, recordError, summarizeErrors, needsUpdate, judge, pickShadowCards, cardToScene, shadowLevels, shadowThemes, topicToScene, pickTopic, DAIKI_TOPICS } from "@voicequest/engine";
import type { GameState, UsageState, GameEvent, EventStorePort, Account, ConsentFlags, InviteCode, Scene, Strictness, CostMeter, EnergyState, Episode, Grade, DailyState, DailyCard, SceneLevel } from "@voicequest/engine";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { runTurn, type TurnResult } from "./session";
import { makeGenPort, genScene } from "./scene-gen";
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
    if (expr && !seen.has(expr)) { seen.add(expr); DAILY_POOL.push(makeCard(expr, sc.intent, `${epx.id}/${sc.id}`, DAILY_YOMI[expr], sc.level)); }
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
// 콘텐츠 공장 — gen helper는 scene-gen.ts로 분리(우아함[4/4] 안전 분리). 공급자는 LlmGenPort 뒤.
const genPort = makeGenPort(ANTHROPIC_KEY);

// 캐시 빌드 산출물(음성+후리가나+단어뜻) — runTurn 결과에 붙여 반환
type CacheLine = { text: string; audio: string; furigana: string; words: { w: string; gloss: string }[] };
// 에피소드별 음성 manifest(없으면 자막) — 캐시 디렉토리 ep_01/ep_02/ep_03
const normText = (s: string): string => s.replace(/！/g, "!").replace(/？/g, "?").trim();
const MANIFESTS = new Map<string, { lines: CacheLine[]; aizuchi?: string[]; bgm?: { ending: string; bytes: number }; byNorm: Map<string, CacheLine> }>();
const shortOf = (epId: string): string => epId.split("_").slice(0, 2).join("_");
function loadManifest(epId: string): void {
  try {
    const m = JSON.parse(readFileSync(new URL(`../../../content_cache/${shortOf(epId)}/manifest.json`, import.meta.url), "utf8")) as { lines: CacheLine[]; aizuchi?: string[] };
    MANIFESTS.set(epId, { ...m, byNorm: new Map(m.lines.map((l) => [normText(l.text), l] as const)) }); // 로드 1회 인덱스 — 턴 조회 O(1)
  } catch { /* 음성 없음 = 자막 */ }
}
for (const epId of EPISODES.keys()) loadManifest(epId);

const STAGE = "alpha" as const;
const CAP = STAGE_LIMITS[STAGE].capacity;
const sessions = new Map<string, { state: GameState; usage: UsageState; events: GameEvent[]; energy: EnergyState; episodeId: string; lastSeen: number }>();
const dailyStates = new Map<string, DailyState>(); // userId별 데일리 3마디 SRS·스트릭(영속)
const dailyUsage = new Map<string, UsageState>(); // userId별 데일리 일일 턴캡(STT 폭주·예산 우회 차단, /session/turn과 같은 STAGE 캡 공유 / 인메모리·재시작 리셋 허용)
const freetalkStates = new Map<string, { used: string[]; affinity: number; turns: number; dayStamp: string }>(); // 프리토크 세션 — 토픽·호감도(누적)·턴수(dayStamp 일자 리셋). saveState 영속(W2: 재시작 우회·호감도 증발 차단)
// 세션 토큰 → userId(레드팀: sid bearer 제거 — userId 위조·노출로 인한 사칭·IDOR 차단). redeem 시 발급, 영속.
const sessionTokens = new Map<string, string>();
const resolveUser = (token: string): string => sessionTokens.get(token) ?? ""; // 토큰 해석(미인증=빈문자 → accounts.has·canUseVoice 게이트가 차단)
function issueToken(userId: string): string { const t = randomBytes(24).toString("hex"); sessionTokens.set(t, userId); saveState(); return t; } // 192비트 랜덤(추측 불가)
const FREETALK_FREE_TURNS = 10; // 무료 프리토크 일일 턴(캐시카우 BM: 무료 8~10턴 + 소진 시 강등)
// freetalk 리액션 — 판정·안전 카테고리로 NPC 반응 결정. 순수·테스트 가능(W4 fail-safe: uncertain=과차단 방지).
export function freetalkReaction(grade: string, nextSceneId: string, harmful: boolean, uncertain: boolean): string {
  if (harmful) return "うーん、その話はやめておこうか。別のことを話そう。";
  if (uncertain) return "うーん、そっか。"; // W4 — category 누락+grade통과는 LLM 파싱 불안정, 보수 중립
  if (nextSceneId === "recovery") return "ごめん、もう一度言ってくれる？";
  if (grade === "B") return "なるほどね。";
  if (grade === "S" || grade === "A") return "へえ、いいね！もっと聞かせて。";
  return "うーん、そっか。";
}
const accounts = new Map<string, Account>();
const invites = new Map<string, InviteCode>();
// export — 통합 테스트가 실제 토큰/버전 게이트로 라우트를 검증(비밀값은 테스트 프로세스 내부에만, 로그 금지).
export const ADMIN_TOKEN = GEN_ENV.ADMIN_TOKEN ?? process.env.ADMIN_TOKEN ?? ""; // .env 우선(다른 키와 통일), env 폴백
export const MIN_APP_VERSION = GEN_ENV.MIN_APP_VERSION ?? process.env.MIN_APP_VERSION ?? "0.0.0"; // 앱 버전 게이트(0.0.0=비활성). 운영 시 .env로 올려 구버전 클라 차단(kill switch)

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
      writeFile(STATE_FILE, JSON.stringify({ accounts: [...accounts], invites: [...invites], daily: [...dailyStates], freetalk: [...freetalkStates], tokens: [...sessionTokens] }), (err) => {
        if (err) console.error("[persist] saveState 실패:", err.message); // 실패를 더는 삼키지 않음
      });
    } catch (e) { console.error("[persist] saveState 실패:", String(e)); }
  }, 200);
}
// 레드팀 H-3: 디바운스 윈도우 손실 방지 — 종료 시그널에 동기 flush(재시작 직전 turn 영속 보장).
function flushStateSync(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify({ accounts: [...accounts], invites: [...invites], daily: [...dailyStates], freetalk: [...freetalkStates], tokens: [...sessionTokens] })); } catch (e) { console.error("[persist] flush 실패:", String(e)); }
}
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { flushStateSync(); process.exit(0); });
try {
  const s = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { accounts: [string, Account][]; invites: [string, InviteCode][]; daily?: [string, DailyState][]; freetalk?: [string, { used: string[]; affinity: number; turns: number; dayStamp: string }][]; tokens?: [string, string][] };
  for (const [k, v] of s.accounts) accounts.set(k, v);
  for (const [k, v] of s.invites) invites.set(k, v);
  for (const [k, v] of s.daily ?? []) dailyStates.set(k, v);
  for (const [k, v] of s.freetalk ?? []) freetalkStates.set(k, v);
  for (const [k, v] of s.tokens ?? []) sessionTokens.set(k, v);
} catch { /* 첫 실행: 상태 파일 없음 */ }

// [M5] 일일 턴캡 리셋 기준 = KST(UTC+9) 자정 — 유저 체감 "오늘"과 일치
const today = (): string => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
// ── 비용 거버넌스(⑥⑦⑧) — 월 사용량 미터(인메모리). 폭주 차단이 목적이라 재시작 리셋 허용(알파). ──
const monthKST = (): string => today().slice(0, 7); // "YYYY-MM"
let costMeter: CostMeter = emptyMeter(monthKST());
let qualityMeter = emptyQuality(); // 품질 SSOT — 턴마다 fast/에러/레이턴시/신뢰도 누적(costMeter와 같은 패턴)
let errorMeter = emptyErrors(); // 에러 관측 SSOT — 클라·server 에러 자동 수집(복구 아님, 추적·가이드 전용)
let errMinute = 0, errMinuteCount = 0; // /client-error rate limit(분당 상한 — 폭주 방어)
// ── 남용·brute-force 방어 rate limit(인메모리 분당 카운터, errMinute 패턴). 재시작 리셋 허용(알파). ──
export const TURN_PER_MIN = 20;   // 세션당 분당 턴 상한(초당 연타 차단 — 일일 턴캡과 별개)
export const AUTH_FAIL_PER_MIN = 10; // IP당 분당 인증 실패 상한(admin 토큰·invite redeem brute-force 차단)
const turnRate = new Map<string, { min: number; count: number }>(); // sid → 분·카운트
const authFail = new Map<string, { min: number; count: number }>(); // ip → 분·카운트
// 세션 sid의 분당 턴 상한 검사 + 1 증가. 초과면 false(429). 분 경계마다 카운터 리셋.
export function turnRateOk(sid: string, now: number): boolean {
  const min = Math.floor(now / 60000);
  const cur = turnRate.get(sid);
  if (!cur || cur.min !== min) { turnRate.set(sid, { min, count: 1 }); return true; }
  if (cur.count >= TURN_PER_MIN) return false;
  cur.count++; return true;
}
// 테스트 전용 — 인메모리 rate 카운터 초기화(같은 loopback IP가 테스트 간 공유돼 누적되는 것 방지). 프로덕션 경로에선 호출 안 함.
export function __resetGates(): void { turnRate.clear(); authFail.clear(); }
// 요청 IP 추출 — Cloud Run 뒤라 x-forwarded-for 첫 IP가 실제 클라. 없으면 소켓 주소.
function clientIp(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  return (raw?.split(",")[0]?.trim()) || req.socket.remoteAddress || "unknown";
}
// IP의 분당 인증 실패 한도 내인지 검사(증가 없음 — 진입 게이트용). 한도 초과면 false(429).
function authFailOk(ip: string, now: number): boolean {
  const cur = authFail.get(ip);
  if (!cur || cur.min !== Math.floor(now / 60000)) return true;
  return cur.count <= AUTH_FAIL_PER_MIN;
}
// 인증 실패 1건 기록(분 경계마다 리셋). authFailOk와 짝.
function recordAuthFail(ip: string, now: number): void {
  const min = Math.floor(now / 60000);
  const cur = authFail.get(ip);
  if (!cur || cur.min !== min) { authFail.set(ip, { min, count: 1 }); return; }
  cur.count++;
}
// 인메모리 Map 누수 방지 sweep — 지난 분의 rate 카운터 + 2시간 비활성 세션 제거(과설계 없이 누수만 차단).
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2시간 비활성 세션 정리
function sweepMaps(now: number): void {
  const min = Math.floor(now / 60000);
  for (const [k, v] of turnRate) if (v.min < min) turnRate.delete(k);
  for (const [k, v] of authFail) if (v.min < min) authFail.delete(k);
  for (const [k, v] of sessions) if (now - v.lastSeen > SESSION_TTL_MS) sessions.delete(k);
  for (const k of dailyStates.keys()) if (!accounts.has(k)) dailyStates.delete(k); // accounts 없는 orphan(탈퇴·잔여) 정리 — 무한 증가 차단
  for (const k of freetalkStates.keys()) if (!accounts.has(k)) freetalkStates.delete(k); // 프리토크 세션 orphan 정리
  for (const [t, u] of sessionTokens) if (!accounts.has(u)) sessionTokens.delete(t); // 토큰 orphan 정리(삭제된 userId)
}
// 잊혀질 권리(§9) — 유저별 이벤트 파일 위치. 탈퇴 시 purge 대상.
const EVENTS_DIR = fileURLToPath(new URL("../../../data/events/", import.meta.url));

/** 운영자 전용 초대 코드 — crypto 랜덤. 형식 VQ-XXXX-XXXX. */
function genInviteCode(): string {
  const raw = randomBytes(8).toString("hex").toUpperCase(); // 64비트(레드팀: 32비트 brute-force 차단)
  return `VQ-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}
function isAdmin(req: IncomingMessage): boolean {
  if (ADMIN_TOKEN === "") return false; // 토큰 미설정이면 항상 false
  const got = req.headers["x-admin-token"];
  if (typeof got !== "string") return false;
  // timing-safe 비교 — 길이 다르면 throw하므로 byteLength 먼저 확인(불일치 시 즉시 false)
  const a = Buffer.from(got), b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}
// admin 토큰 가드(공유) — IP brute-force 한도 초과면 429, 토큰 실패면 실패 기록 후 401. 통과 시 true.
function requireAdmin(req: IncomingMessage, res: ServerResponse): boolean {
  const ip = clientIp(req), now = Date.now();
  if (!authFailOk(ip, now)) { res.statusCode = 429; res.end(JSON.stringify({ error: "too_many_attempts" })); return false; }
  if (!isAdmin(req)) { recordAuthFail(ip, now); res.statusCode = 401; res.end(JSON.stringify({ error: "admin_only" })); return false; }
  return true;
}
export const MAX_BODY = 5 * 1024 * 1024; // 요청 본문 상한 5MB(오디오·JSON 공통 — DoS·메모리 폭주 차단)
// 본문 버퍼링 + 상한 검사. 초과 시 413으로 끊고 null 반환(호출부는 null이면 return). 버퍼링 중 체크라 게이트보다 먼저 막힘.
async function readBodyBuf(req: IncomingMessage, res: ServerResponse): Promise<Buffer | null> {
  // Content-Length 선언값이 상한 초과면 버퍼링 전 즉시 413 — 소켓을 끊지 않아 413 응답이 정상 전달됨(req.destroy() 시 Cloud Run이 503 표시하던 문제 회피).
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY) { res.statusCode = 413; res.end(JSON.stringify({ error: "payload_too_large" })); return null; }
  const chunks: Buffer[] = []; let total = 0;
  for await (const c of req) {
    const buf = c as Buffer; total += buf.length;
    // chunked(길이 미선언) 스트림 초과 — 413 응답을 먼저 보낸 뒤 소켓 정리(응답 전송 후 destroy).
    if (total > MAX_BODY) { res.statusCode = 413; res.end(JSON.stringify({ error: "payload_too_large" })); req.destroy(); return null; }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
async function readBody(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
  const buf = await readBodyBuf(req, res);
  return buf === null ? null : buf.toString("utf8");
}
// [m2] JSON 파싱 실패를 500이 아니라 호출자가 400으로 처리하도록 null 반환
function parseBody<T>(raw: string): T | null {
  try { return JSON.parse(raw || "{}") as T; } catch { return null; }
}

export const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (Math.random() < 0.02) sweepMaps(Date.now()); // 요청당 2% 확률로 인메모리 Map 정리(누수 방지, 타이머 불필요)
  // [M2] CORS — allowlist에 있는 origin만 반영(전역 * 제거)
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  // 앱 버전 게이트 — 구버전 클라 차단(kill switch). /health·/client-error는 통과(버전 정보·에러 리포트는 막지 않음).
  if (!req.url?.startsWith("/health") && !req.url?.startsWith("/client-error") && needsUpdate(req.headers["x-app-version"] as string | undefined, MIN_APP_VERSION)) {
    res.statusCode = 426; // Upgrade Required
    res.end(JSON.stringify({ error: "upgrade_required", minVersion: MIN_APP_VERSION }));
    return;
  }
  try {
    if (req.url === "/health") {
      res.end(JSON.stringify({ ok: true, stage: STAGE, capacity: CAP, sessions: sessions.size, minAppVersion: MIN_APP_VERSION }));
      return;
    }
    // 정적 — 단일 서비스로 웹(/)·운영콘솔(/admin) 서빙. 같은 origin이라 admin/web은 상대경로 fetch(CORS 불필요).
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(readFileSync(new URL("../../../apps/web/public/index.html", import.meta.url)));
      return;
    }
    if (req.method === "GET" && (req.url === "/admin" || req.url === "/admin/" || req.url === "/admin/index.html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(readFileSync(new URL("../../../apps/admin/public/index.html", import.meta.url)));
      return;
    }
    // 공개: 에피소드 목록(Select 화면) — 음성 캐시 여부 포함
    if (req.method === "GET" && req.url === "/episodes") {
      res.end(JSON.stringify({ episodes: [...EPISODES.values()].map((e) => ({ id: e.id, title: e.title, character: e.character, npcs: e.npcs ?? [], sceneCount: e.scenes.length, cached: MANIFESTS.has(e.id), aizuchi: (MANIFESTS.get(e.id)?.aizuchi ?? []).map((a) => a.startsWith("/") ? a : `/cache/${shortOf(e.id)}/${a}`), bgm: MANIFESTS.get(e.id)?.bgm })) }));
      return;
    }
    // 데일리 3마디 — 오늘의 표현(복습 due 우선 + 신규 채움) + 스트릭
    if (req.method === "GET" && req.url?.startsWith("/daily?")) {
      const sid = resolveUser(new URL(req.url, "http://x").searchParams.get("sid") ?? "");
      if (!accounts.has(sid)) { res.end(JSON.stringify({ cards: [], streak: 0 })); return; } // 미인증 sid가 dailyStates를 생성 못하게(메모리 누수·DoS 차단)
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
      const sid = resolveUser(u.searchParams.get("sid") ?? ""), exp = u.searchParams.get("exp") ?? "";
      if (!canUseVoice(accounts.get(sid))) { res.statusCode = 403; res.end(JSON.stringify({ error: "consent_required" })); return; }
      // 분당 턴 상한(초당 연타 차단) — /session/turn과 동일 burst 방어
      if (!turnRateOk(sid, Date.now())) { res.statusCode = 429; res.end(JSON.stringify({ error: "rate_limited" })); return; }
      // 일일 턴캡(STT 폭주·예산 우회 차단) — /session/turn과 동일 STAGE 캡 공유. 데일리는 에너지 무관 설계 → spend 없음.
      const dUsage = dailyUsage.get(sid) ?? { turnsToday: 0, dayStamp: today() };
      if (!canSpendTurn(dUsage, STAGE, today())) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: "daily_turn_cap", cap: STAGE_LIMITS[STAGE].dailyTurnCap }));
        return;
      }
      const audio = await readBodyBuf(req, res); if (audio === null) return; // 본문 상한 초과 → 413
      let transcript = "";
      try { const ab = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer; transcript = (await deps.stt.transcribe(ab, "ja")).text; } catch { /* STT 실패 → C */ }
      dailyUsage.set(sid, recordTurn(dUsage, today())); // STT 호출 1건 = 일일캡 카운트
      costMeter = rollMonth(costMeter, monthKST());
      costMeter = recordCall(costMeter, "stt"); // 유료 STT 1건 기록(예산 SSOT)
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
    // 따라하기(섀도잉) — 파라미터(레벨·테마)로 카드 선택 → 제시 단어가 달라진다. 엔드게임 1순위(콘텐츠 0 추가).
    if (req.method === "GET" && req.url?.startsWith("/shadow?")) {
      const q = new URL(req.url, "http://x").searchParams;
      const level = (q.get("level") || undefined) as SceneLevel | undefined;
      const theme = q.get("theme") || undefined;
      const count = Math.min(12, Math.max(1, Number(q.get("count")) || 5));
      const sid = resolveUser(q.get("sid") ?? ""); // 토큰 해석(F-B replace가 q.searchParams를 못 잡아 누락됐던 것 — 개인 SRS 복구)
      // 개인 SRS 박스(dailyStates) 우선 + 미보유분은 전역 풀에서 보충 → 복습 due가 앞으로
      const personal = dailyStates.get(sid)?.cards ?? [];
      const have = new Set(personal.map((c) => c.expression));
      const pool = [...personal, ...DAILY_POOL.filter((c) => !have.has(c.expression))];
      const cards = pickShadowCards(pool, { level, theme, mode: "listen", count }, Date.now());
      res.end(JSON.stringify({ cards, levels: shadowLevels(DAILY_POOL), themes: shadowThemes(DAILY_POOL) }));
      return;
    }
    // 따라하기 발화 — audio → STT → judge(제시=정답 pseudo-scene, fastMatch 우선) → SRS 갱신. /daily/turn과 동일 게이트.
    if (req.method === "POST" && req.url?.startsWith("/shadow/turn")) {
      const u = new URL(req.url, "http://x");
      const sid = resolveUser(u.searchParams.get("sid") ?? ""), exp = u.searchParams.get("exp") ?? "";
      if (!canUseVoice(accounts.get(sid))) { res.statusCode = 403; res.end(JSON.stringify({ error: "consent_required" })); return; }
      if (!turnRateOk(sid, Date.now())) { res.statusCode = 429; res.end(JSON.stringify({ error: "rate_limited" })); return; }
      const sUsage = dailyUsage.get(sid) ?? { turnsToday: 0, dayStamp: today() };
      if (!canSpendTurn(sUsage, STAGE, today())) { res.statusCode = 429; res.end(JSON.stringify({ error: "daily_turn_cap", cap: STAGE_LIMITS[STAGE].dailyTurnCap })); return; }
      const audio = await readBodyBuf(req, res); if (audio === null) return; // 413 처리됨
      let transcript = "";
      let conf = 0; try { const ab = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer; const tr = await deps.stt.transcribe(ab, "ja"); transcript = tr.text; conf = tr.confidence; } catch { /* STT 실패 → 미매칭→recovery */ }
      dailyUsage.set(sid, recordTurn(sUsage, today()));
      costMeter = rollMonth(costMeter, monthKST());
      costMeter = recordCall(recordCall(costMeter, "stt"), "judge"); // STT 1 + judge(정답이면 fastMatch=LLM 0)
      // 제시 표현이 곧 정답 → cardToScene → judge: 정확매칭=fastMatch 즉시, 변형=LLM, 빗나감=recovery
      const jr = await judge({ transcript, sttConfidence: conf, scene: cardToScene(makeCard(exp, exp)), modifier: {}, strictness: "lenient", affinity: 0 }, deps.llm);
      const ds = dailyStates.get(sid) ?? { cards: [], streak: 0, lastDoneDay: 0 };
      const idx = ds.cards.findIndex((c) => c.expression === exp);
      if (idx >= 0) ds.cards[idx] = reviewCard(ds.cards[idx]!, jr.grade, Date.now());
      else ds.cards.push(reviewCard(makeCard(exp, exp), jr.grade, Date.now())); // 첫 복습 카드 편입
      dailyStates.set(sid, ds);
      saveState();
      res.end(JSON.stringify({ grade: jr.grade, transcript, matched: jr.matched, expected: exp }));
      return;
    }
    // 프리토크(캐시카우) — NPC가 토픽 질문 던짐 → 유저 자유발화 → OPIc rubric 평가 → 캐시 리액션. 토픽카드=골격(§0 준수, NPC 캐시).
    if (req.method === "GET" && req.url?.startsWith("/freetalk?")) {
      const sid = resolveUser(new URL(req.url, "http://x").searchParams.get("sid") ?? "");
      if (!accounts.has(sid)) { res.end(JSON.stringify({ topic: null })); return; } // 미인증 가드(누수·DoS)
      const st = freetalkStates.get(sid) ?? { used: [], affinity: 0, turns: 0, dayStamp: today() };
      if (st.dayStamp !== today()) { st.turns = 0; st.dayStamp = today(); } // 일자 리셋 — turns만 0(호감도·토픽 누적 유지, W2)
      const topic = pickTopic(DAIKI_TOPICS, st.used);
      const qa = topic ? MANIFESTS.get(DEFAULT_EP)?.byNorm.get(normText(topic.question)) : undefined;
      res.end(JSON.stringify({ topic: topic ? { id: topic.id, question: topic.question, audioUrl: qa && qa.audio.startsWith("/") ? qa.audio : "" } : null, affinity: st.affinity, remain: Math.max(0, Math.min(FREETALK_FREE_TURNS - st.turns, STAGE_LIMITS[STAGE].dailyTurnCap - (dailyUsage.get(sid)?.turnsToday ?? 0))) }));
      return;
    }
    if (req.method === "POST" && req.url?.startsWith("/freetalk/turn")) {
      const u = new URL(req.url, "http://x");
      const sid = resolveUser(u.searchParams.get("sid") ?? ""), topicId = u.searchParams.get("topic") ?? "";
      if (!canUseVoice(accounts.get(sid))) { res.statusCode = 403; res.end(JSON.stringify({ error: "consent_required" })); return; }
      if (!turnRateOk(sid, Date.now())) { res.statusCode = 429; res.end(JSON.stringify({ error: "rate_limited" })); return; }
      const fUsage = dailyUsage.get(sid) ?? { turnsToday: 0, dayStamp: today() };
      if (!canSpendTurn(fUsage, STAGE, today())) { res.statusCode = 429; res.end(JSON.stringify({ error: "daily_turn_cap", cap: STAGE_LIMITS[STAGE].dailyTurnCap })); return; }
      const topic = DAIKI_TOPICS.find((t) => t.id === topicId);
      if (!topic) { res.statusCode = 400; res.end(JSON.stringify({ error: "unknown_topic" })); return; }
      const audio = await readBodyBuf(req, res); if (audio === null) return;
      let transcript = "";
      let conf = 0; try { const ab = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer; const tr = await deps.stt.transcribe(ab, "ja"); transcript = tr.text; conf = tr.confidence; } catch { /* STT 실패 → recovery 흡수 */ }
      dailyUsage.set(sid, recordTurn(fUsage, today()));
      costMeter = rollMonth(costMeter, monthKST());
      costMeter = recordCall(recordCall(costMeter, "stt"), "judge"); // 프리토크는 매턴 judge(OPIc rubric) — 임베딩 게이트는 후속 최적화
      const jr = await judge({ transcript, sttConfidence: conf, scene: topicToScene(topic), modifier: {}, strictness: "lenient", affinity: 0 }, deps.llm);
      const harmful = jr.category === "inappropriate" || jr.category === "harmful"; // 미성년·안전 — 부적절/위험 발화 흡수(§5 판단 않고 통제)
      const uncertain = jr.category === undefined && (jr.grade === "S" || jr.grade === "A" || jr.grade === "B"); // W4 fail-safe — category 누락+통과는 파싱 불안정, 긍정 리액션 보류(과차단 방지: grade 통과시만)
      const st = freetalkStates.get(sid) ?? { used: [], affinity: 0, turns: 0, dayStamp: today() };
      if (st.dayStamp !== today()) { st.turns = 0; st.dayStamp = today(); } // 일자 리셋 — turns만 0(호감도·토픽 누적 유지, W2)
      if (!st.used.includes(topicId)) st.used.push(topicId);
      st.affinity = Math.max(-10, Math.min(20, st.affinity + (harmful ? -1 : jr.affinityDelta))); // 냉각 + clamp(-10~20, 레드팀 H-2: 무한 누적/음수 폭주 차단)
      st.turns += 1;
      freetalkStates.set(sid, st);
      saveState(); // W2 — 갱신을 디스크에 영속(디바운스). turn마다 set만 하면 재시작 시 turns·호감도 소실
      const reaction = freetalkReaction(jr.grade, jr.nextSceneId, harmful, uncertain);
      const next = pickTopic(DAIKI_TOPICS, st.used);
      const done = st.turns >= FREETALK_FREE_TURNS;
      const ra = MANIFESTS.get(DEFAULT_EP)?.byNorm.get(normText(reaction)); const na = next ? MANIFESTS.get(DEFAULT_EP)?.byNorm.get(normText(next.question)) : undefined;
      res.end(JSON.stringify({ grade: jr.grade, transcript, reaction, reactionAudio: ra && ra.audio.startsWith("/") ? ra.audio : "", affinity: st.affinity, nextTopic: done || !next ? null : { id: next.id, question: next.question, audioUrl: na && na.audio.startsWith("/") ? na.audio : "" }, done, remain: Math.max(0, Math.min(FREETALK_FREE_TURNS - st.turns, STAGE_LIMITS[STAGE].dailyTurnCap - (dailyUsage.get(sid)?.turnsToday ?? 0))) }));
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
        // 캐시 자산은 빌드타임 고정(cache-build 멱등 → 파일명=내용 불변) → 클라 1년 immutable 캐시.
        // 재다운로드 0(추임새 연쇄·NPC 반복 재생 시 대역폭·레이턴시 제거 — 캐시화 핵심).
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.end(buf);
      } catch { res.statusCode = 404; res.end("{}"); }
      return;
    }
    // ── 운영 현황 집계(인메모리 실값) — 대시보드 KPI ──
    if (req.url?.startsWith("/admin/stats")) {
      if (!requireAdmin(req, res)) return;
      let turnsToday = 0;
      for (const s of sessions.values()) turnsToday += s.usage.turnsToday;
      let invited = 0, redeemed = 0;
      for (const inv of invites.values()) { invited++; if (inv.status === "redeemed") redeemed++; }
      res.end(JSON.stringify({ active: accounts.size, capacity: CAP, sessions: sessions.size, turnsToday, invited, redeemed }));
      return;
    }
    // ── 비용 거버넌스(⑥⑦⑧): 월 사용량·예산 cap·알림 레벨 ──
    if (req.url?.startsWith("/admin/budget")) {
      if (!requireAdmin(req, res)) return;
      costMeter = rollMonth(costMeter, monthKST());
      res.end(JSON.stringify({ meter: costMeter, status: checkBudget(costMeter), budget: DEFAULT_BUDGET }));
      return;
    }
    // ── 계측: D1/D7 코호트 — accounts(가입일) + events 파일(활동일)로 리텐션 집계 ──
    if (req.method === "GET" && req.url?.startsWith("/admin/cohort")) {
      if (!requireAdmin(req, res)) return;
      const dayOf = (ts: number): number => Math.floor((ts + 9 * 3_600_000) / 86_400_000);
      const nowDay = dayOf(Date.now());
      const evFile = (uid: string): string => resolve(EVENTS_DIR, sanitizeId(uid) + ".jsonl");
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
    // ── 콘텐츠 피드백(④ 데이터 재활용) — 씬별 오답률 집계(어느 씬 어렵나 → 작가가 콘텐츠 개선) ──
    if (req.method === "GET" && req.url?.startsWith("/admin/scene-stats")) {
      if (!requireAdmin(req, res)) return;
      const all: GameEvent[] = [];
      const evFile = (uid: string): string => resolve(EVENTS_DIR, sanitizeId(uid) + ".jsonl");
      for (const acc of accounts.values()) {
        try { for (const l of readFileSync(evFile(acc.userId), "utf8").split("\n")) { if (l) all.push(JSON.parse(l) as GameEvent); } } catch { /* 활동 없음 */ }
      }
      res.end(JSON.stringify({ scenes: sceneStats(all) }));
      return;
    }
    // ── 품질·헬스 가시성(②③) — fast율·에러율·레이턴시 p50/p95·평균 신뢰도(qualityMeter SSOT) ──
    if (req.url?.startsWith("/admin/quality")) {
      if (!requireAdmin(req, res)) return;
      const q = summarizeQuality(qualityMeter);
      // 헬스 — 에러율·p95 임계로 ok/warn/crit. crit이면 server 로그로 능동 통보(운영자 콘솔 모니터).
      const health = q.errorRate > 0.1 ? "crit" : (q.errorRate > 0.03 || q.p95 > 5000) ? "warn" : "ok";
      if (health === "crit") console.warn(`[health] ⚠ crit — 에러율 ${Math.round(q.errorRate * 100)}% · p95 ${q.p95}ms`);
      res.end(JSON.stringify({ ...q, sessions: sessions.size, uptimeSec: Math.round(process.uptime()), health }));
      return;
    }
    // ── 콘텐츠: 캐시 빌드 실행(멱등 재사용) — spike/cache-build를 잡으로 ──
    if (req.method === "POST" && req.url?.startsWith("/admin/cache-build")) {
      if (!requireAdmin(req, res)) return;
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
      if (!requireAdmin(req, res)) return;
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
      if (!requireAdmin(req, res)) return;
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
      if (!requireAdmin(req, res)) return;
      // 키 없어도 무료 Qwen(Ollama)으로 생성 — 503 차단 제거(Qwen 극한). 둘 다 없으면 gen_failed로 떨어짐.
      const raw0 = await readBody(req, res); if (raw0 === null) return; // 413 처리됨
      const body = parseBody<{ context: string; intent: string; strictness: Strictness; character?: string }>(raw0);
      if (!body?.context || !body.intent || !body.strictness) { res.statusCode = 400; res.end(JSON.stringify({ error: "bad_request", hint: "context·intent·strictness 필요" })); return; }
      costMeter = rollMonth(costMeter, monthKST());
      const bgScene = checkBudget(costMeter);
      if (!bgScene.withinCap) { res.statusCode = 429; res.end(JSON.stringify({ error: "budget_exceeded", estUsd: Math.round(bgScene.estUsd * 100) / 100, cap: bgScene.cap })); return; }
      try {
        const raw = await genScene(body.context, body.intent, body.strictness, body.character ?? "daiki", genPort);
        costMeter = recordCall(costMeter, "gen"); // 유료 opus 호출 1건 기록
        const llmGuard = validateGeneratedScene(raw, { expectedIntent: body.intent, strictness: body.strictness });
        // intent 골격 고정 — LLM이 흔들어도 입력값으로 강제 덮어씀(고정은 프롬프트가 아니라 코드가 보증)
        const scene: Partial<Scene> = { ...raw, intent: body.intent };
        const guard = validateGeneratedScene(scene, { expectedIntent: body.intent, strictness: body.strictness });
        const llmDrift = llmGuard.flags.some((f) => f.code === "intent_drift");
        res.end(JSON.stringify({ scene, guard, llmDrift, rawIntent: (raw.intent ?? "").trim() }));
      } catch (e) {
        console.error("[scene-gen]", String(e)); // 상세는 서버 로그에만(클라엔 일반화)
        res.statusCode = 502; res.end(JSON.stringify({ error: "gen_failed" }));
      }
      return;
    }
    // ── 에피소드 완주 결과 — readModel(6스탯·호감도·시험역량) 노출(③ Result 화면) ──
    if (req.url?.startsWith("/session/result")) {
      const sid = resolveUser(new URL(req.url, "http://x").searchParams.get("sid") ?? "");
      if (!accounts.has(sid)) { res.statusCode = 403; res.end(JSON.stringify({ error: "forbidden" })); return; } // 레드팀 IDOR: 미가입 sid 차단
      const sess = sessions.get(sid);
      if (!sess) { res.statusCode = 404; res.end(JSON.stringify({ error: "no_session" })); return; }
      res.end(JSON.stringify(buildReadModel(sess.events)));
      return;
    }
    if (req.url?.startsWith("/session/signals")) {
      const sid = resolveUser(new URL(req.url, "http://x").searchParams.get("sid") ?? "");
      if (!accounts.has(sid)) { res.statusCode = 403; res.end(JSON.stringify({ error: "forbidden" })); return; } // 레드팀 IDOR
      const ev = sessions.get(sid)?.events ?? [];
      res.end(JSON.stringify({ timeToFirstWin: timeToFirstWin(ev), dropPoint: dropPoint(ev), churnRisk: churnRisk(ev) }));
      return;
    }
    // ── 운영자: 초대 코드 생성 ──
    if (req.method === "POST" && req.url?.startsWith("/admin/invite")) {
      if (!requireAdmin(req, res)) return;
      const rawIv = await readBody(req, res); if (rawIv === null) return; // 413 처리됨
      const body = parseBody<{ note?: string }>(rawIv) ?? {};
      const code = genInviteCode();
      invites.set(code, issueInvite(code, Date.now(), body.note));
      saveState();
      res.end(JSON.stringify({ code }));
      return;
    }
    // ── 운영자: 발급 목록(콘솔 회원 카테고리) ──
    if (req.method === "GET" && req.url?.startsWith("/admin/invites")) {
      if (!requireAdmin(req, res)) return;
      res.end(JSON.stringify({ invites: [...invites.values()] }));
      return;
    }
    // ── 운영자: 가입 계정 목록(회원 관리) ──
    if (req.method === "GET" && req.url?.startsWith("/admin/accounts")) {
      if (!requireAdmin(req, res)) return;
      const list = [...accounts.values()].map((a) => ({ userId: a.userId, status: a.status, createdTs: a.createdTs }));
      res.end(JSON.stringify({ accounts: list, active: accounts.size, capacity: CAP }));
      return;
    }
    // ── 운영자: 계정 삭제(테스트 정리 + 잊혀질 권리 §9 — events purge·세션·코드 회수) ──
    if (req.method === "POST" && req.url?.startsWith("/admin/account/delete")) {
      if (!requireAdmin(req, res)) return;
      const rawDel = await readBody(req, res); if (rawDel === null) return; // 413 처리됨
      const body = parseBody<{ userId: string }>(rawDel);
      if (!body?.userId) { res.statusCode = 400; res.end(JSON.stringify({ error: "bad_request" })); return; }
      if (!accounts.has(body.userId)) { res.statusCode = 404; res.end(JSON.stringify({ error: "no_account" })); return; }
      for (const [code, inv] of invites) { if (inv.boundUserId === body.userId) invites.set(code, revokeInvite(inv)); }
      sessions.delete(body.userId);
      dailyStates.delete(body.userId); // 데일리 SRS·스트릭도 purge(§9 잊혀질 권리)
      freetalkStates.delete(body.userId); // 프리토크 세션도 purge(§9)
      for (const [t, u] of sessionTokens) if (u === body.userId) sessionTokens.delete(t); // 세션 토큰 purge(§9)
      dailyUsage.delete(body.userId);
      accounts.delete(body.userId);
      try { await makeEventStore({ firestoreApp, eventsDir: EVENTS_DIR, userId: body.userId }).purge?.(body.userId); } catch (e) { console.error("[purge]", String(e)); }
      saveState();
      res.end(JSON.stringify({ deleted: body.userId }));
      return;
    }
    // ── [C1] 사용자: 초대 코드 사용 → 가입. alpha의 *유일한* 가입 경로. ──
    //    (초대코드 없는 /auth/signup은 비공개 게이트를 우회하므로 제거했다.)
    if (req.method === "POST" && req.url?.startsWith("/auth/redeem")) {
      const rawRd = await readBody(req, res); if (rawRd === null) return; // 413 처리됨
      const body = parseBody<{ code: string; userId: string; consent: ConsentFlags }>(rawRd);
      if (!body?.code || !body.userId || !body.consent) { res.statusCode = 400; res.end(JSON.stringify({ error: "bad_request" })); return; }
      // 초대코드 brute-force 차단 — IP당 분당 실패 한도 초과면 429
      const ip = clientIp(req), now = Date.now();
      if (!authFailOk(ip, now)) { res.statusCode = 429; res.end(JSON.stringify({ error: "too_many_attempts" })); return; }
      const rd = redeemInvite(invites.get(body.code), body.userId, now);
      if (!rd.ok) { recordAuthFail(ip, now); res.statusCode = 403; res.end(JSON.stringify({ error: `invite_${rd.reason}` })); return; }
      // [C3] 아래는 await 없이 동기 실행 — 정원 검사·예약이 원자적(동시 요청 정원 초과 방지).
      //      여기에 await를 새로 끼우면 race가 생기니 주의.
      const existing = accounts.get(body.userId);
      if (existing) { invites.set(body.code, rd.invite); saveState(); res.end(JSON.stringify({ ...existing, token: issueToken(body.userId) })); return; }
      if (accounts.size >= CAP) { res.statusCode = 429; res.end(JSON.stringify({ status: "waitlisted" })); return; }
      const acc = signup(body.userId, body.consent, Date.now());
      accounts.set(body.userId, acc); // 자리 즉시 예약(size 증가)
      invites.set(body.code, rd.invite); // 코드 바인딩 확정
      saveState();
      res.end(JSON.stringify({ ...acc, token: issueToken(body.userId) }));
      return;
    }
    // ── 탈퇴(잊혀질 권리 — 계정·세션·이벤트 삭제 + 코드 폐기) ──
    if (req.method === "POST" && req.url?.startsWith("/account/withdraw")) {
      const sid = resolveUser(new URL(req.url, "http://x").searchParams.get("sid") ?? "");
      const acc = accounts.get(sid);
      if (!acc) { res.statusCode = 404; res.end(JSON.stringify({ error: "no_account" })); return; }
      const w = withdraw(acc);
      for (const [code, inv] of invites) {
        if (inv.boundUserId === sid) invites.set(code, revokeInvite(inv));
      }
      sessions.delete(sid);
      dailyStates.delete(sid); // 데일리 SRS·스트릭도 purge(§9 잊혀질 권리)
      freetalkStates.delete(sid); // 프리토크 세션도 purge(§9)
      for (const [t, u] of sessionTokens) if (u === sid) sessionTokens.delete(t); // 세션 토큰 purge(§9)
      dailyUsage.delete(sid);
      accounts.delete(sid);
      // 잊혀질 권리(§9) — 영속 events 파일도 삭제(미연결이면 noop, 연결 시 자동 적용)
      try { await makeEventStore({ firestoreApp, eventsDir: EVENTS_DIR, userId: sid }).purge?.(sid); } catch (e) { console.error("[purge] events:", String(e)); }
      saveState();
      res.end(JSON.stringify({ status: w.account.status, purged: w.purge }));
      return;
    }
    // ── 턴 루프 ──
    if (req.method === "POST" && req.url?.startsWith("/session/turn")) {
      const sid = resolveUser(new URL(req.url, "http://x").searchParams.get("sid") ?? "");
      // 본문 상한(5MB) 검사를 게이트보다 먼저 — 버퍼링 중 초과 시 413으로 끊어 DoS 방어
      const audio = await readBodyBuf(req, res); if (audio === null) return;
      // 계정·동의 게이트(§9): 가입 + 국외이전 동의 없으면 음성 사용 불가
      if (!canUseVoice(accounts.get(sid))) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: "consent_required", hint: "POST /auth/redeem" }));
        return;
      }
      // 분당 턴 상한(초당 연타 차단) — 일일 턴캡(canSpendTurn)과 별개의 burst 방어
      if (!turnRateOk(sid, Date.now())) { res.statusCode = 429; res.end(JSON.stringify({ error: "rate_limited" })); return; }
      let sess = sessions.get(sid);
      if (!sess) {
        const epId = new URL(req.url, "http://x").searchParams.get("ep") ?? DEFAULT_EP;
        sess = { state: initState(EPISODES.get(epId) ?? ep), usage: { turnsToday: 0, dayStamp: today() }, events: [], energy: { current: 20, max: 20 }, episodeId: epId, lastSeen: Date.now() };
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
      const ab = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
      // events 영속(⑥) — 인메모리(signals용) + 유저별 파일(재시작·readModel 누적) 병행
      const userStore = makeEventStore({ firestoreApp, eventsDir: EVENTS_DIR, userId: sid });
      const sessStore: EventStorePort = {
        async append(e) { sess!.events.push(e); await userStore.append(e); },
        async readModel() { return buildReadModel(sess!.events); },
      };
      // OPIc 적응형 난이도(④) — 최근 등급으로 strictness 동적 조정
      const recentGrades = sess.events.filter((e): e is Extract<GameEvent, { type: "turn_spoken" }> => e.type === "turn_spoken").map((e) => e.grade).slice(-5);
      const _t0 = Date.now();
      let { result, state, metrics } = await runTurn({ ...deps, store: sessStore, episode: EPISODES.get(sess.episodeId) ?? ep }, sess.state, ab, Date.now(), recentGrades);
      // advanceNpc 배치 — audio 없고 NPC 능동이면 user beat까지 모아 queue로(턴당 1+k → 1 요청, perf #2)
      const npcQueue: unknown[] = [];
      if (ab.byteLength === 0 && !result.awaitsUser && !result.done) {
        const enrichR = (r: TurnResult) => { const c = MANIFESTS.get(sess.episodeId)?.byNorm.get(normText(r.npcLine)); return c ? { ...r, furigana: c.furigana, words: c.words, audioUrl: c.audio.startsWith("/") ? c.audio : `/cache/${shortOf(sess.episodeId)}/${c.audio}` } : r; };
        npcQueue.push(enrichR(result));
        let guard = 0;
        while (!result.awaitsUser && !result.done && ++guard < 12) {
          ({ result, state, metrics } = await runTurn({ ...deps, store: sessStore, episode: EPISODES.get(sess.episodeId) ?? ep }, state, ab, Date.now(), recentGrades));
          if (!result.awaitsUser && !result.done) npcQueue.push(enrichR(result));
        }
      }
      const turnMs = Date.now() - _t0;
      if (result.grade !== "-" || metrics?.error) {
        // 품질 SSOT 기록 + 단계별 로그(stt/judge 분리 — 어디서 느린지 보임)
        qualityMeter = recordQuality(qualityMeter, { ms: turnMs, fast: result.reason === "fast_exact_match", error: metrics?.error ?? false, confidence: metrics?.confidence ?? 0 });
        if (metrics?.error) errorMeter = recordError(errorMeter, { kind: "stt_fail", message: "STT 전사 실패(자막 폴백 동작)", where: "session", ts: Date.now() }); // 자동 관측(복구 아님)
        console.log(`[turn] ${turnMs}ms (stt ${metrics?.sttMs ?? 0} + judge ${metrics?.judgeMs ?? 0}) ${result.reason === "fast_exact_match" ? "⚡fast" : "🤖llm"} grade=${result.grade}`);
      }
      sess.state = state;
      sess.lastSeen = Date.now(); // 활동 갱신(TTL sweep 기준)
      if (result.awaitsUser && result.grade !== "-") {
        sess.usage = recordTurn(sess.usage, today());
        sess.energy = spend(sess.energy); // 실발화 1회 에너지 소비(⑤)
        costMeter = rollMonth(costMeter, monthKST());
        costMeter = recordCall(recordCall(costMeter, "stt"), "judge"); // 유료 STT 1 + judge(로컬 0원) 카운트
      }
      const norm = (s: string): string => s.replace(/！/g, "!").replace(/？/g, "?").trim();
      const manifest = MANIFESTS.get(sess.episodeId);
      const cl = manifest?.byNorm.get(norm(result.npcLine)); // O(1) — 로드 시 구축한 byNorm 인덱스
      const enriched = cl ? { ...result, furigana: cl.furigana, words: cl.words, audioUrl: cl.audio.startsWith("/") ? cl.audio : `/cache/${shortOf(sess.episodeId)}/${cl.audio}` } : result;
      const sessEp2 = EPISODES.get(sess.episodeId) ?? ep;
      const sceneNo = sessEp2.scenes.findIndex((s) => s.id === state.currentSceneId) + 1;
      res.end(JSON.stringify({ ...enriched, queue: npcQueue, progress: { scene: sceneNo || 1, total: sessEp2.scenes.length }, timing: { ms: turnMs, fast: result.reason === "fast_exact_match" } }));
      return;
    }
    // 클라 에러 자동 수집(public·best-effort) — rate limit으로 폭주 방어. 복구 아님, 기록만.
    if (req.method === "POST" && req.url === "/client-error") {
      const nowMin = Math.floor(Date.now() / 60000);
      if (nowMin !== errMinute) { errMinute = nowMin; errMinuteCount = 0; }
      const rawCe = await readBody(req, res); if (rawCe === null) return; // 413 처리됨
      if (errMinuteCount < 300) { // 분당 300 상한(폭주 방어)
        errMinuteCount++;
        try { const b = JSON.parse(rawCe) as { kind?: string; message?: string; where?: string }; errorMeter = recordError(errorMeter, { kind: b.kind ?? "client", message: b.message ?? "", where: b.where ?? "web", ts: Date.now() }); } catch { /* 잘못된 리포트 무시 */ }
      }
      res.statusCode = 204; res.end(); return; // best-effort(항상 성공 응답 — 앱 안 멈춤)
    }
    // 에러 추적(운영자) — 종류별 빈도·최근·점검 가이드(복구 명령 아님, 운영자가 조치)
    if (req.method === "GET" && req.url?.startsWith("/admin/errors")) {
      if (!requireAdmin(req, res)) return;
      res.end(JSON.stringify(summarizeErrors(errorMeter)));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (e) {
    // 전역 에러 자동 관측(복구 아님 — 기록만, 운영자 추적). 상세는 서버 로그·errorMeter에만, 클라엔 일반화.
    errorMeter = recordError(errorMeter, { kind: "server", message: String(e), where: req.url ?? "?", ts: Date.now() });
    console.error("[server]", req.url ?? "?", String(e));
    if (!res.writableEnded) { res.statusCode = 500; res.end(JSON.stringify({ error: "internal" })); }
  }
});

const PORT = Number(process.env.PORT ?? 8787);
// 직접 실행(tsx src/server.ts)일 때만 listen + warmup. 테스트가 import할 땐 포트 점유·외부 호출 없음.
// (vitest는 argv[1]이 vitest 바이너리라 이 블록을 건너뜀 → server 핸들러만 가져다 port 0으로 테스트)
const RUN_DIRECTLY = process.argv[1] === fileURLToPath(import.meta.url);
if (RUN_DIRECTLY) {
  server.listen(PORT, () => {
    console.log(`VoiceQuest API :${PORT} (stage=${STAGE})`);
    // ollama cold start 방지(실측 2983→1708ms) — 시작 시 judge LLM 1회 예열, 첫 유저 턴이 warm
    deps.llm.judge({ transcript: "予熱", sttConfidence: 1, scene: { id: "_warmup", intent: "", requiredSlots: [], allowedExpressions: [] }, modifier: {}, strictness: "normal", affinity: 0 }).then(() => console.log("[warmup] judge LLM 예열 완료")).catch(() => {});
  });
}
