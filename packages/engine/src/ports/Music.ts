// MusicPort — BGM/앰비언스 생성(빌드타임만, SynthID 표시). 구현: adapters/music-*.
// NPC 음성(TtsPort)과 별개: 이쪽은 배경음악·환경음. 산출은 압축 포맷 우선(§11).
export interface MusicSpec {
  prompt: string;
  durationSec: number;
  /** 루프 가능 BGM(에피소드 내 반복 재생) */
  loop: boolean;
  kind: "bgm" | "ambience";
}

export interface AudioAsset {
  url: string;
  bytes: number;
  /** §11: opus 우선(고압축), mp3/wav는 폴백 */
  format: "opus" | "mp3" | "wav";
  /** AI 생성물 표시(§9) */
  synthId: boolean;
}

export interface MusicPort {
  gen(spec: MusicSpec): Promise<AudioAsset>;
}
