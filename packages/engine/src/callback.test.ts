import { describe, it, expect } from "vitest";
import { pickCallback, fillSlots } from "./callback";
import type { GameEvent } from "./types";

describe("callback (맞춤감 — 기억하는 NPC, 비용 0)", () => {
  it("첫방문 / 잘했음 / 재방문 콜백 선택", () => {
    expect(pickCallback([])).toBe("first_time");
    const wellCleared: GameEvent[] = [
      { type: "turn_spoken", sceneId: "s", transcript: "", grade: "S", weakness: [], ts: 0 },
      { type: "episode_clear", episodeId: "e", stars: 3, ending: "x", affinity: 5, ts: 1 },
    ];
    expect(pickCallback(wellCleared)).toBe("did_well");
    const poorCleared: GameEvent[] = [
      { type: "turn_spoken", sceneId: "s", transcript: "", grade: "C", weakness: [], ts: 0 },
      { type: "episode_clear", episodeId: "e", stars: 1, ending: "x", affinity: 1, ts: 1 },
    ];
    expect(pickCallback(poorCleared)).toBe("welcome_back");
  });

  it("슬롯 채우기 — 골격 + 슬롯만(자유생성 X)", () => {
    expect(fillSlots("{origin}の人、初めてだよ", { origin: "韓国" })).toBe("韓国の人、初めてだよ");
    expect(fillSlots("{missing}です", {})).toBe("{missing}です");
  });
});
