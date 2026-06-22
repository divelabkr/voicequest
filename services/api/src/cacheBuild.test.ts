import { describe, it, expect } from "vitest";
import { buildEpisodeCache } from "./cacheBuild";
import { parseEpisode } from "@voicequest/engine";
import type { ImagePort, MusicPort } from "@voicequest/engine";

const ep = parseEpisode({
  id: "ep_t",
  title: "테스트 식당",
  character: "daiki",
  scenes: [{ id: "s1", intent: "i", requiredSlots: [], allowedExpressions: ["x"] }],
  endings: [{ id: "o", minAffinity: 0, title: "o" }],
});

const image: ImagePort = {
  async gen() {
    return { url: "mock://img", bytes: 200 * 1024, format: "avif", synthId: true };
  },
};
const music: MusicPort = {
  async gen() {
    return { url: "mock://bgm", bytes: 480 * 1024, format: "opus", synthId: true };
  },
};

describe("buildEpisodeCache(빌드타임 캐시)", () => {
  it("배경·캐릭터·BGM 생성 + 매니페스트(예산 내)", async () => {
    const m = await buildEpisodeCache({ image, music }, ep);
    expect(m.episodeId).toBe("ep_t");
    expect(m.entries.length).toBe(3);
    expect(m.entries.some((e) => e.kind === "music")).toBe(true);
    expect(m.entries.some((e) => e.kind === "image")).toBe(true);
    expect(m.withinBudget).toBe(true);
  });

  it("SynthID 없으면 거부(§9 AI 생성물 표시)", async () => {
    const noSynth: ImagePort = {
      async gen() {
        return { url: "x", bytes: 1, format: "png", synthId: false };
      },
    };
    await expect(buildEpisodeCache({ image: noSynth, music }, ep)).rejects.toThrow(/synthid/);
  });
});
