import { describe, it, expect } from "vitest";
import { buildManifest, assetHash, EPISODE_BYTE_BUDGET } from "./cache";
import type { CacheEntry } from "./cache";

const entry = (key: string, hash: string, bytes: number): CacheEntry => ({
  key,
  hash,
  url: "mock://" + key,
  bytes,
  format: "avif",
  kind: "image",
});

describe("cache 매니페스트(§11)", () => {
  it("동일 hash 자산은 dedup(1벌만 + 총량도 1회)", () => {
    const m = buildManifest("ep", [
      entry("a", "H1", 100),
      entry("b", "H1", 100),
      entry("c", "H2", 50),
    ]);
    expect(m.entries).toHaveLength(2);
    expect(m.totalBytes).toBe(150); // H1은 한 번만 계산
  });

  it("예산 초과면 withinBudget=false", () => {
    const m = buildManifest("ep", [entry("big", "H1", EPISODE_BYTE_BUDGET + 1)]);
    expect(m.withinBudget).toBe(false);
  });

  it("예산 내면 withinBudget=true", () => {
    expect(buildManifest("ep", [entry("a", "H1", 1000)]).withinBudget).toBe(true);
  });

  it("assetHash는 결정적이고 구별된다", () => {
    expect(assetHash("같은입력")).toBe(assetHash("같은입력"));
    expect(assetHash("x")).not.toBe(assetHash("y"));
  });
});
