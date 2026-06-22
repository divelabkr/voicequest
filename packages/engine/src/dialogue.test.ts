import { describe, it, expect } from "vitest";
import {
  startCursor,
  currentBeat,
  awaitsUser,
  ignoresUser,
  isSceneEnd,
} from "./dialogue";
import type { Scene } from "./types";

const scene: Scene = {
  id: "intro",
  intent: "환영",
  requiredSlots: [],
  allowedExpressions: ["はい"],
  beats: [
    { kind: "npc", line: "어서오세요!" },
    { kind: "npc_push", line: "아 잠깐, 자리부터 안내할게요" },
    { kind: "user" },
    { kind: "npc_silent", holdMs: 1500 },
  ],
};

describe("dialogue (발화 트리)", () => {
  it("NPC 능동 발화는 유저 입력을 기다리지 않는다", () => {
    const b = currentBeat(scene, startCursor(scene))!;
    expect(b.kind).toBe("npc");
    expect(awaitsUser(b)).toBe(false);
  });

  it("npc_push는 유저 발화를 무시한다(끼어듦 무시)", () => {
    const b = currentBeat(scene, { sceneId: "intro", beatIndex: 1 })!;
    expect(ignoresUser(b)).toBe(true);
  });

  it("user beat에서만 음성 게이트(발화 대기)", () => {
    const b = currentBeat(scene, { sceneId: "intro", beatIndex: 2 })!;
    expect(awaitsUser(b)).toBe(true);
  });

  it("npc_silent는 듣고도 무반응(무시)", () => {
    const b = currentBeat(scene, { sceneId: "intro", beatIndex: 3 })!;
    expect(b.kind).toBe("npc_silent");
    expect(ignoresUser(b)).toBe(true);
  });

  it("커서가 beats를 지나면 씬 끝", () => {
    expect(isSceneEnd(scene, { sceneId: "intro", beatIndex: 4 })).toBe(true);
    expect(isSceneEnd(scene, { sceneId: "intro", beatIndex: 0 })).toBe(false);
  });

  it("beats 없으면 단순 [user] 취급", () => {
    const plain: Scene = { id: "p", intent: "i", requiredSlots: [], allowedExpressions: [] };
    expect(awaitsUser(currentBeat(plain, startCursor(plain))!)).toBe(true);
  });
});
