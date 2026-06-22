// 네이티브(iOS/Android) 녹음 — expo-av. 녹음 파일 uri → Blob.
import { Audio } from "expo-av";
import type { Recorder } from "./recorder";

export function createRecorder(): Recorder {
  let rec: Audio.Recording | null = null;
  return {
    async start(_onAutoStop?: () => void) {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) throw new Error("마이크 권한 거부");
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      rec = (await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)).recording;
    },
    async stop() {
      if (!rec) return new Blob();
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      rec = null;
      if (!uri) return new Blob();
      return await (await fetch(uri)).blob();
    },
  };
}
