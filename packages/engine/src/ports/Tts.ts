// TtsPort — 텍스트→음성 URL. NPC는 빌드타임 캐시(조회), 변주분만 실시간.
// 구현: adapters/tts-* (MiniMax/ElevenLabs 등).
export interface TtsPort {
  synth(text: string, voice: string, style?: string): Promise<string>;
}
