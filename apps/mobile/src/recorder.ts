// 플랫폼별 음성 녹음 추상화 — Metro가 recorder.native.ts / recorder.web.ts를 자동 선택.
// 음성 게이트는 유지: 녹음 결과(Blob)를 그대로 postTurn에 보낸다.
export interface Recorder {
  // onAutoStop: 웹 VAD가 발화 끝을 감지하면 호출(자동 종료). 네이티브는 무시(수동).
  start(onAutoStop?: () => void): Promise<void>;
  stop(): Promise<Blob>;
}

// 이 기본 구현은 호출되지 않는다(플랫폼별 파일이 우선). 타입 앵커 + 안전망.
export function createRecorder(): Recorder {
  throw new Error("platform recorder not resolved");
}
