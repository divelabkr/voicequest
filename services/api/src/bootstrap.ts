// 실어댑터 조립 — .env에서 키 읽어 SttPort/LlmPort/TtsPort/store 구성 → TurnDeps.
// 공급자는 어댑터 뒤(규칙7). 키는 여기서만 .env에서 읽어 주입(어댑터는 env를 모름).
import { readFileSync } from "node:fs";
import { buildReadModel } from "@voicequest/engine";
import type { Episode, TtsPort, EventStorePort, GameEvent } from "@voicequest/engine";
import { DeepgramStt } from "@voicequest/stt-deepgram";
import { QwenLlm } from "@voicequest/llm-qwen";
import { ClaudeLlm } from "@voicequest/llm-claude-haiku";
import { initFirestore, type FirestoreApp } from "@voicequest/store-firestore";
import { CachedLlm, FallbackLlm } from "./llm-decorators";
import type { TurnDeps } from "./session";

/** .env 파서(인라인 주석·따옴표·CR 정리). */
export function loadEnv(path: string | URL): Record<string, string> {
  const env: Record<string, string> = {};
  // .env 파일(로컬 개발). 클라우드(Render/Cloud Run)엔 파일 없음 → catch 후 process.env로 폴백.
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m || !m[1]) continue;
      const v = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\r$/, "");
      if (v) env[m[1]] = v;
    }
  } catch { /* .env 없음(클라우드 배포) — process.env만 사용 */ }
  // 클라우드 주입 env 지원(Render/Cloud Run) — .env에 없는 키는 process.env에서 채움(.env 우선).
  for (const k of ["DEEPGRAM_KEY", "DEEPGRAM_HOST", "ANTHROPIC_KEY", "ANTHROPIC_API_KEY", "ADMIN_TOKEN", "MIN_APP_VERSION", "FIREBASE_SERVICE_ACCOUNT", "CORS_ORIGINS", "OLLAMA_URL", "OLLAMA_MODEL"]) {
    const pv = process.env[k];
    if (!env[k] && pv) env[k] = pv;
  }
  return env;
}

export interface BootResult {
  deps: TurnDeps;
  events: GameEvent[];
  /** Firestore App(서비스 계정 키 있으면) — server가 유저별 store에 주입. 없으면 null→파일 폴백. */
  firestoreApp: FirestoreApp | null;
}

/** .env 키로 실어댑터 조립. judge는 무료 로컬 Qwen, TTS는 자막모드(음성 캐시는 M3). */
export function bootstrap(episode: Episode, envPath: string | URL): BootResult {
  const env = loadEnv(envPath);
  if (!env.DEEPGRAM_KEY) throw new Error("DEEPGRAM_KEY 없음 — .env 확인");
  const stt = new DeepgramStt({ apiKey: env.DEEPGRAM_KEY, host: env.DEEPGRAM_HOST });
  // 데코레이터 체인 — judge 캐시(반복 발화 0초·0원) + 품질 폴백(Haiku 키 있으면 저신뢰 재판정).
  // judge()·session·turn은 그대로. 캐시·폴백·품질이 LlmPort 뒤로 숨음(흩어짐 방지·규칙7).
  const anthropicKey = env.ANTHROPIC_KEY ?? env.ANTHROPIC_API_KEY ?? "";
  // judge: 로컬 Qwen(ollama·무료) 우선 → 실패 시 Haiku 폴백. 클라우드엔 ollama 없으니 키 있으면 Haiku로 동작.
  const qwen = new QwenLlm({ baseURL: env.OLLAMA_URL ?? "http://localhost:11434/v1", model: env.OLLAMA_MODEL ?? "qwen3-coder:30b", apiKey: "ollama" });
  const llm = new CachedLlm(anthropicKey ? new FallbackLlm(qwen, new ClaudeLlm("claude-haiku-4-5", anthropicKey)) : qwen);
  const tts: TtsPort = { async synth() { return "cache://npc(자막모드)"; } };
  const events: GameEvent[] = [];
  const store: EventStorePort = {
    async append(e) { events.push(e); },
    async readModel() { return buildReadModel(events); },
  };
  // Firestore 3단 폴백 — 서비스 계정 키(FIREBASE_SERVICE_ACCOUNT: JSON 또는 경로) 있으면 연결, 없으면 파일.
  const firestoreApp = env.FIREBASE_SERVICE_ACCOUNT ? initFirestore(env.FIREBASE_SERVICE_ACCOUNT) : null;
  console.log(firestoreApp ? "[bootstrap] Firestore 영속 연결됨(voicequest-dev)" : "[bootstrap] 파일 영속(data/events) — Firestore 키 없음");
  return { deps: { stt, llm, tts, store, episode }, events, firestoreApp };
}
