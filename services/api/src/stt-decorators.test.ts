import { describe, it, expect, vi } from "vitest";
import { FallbackStt } from "./stt-decorators";
import type { Transcript } from "@voicequest/engine";

const tx = (text: string, confidence = 0.9): Transcript => ({ text, confidence });
const audio = new ArrayBuffer(8);

describe("FallbackStt — STT 폴백(Deepgram 장애 시 Gemini)", () => {
  it("primary 성공이면 fallback 미호출(1순위 유지)", async () => {
    const primary = { transcribe: vi.fn(async () => tx("一人です")) };
    const fallback = { transcribe: vi.fn(async () => tx("gemini")) };
    const r = await new FallbackStt(primary, fallback).transcribe(audio, "ja");
    expect(r.text).toBe("一人です");
    expect(fallback.transcribe).not.toHaveBeenCalled();
  });
  it("primary 빈 전사 → fallback 재시도", async () => {
    const primary = { transcribe: vi.fn(async () => tx("   ")) };
    const fallback = { transcribe: vi.fn(async () => tx("gemini")) };
    const r = await new FallbackStt(primary, fallback).transcribe(audio, "ja");
    expect(r.text).toBe("gemini");
    expect(fallback.transcribe).toHaveBeenCalledOnce();
  });
  it("primary throw(장애) → fallback", async () => {
    const primary = { transcribe: vi.fn(async () => { throw new Error("deepgram_down"); }) };
    const fallback = { transcribe: vi.fn(async () => tx("gemini")) };
    const r = await new FallbackStt(primary, fallback).transcribe(audio, "ja");
    expect(r.text).toBe("gemini");
    expect(fallback.transcribe).toHaveBeenCalledOnce();
  });
});
