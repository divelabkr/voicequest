import { describe, it, expect } from "vitest";
import { runTurn } from "./session";
import { initState, parseEpisode, buildReadModel } from "@voicequest/engine";
import type {
  SttPort,
  LlmPort,
  TtsPort,
  EventStorePort,
  GameEvent,
  JudgeResult,
} from "@voicequest/engine";

const ep = parseEpisode({
  id: "ep_t",
  title: "t",
  character: "daiki",
  scenes: [
    { id: "s1", intent: "인원", requiredSlots: [], allowedExpressions: ["一人です"], nextSceneId: "s2", modelAnswer: "一人です" },
    { id: "s2", intent: "주문", requiredSlots: [], allowedExpressions: ["ラーメン"], modelAnswer: "ラーメン" },
  ],
  endings: [{ id: "ok", minAffinity: 0, title: "o" }],
});

const stt: SttPort = { async transcribe() { return { text: "一人です", confidence: 0.9 }; } };
// 골격 미매칭 발화 — fast-path를 건너뛰고 mock LLM 판정 경로를 타게(미충족·inappropriate 검증용)
const sttMiss: SttPort = { async transcribe() { return { text: "ぜんぜんちがう", confidence: 0.9 }; } };
const tts: TtsPort = { async synth() { return "mock://audio.mp3"; } };

function makeStore() {
  const events: GameEvent[] = [];
  const store: EventStorePort = {
    async append(e) { events.push(e); },
    async readModel() { return buildReadModel(events); },
  };
  return { store, events };
}

function llmWith(jr: JudgeResult): LlmPort {
  return { async judge() { return jr; } };
}

describe("runTurn (1턴 오케스트레이션)", () => {
  it("STT→judge→advance→TTS→append가 한 턴에 돈다", async () => {
    const { store, events } = makeStore();
    const llm = llmWith({ grade: "S", matched: ["一人です"], weaknessTags: [], affinityDelta: 2, nextSceneId: "next", reason: "" });
    const { result, state } = await runTurn({ stt, llm, tts, store, episode: ep }, initState(ep), new ArrayBuffer(8), 0);
    expect(result.grade).toBe("S");
    expect(result.nextSceneId).toBe("s2");
    expect(result.audioUrl).toBe("mock://audio.mp3");
    expect(state.affinity).toBe(2);
    expect(events.some((e) => e.type === "turn_spoken")).toBe(true);
    expect(events.some((e) => e.type === "scene_advance")).toBe(true);
  });

  it("미충족이면 recovery로 제자리", async () => {
    const { store } = makeStore();
    const llm = llmWith({ grade: "C", matched: [], weaknessTags: [], affinityDelta: 0, nextSceneId: "recovery", reason: "" });
    const { result } = await runTurn({ stt: sttMiss, llm, tts, store, episode: ep }, initState(ep), new ArrayBuffer(8), 0);
    expect(result.nextSceneId).toBe("s1");
    expect(result.npcLine).toContain("もう一度");
  });

  it("오디오 없으면 판정 않고 '당신 차례'(발화트리 폴링·입장)", async () => {
    const { store } = makeStore();
    const llm = llmWith({ grade: "S", matched: ["x"], weaknessTags: [], affinityDelta: 2, nextSceneId: "next", reason: "" });
    const { result } = await runTurn({ stt, llm, tts, store, episode: ep }, initState(ep), new ArrayBuffer(0), 0);
    expect(result.awaitsUser).toBe(true);
    expect(result.grade).toBe("-");
  });

  it("못된 말(inappropriate)은 흡수 — 호감도 냉각·제자리·종료 X(규칙5)", async () => {
    const { store } = makeStore();
    const llm = llmWith({ grade: "C", matched: [], weaknessTags: [], affinityDelta: 0, nextSceneId: "recovery", reason: "", category: "inappropriate" });
    const { result } = await runTurn({ stt: sttMiss, llm, tts, store, episode: ep }, initState(ep), new ArrayBuffer(8), 0);
    expect(result.affinity).toBe(-1);
    expect(result.nextSceneId).toBe("s1");
    expect(result.done).toBe(false);
  });

  it("STT 실패는 폴백 — recovery 안내(서버 500 X)", async () => {
    const { store } = makeStore();
    const sttFail: SttPort = { async transcribe() { throw new Error("stt_down"); } };
    const llm = llmWith({ grade: "S", matched: ["x"], weaknessTags: [], affinityDelta: 2, nextSceneId: "next", reason: "" });
    const { result } = await runTurn({ stt: sttFail, llm, tts, store, episode: ep }, initState(ep), new ArrayBuffer(8), 0);
    expect(result.awaitsUser).toBe(true);
    expect(result.grade).toBe("-");
    expect(result.npcLine).toContain("もう一度");
  });

  it("TTS 실패는 폴백 — 자막만(판정은 정상)", async () => {
    const { store } = makeStore();
    const ttsFail: TtsPort = { async synth() { throw new Error("tts_down"); } };
    const llm = llmWith({ grade: "S", matched: ["一人です"], weaknessTags: [], affinityDelta: 2, nextSceneId: "next", reason: "" });
    const { result } = await runTurn({ stt, llm, tts: ttsFail, store, episode: ep }, initState(ep), new ArrayBuffer(8), 0);
    expect(result.audioUrl).toBe("");
    expect(result.grade).toBe("S");
  });
});
