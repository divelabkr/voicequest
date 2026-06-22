// 파일럿 출시 게이트 — SSOT(Single Source of Truth).
// alpha→pilot 전환 기준을 여기 하나로 통일한다. 흩어졌던 출처(access STAGE_LIMITS,
// 메모리 "또하고싶다≥4", 진척 점수, ops 카테고리, admin)는 모두 이 정의를 참조해야 한다.
//
// 두 종류:
//  · tech   = 코드로 자동 검증 가능(① readiness) — gate-check가 실제 산출물로 평가.
//  · market = 운영/사람 입력 필요(② 시장·인프라) — 알파 측정값을 운영자가 입력.
export type GateKind = "tech" | "market";

export interface GateCriterion {
  id: string;
  label: string;
  kind: GateKind;
  required: boolean;
  note?: string;
}

export const PILOT_GATE: readonly GateCriterion[] = [
  // ── ① 기술 readiness (gate-check가 자동 검증) ──
  { id: "engine_tests", label: "엔진 테스트 통과", kind: "tech", required: true },
  { id: "voice_cache", label: "NPC 음성 캐시 생성됨", kind: "tech", required: true, note: "content_cache" },
  { id: "persistence", label: "영속성(Firestore) 연결", kind: "tech", required: true, note: "store-firestore" },
  { id: "e2e_pipe", label: "STT→judge→TTS 파이프 검증", kind: "tech", required: true },
  // ── ② 시장·인프라 게이트 (운영자 입력) ──
  { id: "want_replay", label: "또 하고 싶다 ≥ 4 / 5", kind: "market", required: true },
  { id: "voice_comfort", label: "음성 입력 거부감 낮음", kind: "market", required: true },
  { id: "d1_retention", label: "D1 리텐션 ≥ 40%", kind: "market", required: true },
  { id: "alpha_filled", label: "알파 25명 충원·완주", kind: "market", required: true },
];

export interface GateInput {
  tech: Record<string, boolean>; // 자동 검증 결과
  market: Record<string, boolean>; // 운영 입력
}

export interface GateReport {
  ready: boolean;
  passed: GateCriterion[];
  blocked: GateCriterion[]; // required인데 미충족
  techScore: number; // 0~1
  marketScore: number; // 0~1
}

/** 게이트 평가 — 단일 판정 함수. 모든 화면/문서가 이 결과를 진실로 삼는다. */
export function evaluateGate(input: GateInput): GateReport {
  const status = (c: GateCriterion): boolean =>
    (c.kind === "tech" ? input.tech[c.id] : input.market[c.id]) ?? false;
  const passed = PILOT_GATE.filter(status);
  const blocked = PILOT_GATE.filter((c) => c.required && !status(c));
  const frac = (arr: GateCriterion[]): number =>
    arr.length === 0 ? 1 : arr.filter(status).length / arr.length;
  return {
    ready: blocked.length === 0,
    passed: [...passed],
    blocked: [...blocked],
    techScore: frac(PILOT_GATE.filter((c) => c.kind === "tech")),
    marketScore: frac(PILOT_GATE.filter((c) => c.kind === "market")),
  };
}
