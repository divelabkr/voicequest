// 실어댑터 조립 — .env에서 키 읽어 SttPort/LlmPort/TtsPort/store 구성 → TurnDeps.
// 공급자는 어댑터 뒤(규칙7). 키는 여기서만 .env에서 읽어 주입(어댑터는 env를 모름).
import { readFileSync } from "node:fs";
import { buildReadModel } from "@voicequest/engine";
import type { Episode, TtsPort, EventStorePort, GameEvent } from "@voicequest/engine";
import { DeepgramStt } from "@voicequest/stt-deepgram";
import { QwenLlm } from "@voicequest/llm-qwen";
import { initFirestore, type FirestoreApp } from "@voicequest/store-firestore";
import type { TurnDeps } from "./session";

/** .env 파서(인라인 주석·따옴표·CR 정리). */
export function loadEnv(path: string | URL): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || !m[1]) continue;
    const v = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\r$/, "");
    if (v) env[m[1]] = v;
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
  const stt = new DeepgramStt({ apiKey: env.DEEPGRAM_KEY });
  const llm = new QwenLlm({ baseURL: "http://localhost:11434/v1", model: "qwen3-coder:30b", apiKey: "ollama" });
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
