// SttPort — 음성→전사. 구현은 adapters/stt-deepgram 등.
export interface Transcript {
  text: string;
  /** 0~1 신뢰도 — 신뢰도 게이트용 */
  confidence: number;
}

export interface SttPort {
  transcribe(audio: ArrayBuffer, lang: "ja"): Promise<Transcript>;
}

/** 스트리밍 전사 — interim(중간 추정)/final(확정). 발화 끝 final까지 흘려보냄. */
export interface StreamTranscript extends Transcript {
  isFinal: boolean;
}

/** 열린 스트림 핸들 — 발화 중 chunk를 push, 종료 시 close → 곧 final 콜백. */
export interface SttStream {
  push(chunk: ArrayBuffer): void;
  close(): Promise<void>;
}

/**
 * 스트리밍 STT — 발화 *중* 전사로 레이턴시 단축(일괄 ~1s → 발화 끝 즉시 ~0.3s).
 * fast-path가 judge를 0으로 만든 뒤 STT가 새 병목이라 도입. judge fast-path와 직결:
 * interim 전사가 allowedExpressions와 일찍 일치하면 발화 종료 전에 채점 준비 가능.
 * e2e 구현: 브라우저 MediaRecorder timeslice → server WS 프록시 → Deepgram Listen WS(wss).
 */
export interface SttStreamPort {
  openStream(lang: "ja", onResult: (r: StreamTranscript) => void): Promise<SttStream>;
}
