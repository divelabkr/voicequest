// 웹 음성 재생 — HTMLAudioElement.
export function playAudio(url: string): void {
  try {
    const a = new Audio(url);
    void a.play().catch(() => {});
  } catch {
    /* noop */
  }
}
