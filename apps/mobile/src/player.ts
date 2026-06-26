// 캐시 음성 재생 추상화 — Metro가 player.native.ts / player.web.ts를 자동 선택.
export function playAudio(_url: string): void {
  // 플랫폼별 구현이 우선(이 기본은 호출되지 않음)
}
export function playBgm(_url: string): void {
  // 플랫폼별 구현이 우선
}
export function stopBgm(): void {
  // 플랫폼별 구현이 우선
}
