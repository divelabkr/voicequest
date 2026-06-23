import { describe, it, expect } from "vitest";
import { compareVersion, needsUpdate } from "../src/version";

describe("version — 앱 버전 게이트(kill switch·강제 업데이트)", () => {
  it("semver 비교", () => {
    expect(compareVersion("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersion("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersion("2.0.0", "2.0.0")).toBe(0);
    expect(compareVersion("1.0", "1.0.0")).toBe(0); // 짧은 형식 관대
  });

  it("needsUpdate — 명시적 구버전만 차단", () => {
    expect(needsUpdate("1.0.0", "1.2.0")).toBe(true); // 구버전 → 게이트
    expect(needsUpdate("1.2.0", "1.2.0")).toBe(false); // 동일 → 통과
    expect(needsUpdate("1.3.0", "1.2.0")).toBe(false); // 최신 → 통과
  });

  it("버전 미전송은 통과(헤더 누락 오차단 방지)", () => {
    expect(needsUpdate(undefined, "1.2.0")).toBe(false);
    expect(needsUpdate("", "1.2.0")).toBe(false);
  });
});
