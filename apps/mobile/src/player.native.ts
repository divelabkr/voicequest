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

// BGM — 루프 재생(엔딩 테마). 입장 시 분위기, 탈퇴/이탈 시 stopBgm.
let bgmSound: Audio.Sound | null = null;
export function playBgm(url: string): void {
  stopBgm();
  Audio.Sound.createAsync({ uri: url }, { shouldPlay: true, isLooping: true, volume: 0.45 })
    .then(({ sound }) => { bgmSound = sound; })
    .catch(() => {});
}
export function stopBgm(): void {
  if (bgmSound) { void bgmSound.unloadAsync(); bgmSound = null; }
}
