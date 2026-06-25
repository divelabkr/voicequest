// MusicPort — BGM/앰비언스/엔딩 음악 생성(빌드타임만, SynthID 표시). 구현: adapters/music-*.
// NPC 음성(TtsPort)과 별개: 이쪽은 배경음악·환경음·엔딩 테마. 산출은 압축 포맷 우선(§11).
export interface MusicSpec {
  prompt: string;
  durationSec: number;
  /** 루프 가능 BGM(에피소드 내 반복 재생) */
  loop: boolean;
  kind: "bgm" | "ambience" | "ending" | "jingle";
  /** 콜라주 어댑터용 — 캐시 음성 재활용 소스(없으면 prompt 기반 음악 모델 경로) */
  sources?: CollageSource[];
}

/** 콜라주 소스 — 캐시된 음성을 역할별 배치(pad=피치↓ 패드 / rhythm=박자 루프 / accent=악센트). */
export interface CollageSource {
  hash: string;
  role: "pad" | "rhythm" | "accent";
}

export interface AudioAsset {
  url: string;
  bytes: number;
  /** §11: opus 우선(고압축), m4a(aac)·mp3·wav 폴백 */
  format: "opus" | "m4a" | "mp3" | "wav";
  /** AI 생성물 표시(§9) */
  synthId: boolean;
}

export interface MusicPort {
  gen(spec: MusicSpec): Promise<AudioAsset>;
}
