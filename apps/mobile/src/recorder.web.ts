// 웹 녹음 — MediaRecorder + vad-web(Silero VAD) 자동 종료. 마이크 stream 하나를 공유해 누수 방지.
// VAD가 발화 끝(onSpeechEnd)을 감지하면 onAutoStop 호출 → 버튼 없이 자동 전송(§7). VAD 불가 시 수동.
import type { Recorder } from "./recorder";
import { MicVAD } from "@ricky0123/vad-web";

export function createRecorder(): Recorder {
  let mr: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let vad: { start: () => void; pause: () => void; destroy?: () => void } | null = null;
  let chunks: Blob[] = [];

  // [M4] VAD + 마이크 stream을 한 번에 정리(표시등 OFF, 누수 방지)
  function cleanup(): void {
    if (vad) { try { vad.pause(); vad.destroy?.(); } catch { /* noop */ } vad = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    mr = null;
  }

  return {
    async start(onAutoStop) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.start();
      if (onAutoStop) {
        try {
          // [M4] 같은 stream을 VAD에 공유 — 마이크 두 번 점유/누수 방지.
          //      (vad-web 버전이 stream 옵션을 지원하지 않으면 자체 stream을 쓰지만, destroy로 정리됨)
          vad = await MicVAD.new({ stream, onSpeechEnd: () => onAutoStop() } as Parameters<typeof MicVAD.new>[0]);
          vad.start();
        } catch { vad = null; } // VAD 불가 → 수동 녹음 유지
      }
    },
    stop() {
      return new Promise<Blob>((resolve) => {
        const m = mr;
        if (!m) { cleanup(); resolve(new Blob()); return; }
        m.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          cleanup(); // [M4] 정지 시 VAD·stream 모두 정리(마이크 표시등 OFF)
          resolve(blob);
        };
        m.stop();
      });
    },
  };
}
