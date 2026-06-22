// 네이티브 음성 재생 — expo-av Audio.Sound.
import { Audio } from "expo-av";

export function playAudio(url: string): void {
  Audio.Sound.createAsync({ uri: url }, { shouldPlay: true })
    .then(({ sound }) => {
      sound.setOnPlaybackStatusUpdate((s) => {
        if ("didJustFinish" in s && s.didJustFinish) void sound.unloadAsync();
      });
    })
    .catch(() => {});
}
