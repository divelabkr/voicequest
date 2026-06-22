// ImagePort — 이미지 생성(빌드타임만, SynthID 자동). 구현: adapters/image-nanobanana.
// 캐릭터 일관성 위해 refs(레퍼런스) 지원. 산출은 압축 포맷 우선(§11).
export interface ImageSpec {
  prompt: string;
  kind: "character" | "background";
  /** 캐릭터 일관성용 레퍼런스 이미지(같은 얼굴 유지) */
  refs?: string[];
}

export interface VisualAsset {
  url: string;
  bytes: number;
  /** §11: avif/webp 우선, png는 폴백 */
  format: "avif" | "webp" | "png";
  /** AI 생성물 표시(§9) — SynthID 등 */
  synthId: boolean;
}

export interface ImagePort {
  gen(spec: ImageSpec): Promise<VisualAsset>;
}
