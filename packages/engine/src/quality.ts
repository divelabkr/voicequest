// 품질 메트릭 SSOT — 턴 샘플을 누적해 fast율·에러율·레이턴시 분포·평균 신뢰도로 요약(순수).
// costMeter(비용)와 같은 패턴: 한 곳에 응집, server가 상태 보유·턴마다 record(흩어짐 방지).
const WINDOW = 500; // 최근 N턴 레이턴시 분포용(메모리 상한)

export interface QualitySample {
  ms: number; // 턴 전체 레이턴시
  fast: boolean; // judge fast-path 여부
  error: boolean; // STT/judge 실패
  confidence: number; // STT 신뢰도(0~1)
}

export interface QualityMeter {
  samples: QualitySample[]; // 최근 WINDOW(분포용)
  total: number; // 누적 턴
  errors: number;
  fast: number;
}

export function emptyQuality(): QualityMeter {
  return { samples: [], total: 0, errors: 0, fast: 0 };
}

/** 턴 1개 기록 — 누적 카운트 + 분포용 ring buffer(WINDOW 상한). */
export function recordQuality(m: QualityMeter, s: QualitySample): QualityMeter {
  return {
    samples: [...m.samples, s].slice(-WINDOW),
    total: m.total + 1,
    errors: m.errors + (s.error ? 1 : 0),
    fast: m.fast + (s.fast ? 1 : 0),
  };
}

export interface QualitySummary {
  turns: number;
  fastRate: number; // 정답 즉답 비율(높을수록 실시간)
  errorRate: number; // STT/judge 실패율(낮을수록 건강)
  p50: number; // 레이턴시 중앙값(ms)
  p95: number; // 꼬리 레이턴시(체감 최악)
  avgConfidence: number; // 평균 STT 신뢰도
}

/** 누적 메터 → 운영 지표. 레이턴시 분포는 에러 제외(성공 턴만). */
export function summarizeQuality(m: QualityMeter): QualitySummary {
  const lat = m.samples.filter((s) => !s.error).map((s) => s.ms).sort((a, b) => a - b);
  const pct = (p: number): number => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] ?? 0 : 0);
  const conf = m.samples.filter((s) => s.confidence > 0);
  return {
    turns: m.total,
    fastRate: m.total ? m.fast / m.total : 0,
    errorRate: m.total ? m.errors / m.total : 0,
    p50: pct(0.5),
    p95: pct(0.95),
    avgConfidence: conf.length ? conf.reduce((a, s) => a + s.confidence, 0) / conf.length : 0,
  };
}
