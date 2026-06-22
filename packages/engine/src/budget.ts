// 비용 거버넌스(CLAUDE.md §9·§11) — AI/API 사용량·월 예산 cap·알림. 순수함수.
// 알파: 인메모리 미터를 server가 들고, 호출마다 recordCall, 월 예산 초과 시 차단.
// 정밀 과금이 아니라 "폭주 차단"이 목적 — 단가는 보수적 추정, 착수 시점 재검증 필수(§).

export type CostKind = "stt" | "judge" | "gen" | "tts";

/** 호출당 추정 비용(USD). judge=로컬 Qwen=0, tts=빌드타임 캐시. 착수 시 재검증. */
export const UNIT_COST: Record<CostKind, number> = {
  stt: 0.001, // Deepgram 짧은 발화 1회 추정
  judge: 0, // 로컬 Qwen — 런타임 무료
  gen: 0.005, // Anthropic opus 씬 생성 1회 추정(작은 프롬프트)
  tts: 0.0003, // 캐시 빌드 1줄(빌드타임, 런타임은 0회)
};

export interface CostMeter {
  /** 집계 월 "YYYY-MM"(KST) — 다른 달이면 리셋 */
  month: string;
  calls: Record<CostKind, number>;
  estUsd: number;
}

export interface BudgetConfig {
  monthlyUsdCap: number;
  /** 알림 임계 비율(오름차순) — 도달 시 alertLevel 상승 */
  alertRatios: number[];
}

/** 알파 기본 예산 — $20/월, 50·80·100%에서 알림. 운영자 화면에서 조정 가능하게 둠. */
export const DEFAULT_BUDGET: BudgetConfig = { monthlyUsdCap: 20, alertRatios: [0.5, 0.8, 1.0] };

export function emptyMeter(month: string): CostMeter {
  return { month, calls: { stt: 0, judge: 0, gen: 0, tts: 0 }, estUsd: 0 };
}

/** 월 경계 — 미터의 달이 인자와 다르면 새 달로 리셋(월 카운터). */
export function rollMonth(meter: CostMeter, month: string): CostMeter {
  return meter.month === month ? meter : emptyMeter(month);
}

/** 호출 1건(또는 units건) 기록 → 카운트·추정비용 누적. 불변. */
export function recordCall(meter: CostMeter, kind: CostKind, units = 1): CostMeter {
  return {
    ...meter,
    calls: { ...meter.calls, [kind]: meter.calls[kind] + units },
    estUsd: meter.estUsd + UNIT_COST[kind] * units,
  };
}

export interface BudgetStatus {
  estUsd: number;
  cap: number;
  ratio: number;
  /** 예산 내(< cap)면 true → 호출 허용 */
  withinCap: boolean;
  /** 0=정상, 1=50%, 2=80%, 3=초과. 운영자 알림 색상/배지에 사용 */
  alertLevel: number;
}

/** 현 사용량 대비 예산 상태 — withinCap=false면 server가 신규 유료호출 차단. */
export function checkBudget(meter: CostMeter, cfg: BudgetConfig = DEFAULT_BUDGET): BudgetStatus {
  const ratio = cfg.monthlyUsdCap > 0 ? meter.estUsd / cfg.monthlyUsdCap : 0;
  let alertLevel = 0;
  for (let i = 0; i < cfg.alertRatios.length; i++) {
    if (ratio >= (cfg.alertRatios[i] ?? Infinity)) alertLevel = i + 1;
  }
  return { estUsd: meter.estUsd, cap: cfg.monthlyUsdCap, ratio, withinCap: ratio < 1, alertLevel };
}
