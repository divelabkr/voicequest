import { describe, it, expect } from "vitest";
import { isExpired, expiredKeys, REVIEW_RECORDING_TTL_DAYS, VOICE_RAW_TTL_DAYS } from "../src/retention";

const DAY = 86_400_000;

describe("retention — 보존정책(③)", () => {
  it("음성 원본 TTL=0(즉시 폐기), 복습녹음 TTL=30", () => {
    expect(VOICE_RAW_TTL_DAYS).toBe(0);
    expect(REVIEW_RECORDING_TTL_DAYS).toBe(30);
  });

  it("30일 지나면 만료, 29일은 보존", () => {
    const now = 100 * DAY;
    expect(isExpired(now - 31 * DAY, now)).toBe(true);
    expect(isExpired(now - 29 * DAY, now)).toBe(false);
  });

  it("음성 원본(TTL 0)은 같은 순간에도 만료 처리", () => {
    const now = 5 * DAY;
    expect(isExpired(now, now, VOICE_RAW_TTL_DAYS)).toBe(true);
  });

  it("expiredKeys가 만료분만 반환", () => {
    const now = 100 * DAY;
    const ks = expiredKeys([
      { key: "a", recordedAtMs: now - 40 * DAY },
      { key: "b", recordedAtMs: now - 10 * DAY },
    ], now);
    expect(ks).toEqual(["a"]);
  });
});
