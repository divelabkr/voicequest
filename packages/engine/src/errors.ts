// 에러 관측 SSOT — 자동 캡처된 에러를 종류별로 누적·추적·가이드(관측 전용, 복구 권한 없음).
// 클라·server가 record, admin이 summarize로 추적. qualityMeter와 같은 순수 패턴.
// 원칙: 이 모듈은 데이터만 — 재시작·롤백·복구 액션을 절대 하지 않는다(운영자가 판단).
const WINDOW = 200; // 최근 N개 보관(메모리 상한)

export interface ErrorSample {
  kind: string; // 분류 키(client_fetch·client_js·stt_fail·judge_fail·tts_fail·server)
  message: string; // sanitize된 메시지(토큰·이메일·코드 마스킹)
  where: string; // 발생 위치(web·admin·server·session)
  ts: number;
}

export interface ErrorMeter {
  samples: ErrorSample[]; // 최근 WINDOW
  byKind: Record<string, number>; // 종류별 누적 카운트
  total: number;
}

export function emptyErrors(): ErrorMeter {
  return { samples: [], byKind: {}, total: 0 };
}

/** 에러 메시지 안전화 — 토큰·이메일·초대코드·홈경로 마스킹(관측은 하되 민감정보 노출 X). */
export function sanitizeError(msg: string): string {
  return String(msg)
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, "<email>")
    .replace(/\b(token|key|secret|password|authorization)["':=\s]+\S+/gi, "$1=<redacted>")
    .replace(/VQ-[A-Z0-9-]+/g, "<code>")
    .replace(/\/Users\/[^/\s]+/g, "/Users/<user>")
    .slice(0, 240);
}

/** 에러 1건 기록 — sanitize 후 누적. 순수(상태 변경 없음, 새 메터 반환). */
export function recordError(m: ErrorMeter, s: { kind: string; message: string; where: string; ts: number }): ErrorMeter {
  const sample: ErrorSample = { kind: s.kind.slice(0, 40), message: sanitizeError(s.message), where: s.where.slice(0, 40), ts: s.ts };
  return {
    samples: [...m.samples, sample].slice(-WINDOW),
    byKind: { ...m.byKind, [sample.kind]: (m.byKind[sample.kind] ?? 0) + 1 },
    total: m.total + 1,
  };
}

/** 에러 종류 → 운영자 가이드. 복구 명령이 아니라 점검 방향(자동 조치 금지, 운영자가 실행). */
const GUIDE: Record<string, string> = {
  client_fetch: "클라이언트가 API 연결 실패 — server 가동·네트워크·CORS·포트(reverse) 점검",
  client_js: "클라이언트 JS 예외 — 해당 화면 콘솔·최근 배포 확인",
  stt_fail: "STT 전사 실패 — Deepgram 키·쿼터·네트워크 점검(자막 폴백은 정상 동작)",
  judge_fail: "판정 LLM 실패 — ollama 가동·모델 로드 점검(fast-path는 영향 없음)",
  tts_fail: "TTS 합성 실패 — 자막 폴백 동작 확인, Gemini 쿼터 점검",
  server: "server 내부 예외 — 서버 로그 확인",
};
export function errorGuide(kind: string): string {
  return GUIDE[kind] ?? "미분류 에러 — 메시지·위치로 원인 추적";
}

export interface ErrorSummary {
  total: number;
  byKind: Array<{ kind: string; count: number; guide: string }>; // 빈도순 + 점검 가이드
  recent: ErrorSample[]; // 최근순
}

export function summarizeErrors(m: ErrorMeter, recentN = 12): ErrorSummary {
  return {
    total: m.total,
    byKind: Object.entries(m.byKind).sort((a, b) => b[1] - a[1]).map(([kind, count]) => ({ kind, count, guide: errorGuide(kind) })),
    recent: m.samples.slice(-recentN).reverse(),
  };
}
