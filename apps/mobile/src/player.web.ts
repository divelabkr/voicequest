// 웹 음성 재생 — HTMLAudioElement.
export function playAudio(url: string): void {
  try {
    const a = new Audio(url);
    void a.play().catch(() => {});
  } catch {
    /* noop */
  }
}

// BGM — 루프 재생(엔딩 테마). 입장 시 분위기, 이탈 시 stopBgm.
let bgmEl: HTMLAudioElement | null = null;
export function playBgm(url: string): void {
  stopBgm();
  try {
    const a = new Audio(url);
    a.loop = true;
    a.volume = 0.45;
    void a.play().catch(() => {});
    bgmEl = a;
  } catch {
    /* noop */
  }
}
export function stopBgm(): void {
  if (bgmEl) { bgmEl.pause(); bgmEl = null; }
}
