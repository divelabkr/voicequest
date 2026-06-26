// 백엔드 클라이언트 — POST /session/turn. 화면은 dumb, 로직은 서버(CLAUDE.md §7).
import { Platform } from "react-native";
export interface TurnResult {
  npcLine: string;
  audioUrl: string;
  grade: string;
  affinity: number;
  nextSceneId: string;
  done: boolean;
  awaitsUser: boolean;
  furigana?: string; // 후리가나(kuroshiro okurigana)
  words?: { w: string; gloss: string }[]; // 단어뜻(kuromoji+사전)
  queue?: TurnResult[]; // 배치 — server가 user beat까지 모은 NPC 대사 일괄(perf #2)
}

// 웹=호스트 localhost. 네이티브(에뮬·실기기)=localhost + `adb reverse tcp:8787 tcp:8787`로 PC 서버 연결.
// 배포 시 EXPO_PUBLIC_API_BASE로 실제 호스트 주입(reverse는 USB/adb 개발 환경 전용).
export const API_BASE = Platform.OS === "web" ? "http://localhost:8787" : (process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8787");

export const APP_VERSION = "0.0.1"; // 앱 버전 게이트 — server minAppVersion 미만이면 차단(kill switch)
function cmpVer(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const x = pa[i] ?? 0; const y = pb[i] ?? 0; if (x !== y) return x < y ? -1 : 1; }
  return 0;
}
/** 시작 버전 체크 — 구버전이면 minVersion(게이트), 최신이면 null. 네트워크 실패는 통과(오프라인 오차단 방지). */
export async function checkVersion(): Promise<string | null> {
  try {
    const j = (await (await fetch(`${API_BASE}/health`)).json()) as { minAppVersion?: string };
    if (j.minAppVersion && cmpVer(APP_VERSION, j.minAppVersion) < 0) return j.minAppVersion;
  } catch { /* 통과 */ }
  return null;
}

/** 에러 자동 관측 — server로 리포트(best-effort, 앱 안 멈춤). 복구 아님, 추적·가이드용. */
export function reportError(kind: string, message: string, where = "mobile"): void {
  try {
    void fetch(`${API_BASE}/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message: String(message).slice(0, 240), where }),
    }).catch(() => {});
  } catch { /* best-effort — 리포트 실패해도 앱은 정상 */ }
}

// fetch 래퍼 — 네트워크 실패를 자동 캡처(/client-error 자기 제외 → 무한루프 방어). 복구 아님, 기록만.
const _origFetch: typeof fetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const p = _origFetch(input, init);
  const url = String(typeof input === "string" ? input : ((input as Request).url ?? input));
  if (!url.includes("/client-error")) p.catch((err: unknown) => reportError("client_fetch", `${String(err)} ${url}`, "mobile"));
  return p;
}) as typeof fetch;

/** audio=null이면 빈 오디오(NPC 능동 beat 진행용). 있으면 녹음 Blob을 STT로 보냄(플랫폼 무관). */
export async function postTurn(sid: string, audio: Blob | null): Promise<TurnResult> {
  const body: BodyInit = audio ?? new Uint8Array(0);
  const r = await fetch(`${API_BASE}/session/turn?sid=${encodeURIComponent(sid)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });
  if (!r.ok) throw new Error(`turn_http_${r.status}`);
  return (await r.json()) as TurnResult;
}

export interface ConsentFlags {
  overseasTransfer: boolean;
  dataProcessing: boolean;
}

/** 초대코드 사용 — 운영자 발급 코드 + 동의 → 가입(active). 알파 비공개 게이트. */
export async function redeem(
  code: string,
  userId: string,
  consent: ConsentFlags,
): Promise<{ status: string; error?: string; token?: string }> {
  const r = await fetch(`${API_BASE}/auth/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, userId, consent }),
  });
  return (await r.json()) as { status: string; error?: string; token?: string };
}

/** 가입 — 동의 + 인원 게이트. status: "active" | "pending_consent" | "waitlisted" */
export async function signup(userId: string, consent: ConsentFlags): Promise<{ status: string }> {
  const r = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, consent }),
  });
  return (await r.json()) as { status: string };
}

/** 탈퇴 — 잊혀질 권리(계정·세션·이벤트 삭제). */
export async function withdraw(userId: string): Promise<{ status: string; purged: string[] }> {
  const r = await fetch(`${API_BASE}/account/withdraw?sid=${encodeURIComponent(userId)}`, { method: "POST" });
  return (await r.json()) as { status: string; purged: string[] };
}
