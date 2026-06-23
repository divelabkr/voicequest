import { describe, it, expect } from "vitest";
import { emptyQuality, recordQuality, summarizeQuality } from "../src/quality";

describe("quality — 품질 메트릭 SSOT", () => {
  it("fast율·에러율 집계", () => {
    let m = emptyQuality();
    m = recordQuality(m, { ms: 1000, fast: true, error: false, confidence: 0.9 });
    m = recordQuality(m, { ms: 2700, fast: false, error: false, confidence: 0.8 });
    m = recordQuality(m, { ms: 0, fast: false, error: true, confidence: 0 });
    const s = summarizeQuality(m);
    expect(s.turns).toBe(3);
    expect(s.fastRate).toBeCloseTo(1 / 3);
    expect(s.errorRate).toBeCloseTo(1 / 3);
  });

  it("레이턴시 p50/p95(에러 턴 제외)", () => {
    let m = emptyQuality();
    for (const ms of [100, 200, 300, 400, 1000]) m = recordQuality(m, { ms, fast: true, error: false, confidence: 0.9 });
    const s = summarizeQuality(m);
    expect(s.p50).toBe(300);
    expect(s.p95).toBe(1000);
  });

  it("평균 신뢰도 — 신뢰도 0(에러) 제외", () => {
    let m = emptyQuality();
    m = recordQuality(m, { ms: 100, fast: true, error: false, confidence: 0.8 });
    m = recordQuality(m, { ms: 100, fast: true, error: false, confidence: 1.0 });
    m = recordQuality(m, { ms: 0, fast: false, error: true, confidence: 0 });
    expect(summarizeQuality(m).avgConfidence).toBeCloseTo(0.9);
  });

  it("빈 메터는 0(나눗셈 방어)", () => {
    const s = summarizeQuality(emptyQuality());
    expect(s.turns).toBe(0);
    expect(s.fastRate).toBe(0);
    expect(s.p95).toBe(0);
  });
});
