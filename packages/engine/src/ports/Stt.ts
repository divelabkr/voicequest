// SttPort — 음성→전사. 구현은 adapters/stt-deepgram 등.
export interface Transcript {
  text: string;
  /** 0~1 신뢰도 — 신뢰도 게이트용 */
  confidence: number;
}

export interface SttPort {
  transcribe(audio: ArrayBuffer, lang: "ja"): Promise<Transcript>;
}
