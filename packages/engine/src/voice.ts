// 플랫폼 음성 기초 — 캐릭터별 voice config. 운영자가 admin 음성 탭에서 청취·커스텀한다.
// Gemini prebuilt voice + speed/style 힌트. 이 프리셋이 트럼펫(캐릭터 음성 엔진) 커스텀의 기준값.
// cacheBuild가 이 프리셋으로 NPC 대사 음성을 사전 생성한다("NPC는 캐시").
export interface VoicePreset {
  characterId: string;
  label: string;
  voiceName: string; // Gemini prebuilt voice
  speed: number; // 0.8~1.2 (재생 배속 힌트)
  style: string; // 자연어 톤 힌트(생성 프롬프트 프리픽스)
}

// 청취·비교 가능한 prebuilt voice 후보(남성/여성 혼합)
export const VOICE_CANDIDATES = [
  "Puck",
  "Charon",
  "Fenrir",
  "Orus",
  "Kore",
  "Aoede",
  "Leda",
  "Zephyr",
] as const;

// 기본 프리셋 — 운영자 청취 후 admin 음성 탭에서 확정/덮어쓰기
export const DEFAULT_PRESETS: Record<string, VoicePreset> = {
  daiki: { characterId: "daiki", label: "다이키 · 라멘집", voiceName: "Fenrir", speed: 1.0, style: "활기차고 친근하게" },
  midori: { characterId: "midori", label: "미도리 · 대중교통", voiceName: "Aoede", speed: 1.0, style: "차분하고 정중하게" },
  sora: { characterId: "sora", label: "소라 · 학원", voiceName: "Leda", speed: 1.05, style: "또래답게 발랄하게" },
};
